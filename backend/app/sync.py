"""Synchronisation centralisée : un fournisseur → la base. Idempotent (upsert par source + source_id)."""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .models import Competition, Edition, Match, Organization, Phase, Player, SyncState, Team
from .providers.base import Batch, Provider, PTeam

log = logging.getLogger("nextround.sync")
ROSTER_MAX_AGE = timedelta(hours=24)


def get_provider() -> Provider:
    s = get_settings()
    if s.data_mode == "pandascore":
        from .providers.pandascore import PandaScoreProvider

        return PandaScoreProvider(s.pandascore_token, s.pandascore_base_url)
    from .providers.demo import DemoProvider

    return DemoProvider()


def _upsert(db: Session, model, source: str, source_id: str, cache: dict, **fields):
    key = (model, source_id)
    obj = cache.get(key) or db.scalar(select(model).where(model.source == source, model.source_id == source_id))
    if obj is None:
        obj = model(source=source, source_id=source_id)
        db.add(obj)
    for k, v in fields.items():
        setattr(obj, k, v)
    cache[key] = obj
    return obj


def _team(db: Session, source: str, t: PTeam, now: datetime, cache: dict) -> Team:
    org = None
    if t.org_key:
        org = cache.get((Organization, t.org_key)) or db.scalar(
            select(Organization).where(Organization.source == source, Organization.source_id == t.org_key)
        )
        if org is None:
            org = _upsert(db, Organization, source, t.org_key, cache, name=t.org_name or t.name, logo_url=t.logo_url)
        cache[(Organization, t.org_key)] = org
    team = _upsert(db, Team, source, t.source_id, cache, game=t.game, name=t.name, acronym=t.acronym,
                   logo_url=t.logo_url, location=t.location, organization=org, synced_at=now)
    if t.players is not None:
        seen = set()
        for p in t.players:
            seen.add(p.source_id)
            _upsert(db, Player, source, p.source_id, cache, team=team, handle=p.handle, first_name=p.first_name,
                    last_name=p.last_name, role=p.role, nationality=p.nationality, photo_url=p.photo_url)
        for old in list(team.players):
            if old.source_id not in seen:
                old.team = None  # parti de l'équipe : on garde le joueur, on le détache
        team.roster_synced_at = now
    return team


def apply_batch(db: Session, source: str, batch: Batch, now: datetime) -> int:
    cache: dict = {}
    for c in batch.competitions.values():
        _upsert(db, Competition, source, c.source_id, cache, game=c.game, name=c.name, logo_url=c.logo_url, synced_at=now)
    teams = {sid: _team(db, source, t, now, cache) for sid, t in batch.teams.items()}

    def team_ref(sid):
        if not sid:
            return None
        return teams.get(sid) or db.scalar(select(Team).where(Team.source == source, Team.source_id == sid))

    for e in batch.editions.values():
        _upsert(db, Edition, source, e.source_id, cache, competition=cache[(Competition, e.competition_source_id)],
                name=e.name, season=e.season, year=e.year, begin_at=e.begin_at, end_at=e.end_at, synced_at=now)
    for p in batch.phases.values():
        _upsert(db, Phase, source, p.source_id, cache, edition=cache[(Edition, p.edition_source_id)], name=p.name,
                begin_at=p.begin_at, end_at=p.end_at, has_bracket=p.has_bracket, synced_at=now)
    db.flush()  # attribue les id des équipes créées (pour winner_team_id ci-dessous)
    for e in batch.editions.values():
        if e.winner_team_source_id and (w := team_ref(e.winner_team_source_id)):
            cache[(Edition, e.source_id)].winner_team_id = w.id
    for m in batch.matches.values():
        existing = cache.get((Match, m.source_id)) or db.scalar(
            select(Match).where(Match.source == source, Match.source_id == m.source_id)
        )
        # Ne pas écraser une version plus récente par une plus ancienne (deux listes peuvent se chevaucher).
        if existing and existing.source_modified_at and m.modified_at and m.modified_at < existing.source_modified_at:
            continue
        t1, t2, w = team_ref(m.team1_source_id), team_ref(m.team2_source_id), team_ref(m.winner_source_id)
        _upsert(db, Match, source, m.source_id, cache, phase=cache[(Phase, m.phase_source_id)], game=m.game, name=m.name,
                status=m.status, scheduled_at=m.scheduled_at, begin_at=m.begin_at, end_at=m.end_at,
                original_scheduled_at=m.original_scheduled_at, rescheduled=m.rescheduled, match_type=m.match_type,
                number_of_games=m.number_of_games, team1=t1, team2=t2, score1=m.score1, score2=m.score2,
                winner_id=w.id if w else None, forfeit=m.forfeit, draw=m.draw, bracket_round=m.bracket_round,
                previous=m.previous, streams=m.streams, source_modified_at=m.modified_at, synced_at=now)
    return len(batch.matches) + len(batch.teams)


def _record(db: Session, source: str, resource: str, now: datetime, items: int = 0, error: str | None = None):
    st = db.scalar(select(SyncState).where(SyncState.source == source, SyncState.resource == resource))
    if st is None:
        st = SyncState(source=source, resource=resource)
        db.add(st)
    st.last_attempt_at = now
    st.last_error = error
    if error is None:
        st.last_success_at, st.items = now, items


def run_sync(db: Session, provider: Provider | None = None) -> dict:
    provider = provider or get_provider()
    src, report = provider.source, {}
    for resource, load in provider.resources():
        now = datetime.now(UTC)
        try:
            n = apply_batch(db, src, load(), now)
            _record(db, src, resource, now, n)
            db.commit()
            report[resource] = n
        except Exception as exc:  # une ressource en échec ne bloque pas les autres
            db.rollback()
            log.exception("Échec de synchronisation %s", resource)
            _record(db, src, resource, now, error=str(exc)[:500])
            db.commit()
            report[resource] = f"erreur : {exc}"

    now = datetime.now(UTC)
    stale = db.scalars(
        select(Team.source_id).where(Team.source == src, (Team.roster_synced_at.is_(None)) | (Team.roster_synced_at < now - ROSTER_MAX_AGE))
        .limit(200)
    ).all()
    if stale:
        try:
            n = apply_batch(db, src, provider.fetch_rosters(list(stale)), now)
            _record(db, src, "rosters", now, n)
        except Exception as exc:
            db.rollback()
            log.exception("Échec de synchronisation des effectifs")
            _record(db, src, "rosters", now, error=str(exc)[:500])
        db.commit()
    return report


if __name__ == "__main__":
    from .db import SessionLocal

    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as session:
        print(run_sync(session))
