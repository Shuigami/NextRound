"""Comptes sur la vraie base (Postgres). L'utilisateur de test est supprimé à la fin."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, text

from app import auth
from app.auth import GOOGLE_ONLY, check_password, google_user, hash_password
from app.db import SessionLocal
from app.main import app
from app.models import User

EMAIL = "test-auth@nextround.invalid"


@pytest.fixture
def client():
    try:
        with SessionLocal() as s:
            s.execute(text("select 1"))
    except Exception:
        pytest.skip("PostgreSQL indisponible")
    yield TestClient(app)  # sans `with` : pas de lifespan, donc pas de synchronisation
    with SessionLocal() as s:
        s.execute(delete(User).where(User.email == EMAIL))
        s.commit()


def test_password_hash_roundtrip():
    h = hash_password("motdepasse")
    assert check_password("motdepasse", h) and not check_password("autre", h) and not check_password("x", "corrompu")


def test_register_sync_logout_login(client):
    assert client.get("/api/me").status_code == 401
    assert client.post("/api/auth/register", json={"email": EMAIL, "password": "court"}).status_code == 422
    r = client.post("/api/auth/register", json={"email": f" {EMAIL.upper()} ", "password": "motdepasse"})
    assert r.status_code == 200 and r.json() == {"email": EMAIL, "prefs": {}}
    assert client.post("/api/auth/register", json={"email": EMAIL, "password": "motdepasse"}).status_code == 409

    prefs = {"nextround:demo:favorites": '{"teams":[3],"orgs":[],"editions":[]}', "nextround:spoilerFree": "1"}
    assert client.put("/api/me/prefs", json=prefs).status_code == 200
    assert client.put("/api/me/prefs", json={"autre:cle": "x"}).status_code == 422
    assert client.get("/api/me").json()["prefs"] == prefs

    client.post("/api/auth/logout")
    assert client.get("/api/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "mauvais!"}).status_code == 401
    r = client.post("/api/auth/login", json={"email": EMAIL, "password": "motdepasse"})
    assert r.json()["prefs"] == prefs


def claims(sub="g-test-1"):
    return {"sub": sub, "email": EMAIL, "email_verified": True}


def test_google_account_has_no_password_and_blocks_email_signup(client):
    with SessionLocal() as s:
        google_user(s, claims())
        s.commit()
    r = client.post("/api/auth/register", json={"email": EMAIL, "password": "motdepasse"})
    assert r.status_code == 409 and r.json()["detail"] == GOOGLE_ONLY
    r = client.post("/api/auth/login", json={"email": EMAIL, "password": "motdepasse"})
    assert r.status_code == 401 and r.json()["detail"] == GOOGLE_ONLY


def test_google_link_removes_password_and_its_sessions(client):
    client.post("/api/auth/register", json={"email": EMAIL, "password": "motdepasse"})
    assert client.get("/api/me").status_code == 200
    with SessionLocal() as s:
        u = google_user(s, claims())
        assert u.password_hash is None and u.google_sub == "g-test-1"
        s.commit()
        assert google_user(s, claims()).id == u.id  # reconnexion : même compte
    assert client.get("/api/me").status_code == 401, "la session ouverte avec l'ancien mot de passe est fermée"
    with SessionLocal() as s:
        with pytest.raises(ValueError):
            google_user(s, {**claims("g-autre"), "email_verified": False})


def test_google_callback_checks_state_then_opens_session(client, monkeypatch):
    monkeypatch.setattr(auth, "_google_claims", lambda code: claims())
    r = client.get("/api/auth/google/callback?code=c&state=forge", follow_redirects=False)
    assert r.headers["location"] == "/compte?erreur=google"
    client.cookies.set(auth.STATE_COOKIE, "bon", path="/api/auth/google")
    r = client.get("/api/auth/google/callback?code=c&state=bon", follow_redirects=False)
    assert r.headers["location"] == "/compte"
    assert client.get("/api/me").json()["email"] == EMAIL
