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
EMAIL2 = "test-auth-2@nextround.invalid"


@pytest.fixture
def client():
    try:
        with SessionLocal() as s:
            s.execute(text("select 1"))
    except Exception:
        pytest.skip("PostgreSQL indisponible")
    yield TestClient(app)  # sans `with` : pas de lifespan, donc pas de synchronisation
    with SessionLocal() as s:
        s.execute(delete(User).where(User.email.in_([EMAIL, EMAIL2])))
        s.commit()


@pytest.fixture
def mails(monkeypatch):
    sent = []
    monkeypatch.setattr(auth, "send_mail", lambda to, subject, body: sent.append((to, body)))
    return sent


def link_token(mails) -> str:
    return mails[-1][1].split("token=")[1].split()[0]


def test_password_hash_roundtrip():
    h = hash_password("motdepasse")
    assert check_password("motdepasse", h) and not check_password("autre", h) and not check_password("x", "corrompu")


def test_register_sync_logout_login(client):
    assert client.get("/api/me").status_code == 401
    assert client.post("/api/auth/register", json={"email": EMAIL, "password": "court"}).status_code == 422
    r = client.post("/api/auth/register", json={"email": f" {EMAIL.upper()} ", "password": "motdepasse"})
    assert r.status_code == 200 and r.json()["email"] == EMAIL and r.json()["prefs"] == {}
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


def test_email_verification_link_is_single_use(client, mails):
    client.post("/api/auth/register", json={"email": EMAIL, "password": "motdepasse"})
    assert client.get("/api/me").json()["email_verified"] is False
    assert mails[0][0] == EMAIL
    token = link_token(mails)
    r = client.get(f"/api/auth/verify?token={token}", follow_redirects=False)
    assert r.headers["location"] == "/compte?verifie=ok"
    assert client.get("/api/me").json()["email_verified"] is True
    r = client.get(f"/api/auth/verify?token={token}", follow_redirects=False)
    assert r.headers["location"] == "/compte?verifie=invalide"


def test_resend_verification_is_throttled(client, mails):
    client.post("/api/auth/register", json={"email": EMAIL, "password": "motdepasse"})
    assert client.post("/api/me/verify-email").status_code == 429, "un e-mail vient de partir à l'inscription"
    assert len(mails) == 1


def test_password_reset_changes_password_and_closes_sessions(client, mails):
    client.post("/api/auth/register", json={"email": EMAIL, "password": "ancienmdp"})
    assert client.post("/api/auth/forgot", json={"email": "inconnu@nextround.invalid"}).json() == {"ok": True}
    client.post("/api/auth/forgot", json={"email": EMAIL})
    token = link_token(mails)
    other = TestClient(app)
    assert other.post("/api/auth/reset", json={"token": token, "password": "court"}).status_code == 422
    r = other.post("/api/auth/reset", json={"token": token, "password": "nouveaumdp"})
    assert r.status_code == 200 and r.json()["email_verified"] is True
    assert client.get("/api/me").status_code == 401, "l'ancienne session est fermée"
    assert other.post("/api/auth/reset", json={"token": token, "password": "nouveaumdp"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "ancienmdp"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": EMAIL, "password": "nouveaumdp"}).status_code == 200


def test_reset_lets_a_google_account_add_a_password(client, mails):
    with SessionLocal() as s:
        google_user(s, claims())
        s.commit()
    client.post("/api/auth/forgot", json={"email": EMAIL})
    r = client.post("/api/auth/reset", json={"token": link_token(mails), "password": "nouveaumdp"})
    assert r.json()["has_password"] is True and r.json()["google"] is True


def test_google_keeps_password_of_a_verified_account(client, mails):
    client.post("/api/auth/register", json={"email": EMAIL, "password": "motdepasse"})
    client.get(f"/api/auth/verify?token={link_token(mails)}")
    with SessionLocal() as s:
        assert google_user(s, claims()).password_hash is not None
        s.commit()
    assert client.get("/api/me").status_code == 200


def test_username_is_validated_lowercased_and_unique(client):
    client.post("/api/auth/register", json={"email": EMAIL, "password": "motdepasse"})
    assert client.patch("/api/me", json={"username": "a!"}).status_code == 422
    assert client.patch("/api/me", json={"username": " Shui_42 "}).json()["username"] == "shui_42"
    other = TestClient(app)
    other.post("/api/auth/register", json={"email": EMAIL2, "password": "motdepasse"})
    assert other.patch("/api/me", json={"username": "SHUI_42"}).status_code == 409
    assert client.patch("/api/me", json={"username": None}).json()["username"] is None


PNG = b"\x89PNG\r\n\x1a\n" + b"\0" * 32


def test_avatar_upload_checks_real_type_and_size(client):
    client.post("/api/auth/register", json={"email": EMAIL, "password": "motdepasse"})
    svg = b"<svg onload=alert(1)>"
    assert client.put("/api/me/avatar", content=svg, headers={"Content-Type": "image/png"}).status_code == 415
    assert client.put("/api/me/avatar", content=PNG + b"\0" * 300_000).status_code == 413
    r = client.put("/api/me/avatar", content=PNG)
    url = r.json()["avatar_url"]
    got = client.get(url)
    assert got.content == PNG and got.headers["content-type"] == "image/png"
    assert client.put("/api/me/avatar", content=PNG).json()["avatar_url"] != url, "nouvelle URL à chaque photo"
    assert client.delete("/api/me/avatar").json()["avatar_url"] is None
    assert client.get(url).status_code == 404
