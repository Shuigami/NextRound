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
from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AuthSession, User

router = APIRouter(prefix="/api")
COOKIE = "nextround_session"
SESSION_TTL = timedelta(days=60)
PREF_KEY = re.compile(r"^nextround:[A-Za-z:]{1,60}$")
PREFS_MAX_BYTES = 64_000
STATE_COOKIE = "nextround_oauth_state"
GOOGLE_ONLY = "Ce compte utilise la connexion Google."
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
    if not 8 <= len(c.password) <= 200:
        raise HTTPException(422, "Le mot de passe doit contenir au moins 8 caractères.")
    return email, c.password


def _open_session(db: Session, user: User, response: Response) -> dict:
    token = secrets.token_urlsafe(32)
    db.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, expires_at=datetime.now(UTC) + SESSION_TTL))
    db.commit()
    # SameSite=Lax : le cookie n'accompagne pas un POST venu d'un autre site (protège des requêtes forgées).
    response.set_cookie(COOKIE, token, max_age=int(SESSION_TTL.total_seconds()), httponly=True, samesite="lax", path="/")
    return {"email": user.email, "prefs": user.prefs or {}}


def current_user(db: Session = Depends(get_db), nextround_session: str | None = Cookie(None)) -> User:
    if nextround_session:
        s = db.get(AuthSession, _token_hash(nextround_session))
        if s and s.expires_at > datetime.now(UTC):
            return db.get(User, s.user_id)
    raise HTTPException(401, "Non connecté.")


@router.post("/auth/register")
def register(c: Credentials, response: Response, db: Session = Depends(get_db)):
    email, password = _clean(c)
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        # Jamais de mot de passe ajouté ici : sans vérification de l'adresse, ce serait prendre le compte d'un autre.
        raise HTTPException(409, GOOGLE_ONLY if existing.password_hash is None else "Un compte existe déjà avec cette adresse.")
    user = User(email=email, password_hash=hash_password(password), prefs={}, created_at=datetime.now(UTC))
    db.add(user)
    db.flush()
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
    return {"email": user.email, "prefs": user.prefs or {}}


@router.put("/me/prefs")
def save_prefs(prefs: dict[str, str], user: User = Depends(current_user), db: Session = Depends(get_db)):
    if any(not PREF_KEY.match(k) for k in prefs) or len(json.dumps(prefs)) > PREFS_MAX_BYTES:
        raise HTTPException(422, "Préférences invalides.")
    user.prefs = prefs
    db.commit()
    return {"ok": True}


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
        if user.password_hash is not None:
            # Le mot de passe a pu être choisi par quelqu'un d'autre (adresses non vérifiées à l'inscription) :
            # Google prouve la propriété de l'adresse, on retire donc ce mot de passe et ses sessions.
            user.password_hash = None
            db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        user.google_sub = claims["sub"]
    else:
        user = User(email=email, password_hash=None, google_sub=claims["sub"], prefs={}, created_at=datetime.now(UTC))
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
