"""Comptes facultatifs. Sans compte, tout fonctionne : les préférences restent dans le navigateur."""

import base64
import hashlib
import hmac
import json
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, BackgroundTasks, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .mail import send_mail
from .models import AuthSession, EmailToken, User

router = APIRouter(prefix="/api")
COOKIE = "nextround_session"
SESSION_TTL = timedelta(days=60)
PREF_KEY = re.compile(r"^nextround:[A-Za-z:]{1,60}$")
PREFS_MAX_BYTES = 64_000
STATE_COOKIE = "nextround_oauth_state"
GOOGLE_ONLY = "Ce compte utilise la connexion Google."
TOKEN_TTL = {"verify": timedelta(hours=48), "reset": timedelta(hours=1)}
RESEND_DELAY = timedelta(minutes=2)  # évite d'inonder une boîte mail
USERNAME = re.compile(r"^[a-z0-9_]{3,20}$")
AVATAR_MAX_BYTES = 300_000
log = logging.getLogger("nextround")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${h.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, salt, h = stored.split("$")
        got = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1)
    except ValueError:
        return False
    return hmac.compare_digest(got.hex(), h)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class Credentials(BaseModel):
    email: str
    password: str


def _clean(c: Credentials) -> tuple[str, str]:
    email = c.email.strip().casefold()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
        raise HTTPException(422, "Adresse e-mail invalide.")
    _check_new_password(c.password)
    return email, c.password


def _check_new_password(password: str) -> None:
    if not 8 <= len(password) <= 200:
        raise HTTPException(422, "Le mot de passe doit contenir au moins 8 caractères.")


def account_out(user: User) -> dict:
    return {
        "email": user.email, "username": user.username, "email_verified": user.email_verified_at is not None,
        "has_password": user.password_hash is not None, "google": user.google_sub is not None,
        "avatar_url": f"/api/me/avatar?v={user.avatar_version}" if user.avatar_type else None,
    }


def _open_session(db: Session, user: User, response: Response) -> dict:
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, expires_at=datetime.now(UTC) + SESSION_TTL))
    db.commit()
    # SameSite=Lax : le cookie n'accompagne pas un POST venu d'un autre site (protège des requêtes forgées).
    response.set_cookie(COOKIE, token, max_age=int(SESSION_TTL.total_seconds()), httponly=True, samesite="lax", path="/")
    return {**account_out(user), "prefs": user.prefs or {}}


def current_user(db: Session = Depends(get_db), nextround_session: str | None = Cookie(None)) -> User:
    if nextround_session:
        s = db.get(AuthSession, _token_hash(nextround_session))
        if s and s.expires_at > datetime.now(UTC):
            return db.get(User, s.user_id)
    raise HTTPException(401, "Non connecté.")


@router.post("/auth/register")
def register(c: Credentials, response: Response, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    email, password = _clean(c)
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        # Jamais de mot de passe ajouté ici : sans vérification de l'adresse, ce serait prendre le compte d'un autre.
        raise HTTPException(409, GOOGLE_ONLY if existing.password_hash is None else "Un compte existe déjà avec cette adresse.")
    user = User(email=email, password_hash=hash_password(password), prefs={}, created_at=datetime.now(UTC))
    db.add(user)
    db.flush()
    _send_verification(db, user, tasks)
    return _open_session(db, user, response)


@router.post("/auth/login")
def login(c: Credentials, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == c.email.strip().casefold()))
    if user and user.password_hash is None:
        raise HTTPException(401, GOOGLE_ONLY)
    if not user or not check_password(c.password, user.password_hash):
        raise HTTPException(401, "E-mail ou mot de passe incorrect.")
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.expires_at < func.now()))
    return _open_session(db, user, response)


@router.post("/auth/logout")
def logout(response: Response, db: Session = Depends(get_db), nextround_session: str | None = Cookie(None)):
    if nextround_session:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(nextround_session)))
        db.commit()
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {**account_out(user), "prefs": user.prefs or {}}


@router.put("/me/prefs")
def save_prefs(prefs: dict[str, str], user: User = Depends(current_user), db: Session = Depends(get_db)):
    if any(not PREF_KEY.match(k) for k in prefs) or len(json.dumps(prefs)) > PREFS_MAX_BYTES:
        raise HTTPException(422, "Préférences invalides.")
    user.prefs = prefs
    db.commit()
    return {"ok": True}


# --- Liens envoyés par e-mail (vérification, mot de passe oublié) ---


def _issue_token(db: Session, user: User, purpose: str) -> str | None:
    """Nouveau lien à usage unique, ou None si un lien vient d'être envoyé."""
    now = datetime.now(UTC)
    recent = db.scalar(select(EmailToken.created_at).where(
        EmailToken.user_id == user.id, EmailToken.purpose == purpose, EmailToken.created_at > now - RESEND_DELAY))
    if recent:
        return None
    token = secrets.token_urlsafe(32)
    db.add(EmailToken(token_hash=_token_hash(token), user_id=user.id, purpose=purpose, created_at=now,
                      expires_at=now + TOKEN_TTL[purpose]))
    return token


def _consume_token(db: Session, token: str, purpose: str) -> User | None:
    t = db.get(EmailToken, _token_hash(token))
    if not t or t.purpose != purpose:
        return None
    db.delete(t)
    return db.get(User, t.user_id) if t.expires_at > datetime.now(UTC) else None


def _base_url() -> str:
    return get_settings().public_url.rstrip("/")


def _send_verification(db: Session, user: User, tasks: BackgroundTasks) -> bool:
    token = _issue_token(db, user, "verify")
    if token:
        link = f"{_base_url()}/api/auth/verify?token={token}"
        tasks.add_task(send_mail, user.email, "Confirmez votre adresse NextRound",
                       f"Bonjour,\n\nPour confirmer votre adresse, ouvrez ce lien (valable 48 h) :\n{link}\n\n"
                       "Si vous n'avez pas créé de compte NextRound, ignorez ce message.")
    return token is not None


@router.get("/auth/verify")
def verify_email(token: str = "", db: Session = Depends(get_db)):
    user = _consume_token(db, token, "verify") if token else None
    if user and user.email_verified_at is None:
        user.email_verified_at = datetime.now(UTC)
    db.commit()
    return RedirectResponse(f"/compte?verifie={'ok' if user else 'invalide'}", status_code=302)


@router.post("/me/verify-email")
def resend_verification(tasks: BackgroundTasks, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.email_verified_at:
        return {"sent": False}
    sent = _send_verification(db, user, tasks)
    db.commit()
    if not sent:
        raise HTTPException(429, "Un e-mail vient d'être envoyé. Patientez deux minutes avant d'en redemander un.")
    return {"sent": True}


class Forgot(BaseModel):
    email: str


@router.post("/auth/forgot")
def forgot_password(f: Forgot, tasks: BackgroundTasks, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == f.email.strip().casefold()))
    token = _issue_token(db, user, "reset") if user else None
    if token:
        link = f"{_base_url()}/compte/reinitialiser?token={token}"
        tasks.add_task(send_mail, user.email, "Réinitialiser votre mot de passe NextRound",
                       f"Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 h) :\n{link}\n\n"
                       "Si vous n'avez rien demandé, ignorez ce message : votre mot de passe ne change pas.")
    db.commit()
    return {"ok": True}  # même réponse que l'adresse existe ou non


class Reset(BaseModel):
    token: str
    password: str


@router.post("/auth/reset")
def reset_password(r: Reset, response: Response, db: Session = Depends(get_db)):
    _check_new_password(r.password)
    user = _consume_token(db, r.token, "reset")
    if not user:
        db.commit()
        raise HTTPException(400, "Ce lien est invalide ou a expiré. Demandez-en un nouveau.")
    user.password_hash = hash_password(r.password)
    user.email_verified_at = user.email_verified_at or datetime.now(UTC)  # le lien prouve la propriété de l'adresse
    # Toutes les sessions et les autres liens de réinitialisation tombent : quelqu'un a peut-être l'ancien mot de passe.
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.execute(delete(EmailToken).where(EmailToken.user_id == user.id, EmailToken.purpose == "reset"))
    return _open_session(db, user, response)


# --- Profil : nom d'utilisateur et photo ---


class Profile(BaseModel):
    username: str | None


@router.patch("/me")
def update_profile(p: Profile, user: User = Depends(current_user), db: Session = Depends(get_db)):
    username = (p.username or "").strip().casefold() or None
    if username and not USERNAME.match(username):
        raise HTTPException(422, "Nom d'utilisateur : 3 à 20 caractères, lettres, chiffres ou _.")
    if username and db.scalar(select(User.id).where(User.username == username, User.id != user.id)):
        raise HTTPException(409, "Ce nom d'utilisateur est déjà pris.")
    user.username = username
    db.commit()
    return account_out(user)


def _image_type(data: bytes) -> str | None:
    """Type réel d'après les premiers octets, pas l'en-tête envoyé. Jamais de SVG : il peut contenir du script."""
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _avatar_body(request: Request) -> bytes:
    data = b""
    async for chunk in request.stream():
        data += chunk
        if len(data) > AVATAR_MAX_BYTES:
            raise HTTPException(413, "Image trop lourde (300 Ko maximum).")
    return data


@router.put("/me/avatar")
def upload_avatar(data: bytes = Depends(_avatar_body), user: User = Depends(current_user), db: Session = Depends(get_db)):
    kind = _image_type(data)
    if not kind:
        raise HTTPException(415, "Format d'image non pris en charge (JPEG, PNG ou WebP).")
    user.avatar, user.avatar_type, user.avatar_version = data, kind, (user.avatar_version or 0) + 1
    db.commit()
    return account_out(user)


@router.delete("/me/avatar")
def delete_avatar(user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.avatar = user.avatar_type = None
    db.commit()
    return account_out(user)


@router.get("/me/avatar")
def get_avatar(user: User = Depends(current_user)):
    if not user.avatar_type:
        raise HTTPException(404, "Pas de photo de profil.")
    # L'URL change à chaque nouvelle photo (?v=) : elle peut rester longtemps en cache.
    return Response(user.avatar, media_type=user.avatar_type,
                    headers={"Cache-Control": "private, max-age=31536000", "X-Content-Type-Options": "nosniff"})


# --- Connexion Google (OpenID Connect, flux « code ») ---


def _redirect_uri() -> str:
    return f"{get_settings().public_url.rstrip('/')}/api/auth/google/callback"


def _google_claims(code: str) -> dict:
    """Échange le code contre l'identité Google. Le jeton vient directement de Google en HTTPS, authentifié par notre
    secret : sa signature n'a pas besoin d'être revérifiée (recommandation Google pour ce flux)."""
    s = get_settings()
    r = httpx.post("https://oauth2.googleapis.com/token", timeout=10, data={
        "code": code, "client_id": s.google_client_id, "client_secret": s.google_client_secret,
        "redirect_uri": _redirect_uri(), "grant_type": "authorization_code",
    })
    r.raise_for_status()
    payload = r.json()["id_token"].split(".")[1]
    claims = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    if claims.get("aud") != s.google_client_id or claims.get("iss") not in ("https://accounts.google.com", "accounts.google.com"):
        raise ValueError("Jeton Google inattendu")
    return claims


def google_user(db: Session, claims: dict) -> User:
    """Retrouve ou crée le compte. Une adresse = un compte : Google se relie au compte e-mail existant."""
    if not claims.get("email_verified") or not claims.get("email") or not claims.get("sub"):
        raise ValueError("Adresse Google non vérifiée")
    user = db.scalar(select(User).where(User.google_sub == claims["sub"]))
    if user:
        return user
    email = claims["email"].strip().casefold()
    user = db.scalar(select(User).where(User.email == email))
    if user:
        if user.password_hash is not None and user.email_verified_at is None:
            # Adresse jamais vérifiée : le mot de passe a pu être choisi par quelqu'un d'autre.
            # Google prouve la propriété de l'adresse, on retire donc ce mot de passe et ses sessions.
            user.password_hash = None
            db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        user.google_sub = claims["sub"]
        user.email_verified_at = user.email_verified_at or datetime.now(UTC)
    else:
        user = User(email=email, password_hash=None, google_sub=claims["sub"], prefs={}, created_at=datetime.now(UTC),
                    email_verified_at=datetime.now(UTC))
        db.add(user)
    db.flush()
    return user


@router.get("/auth/providers")
def providers():
    return {"google": bool(get_settings().google_client_id and get_settings().google_client_secret)}


@router.get("/auth/google")
def google_start():
    if not providers()["google"]:
        raise HTTPException(404, "Connexion Google non configurée.")
    state = secrets.token_urlsafe(24)
    query = urlencode({
        "client_id": get_settings().google_client_id, "redirect_uri": _redirect_uri(), "response_type": "code",
        "scope": "openid email", "state": state, "prompt": "select_account",
    })
    response = RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{query}", status_code=302)
    # Le `state` relie le retour de Google à ce navigateur : il bloque une connexion forcée depuis un autre site.
    response.set_cookie(STATE_COOKIE, state, max_age=600, httponly=True, samesite="lax", path="/api/auth/google")
    return response


@router.get("/auth/google/callback")
def google_callback(
    code: str | None = None, state: str | None = None, db: Session = Depends(get_db),
    nextround_oauth_state: str | None = Cookie(None),
):
    failed = RedirectResponse("/compte?erreur=google", status_code=302)
    if not code or not state or not nextround_oauth_state or not hmac.compare_digest(state, nextround_oauth_state):
        return failed  # aussi quand la personne annule chez Google
    try:
        user = google_user(db, _google_claims(code))
    except (httpx.HTTPError, ValueError, KeyError):
        log.warning("Connexion Google en échec", exc_info=True)
        db.rollback()
        return failed
    response = RedirectResponse("/compte", status_code=302)
    response.delete_cookie(STATE_COOKIE, path="/api/auth/google")
    _open_session(db, user, response)
    return response
