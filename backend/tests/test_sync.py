"""Synchronisation sur la vraie base (Postgres). Les lignes utilisent la source "test" puis sont supprimées."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, select, text

from app.db import SessionLocal
from app.models import Competition, Edition, Match, Organization, Phase, Player, Team
from app.providers.demo import build
from app.sync import apply_batch

SRC = "test"


@pytest.fixture
def db():
    try:
        session = SessionLocal()
        session.execute(text("select 1"))
    except Exception:
        pytest.skip("PostgreSQL indisponible")
    yield session
    session.rollback()
    for model in (Match, Phase, Player, Edition, Team, Organization, Competition):
        session.execute(delete(model).where(model.source == SRC))
    session.commit()
    session.close()


def test_sync_is_idempotent_and_applies_corrections_and_reschedules(db):
    now = datetime.now(UTC)
    apply_batch(db, SRC, build(), now)
    db.commit()
    count = db.scalar(select(Match.id).where(Match.source == SRC).order_by(Match.id.desc()).limit(1))
    total = len(db.scalars(select(Match).where(Match.source == SRC)).all())

    b = build()
    b.matches["lol-a1"].score1, b.matches["lol-a1"].score2 = 0, 1  # correction de résultat
    b.matches["lol-a1"].winner_source_id = "lol-bas"
    b.matches["lol-a5"].status = "postponed"
    b.matches["lol-a5"].scheduled_at = now + timedelta(days=3)
    del b.teams["lol-nov"].players[0]  # un joueur quitte l'effectif
    apply_batch(db, SRC, b, now)
    db.commit()

    assert len(db.scalars(select(Match).where(Match.source == SRC)).all()) == total
    assert db.scalar(select(Match.id).where(Match.source == SRC).order_by(Match.id.desc()).limit(1)) == count
    a1 = db.scalar(select(Match).where(Match.source == SRC, Match.source_id == "lol-a1"))
    assert (a1.score1, a1.score2, a1.winner_id) == (0, 1, a1.team2_id)
    a5 = db.scalar(select(Match).where(Match.source == SRC, Match.source_id == "lol-a5"))
    assert a5.status == "postponed" and a5.scheduled_at > now + timedelta(days=2)
    nova = db.scalar(select(Team).where(Team.source == SRC, Team.source_id == "lol-nov"))
    assert len(nova.players) == 4
    # Une organisation regroupe les équipes de plusieurs jeux.
    assert len(nova.organization.teams) == 4


def test_older_provider_version_does_not_overwrite_newer(db):
    now = datetime.now(UTC)
    b = build()
    b.matches["lol-a1"].modified_at = now
    apply_batch(db, SRC, b, now)
    db.commit()
    old = build()
    old.matches["lol-a1"].modified_at = now - timedelta(hours=1)
    old.matches["lol-a1"].score1 = 9
    apply_batch(db, SRC, old, now)
    db.commit()
    assert db.scalar(select(Match.score1).where(Match.source == SRC, Match.source_id == "lol-a1")) == 1


def test_unknown_links_do_not_erase_known_ones(db):
    now = datetime.now(UTC)
    apply_batch(db, SRC, build(), now)
    db.commit()
    b = build()
    b.matches["lol-f"].previous = None  # ex. liste « upcoming » PandaScore, sans previous_matches
    apply_batch(db, SRC, b, now)
    db.commit()
    f = db.scalar(select(Match).where(Match.source == SRC, Match.source_id == "lol-f"))
    assert [p["source_id"] for p in f.previous] == ["lol-s1", "lol-s2"]
