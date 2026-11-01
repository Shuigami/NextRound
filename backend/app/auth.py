"""Comptes facultatifs. Sans compte, tout fonctionne : les préférences restent dans le navigateur."""

import hashlib
import hmac
import json
import re
import secrets
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from .db import get_db
from .models import AuthSession, User

router = APIRouter(prefix="/api")
COOKIE = "nextround_session"
SESSION_TTL = timedelta(days=60)
PREF_KEY = re.compile(r"^nextround:[A-Za-z:]{1,60}$")
PREFS_MAX_BYTES = 64_000


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
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Un compte existe déjà avec cette adresse.")
    user = User(email=email, password_hash=hash_password(password), prefs={}, created_at=datetime.now(UTC))
    db.add(user)
    db.flush()
    return _open_session(db, user, response)


@router.post("/auth/login")
def login(c: Credentials, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == c.email.strip().casefold()))
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
