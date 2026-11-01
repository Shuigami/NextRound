"""Comptes sur la vraie base (Postgres). L'utilisateur de test est supprimé à la fin."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, text

from app.auth import check_password, hash_password
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
