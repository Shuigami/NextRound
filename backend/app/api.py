import unicodedata
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from .config import get_settings
from .db import get_db
from .models import Competition, Edition, Match, Organization, Phase, SyncState, Team
from .rules import get_rules
from .scenarios import SMatch, compute

router = APIRouter(prefix="/api")


def name_key(name: str) -> str:
    """Clé de tri qui ignore accents et casse (É trié avec E)."""
    return unicodedata.normalize("NFD", name).encode("ascii", "ignore").decode().casefold()
UPCOMING, PAST = ("not_started", "postponed"), ("finished", "canceled")


def src() -> str:
    return get_settings().source


def _ids(raw: str | None) -> list[int]:
    try:
        return [int(x) for x in raw.split(",") if x.strip()] if raw else []
    except ValueError:
        raise HTTPException(422, "Liste d'identifiants invalide")


def team_out(t: Team | None) -> dict | None:
    if t is None:
        return None
    return {"id": t.id, "name": t.name, "acronym": t.acronym, "game": t.game, "logo_url": t.logo_url, "organization_id": t.organization_id}


def match_out(m: Match, links: dict[int, list] | None = None) -> dict:
    ed = m.phase.edition
    return {
        "id": m.id, "game": m.game, "name": m.name, "status": m.status,
        "scheduled_at": m.scheduled_at, "begin_at": m.begin_at, "end_at": m.end_at,
        "original_scheduled_at": m.original_scheduled_at, "rescheduled": m.rescheduled,
        "match_type": m.match_type, "number_of_games": m.number_of_games,
        "team1": team_out(m.team1), "team2": team_out(m.team2), "score1": m.score1, "score2": m.score2,
        "winner_id": m.winner_id, "forfeit": m.forfeit, "draw": m.draw, "streams": m.streams or [],
        "bracket_round": m.bracket_round,
        "previous": (links or {}).get(m.id, []),
        "phase": {"id": m.phase.id, "name": m.phase.name},
        "edition": {"id": ed.id, "name": ed.name},
        "competition": {"id": ed.competition.id, "name": ed.competition.name},
        "synced_at": m.synced_at,
    }


def resolve_links(db: Session, ms) -> dict[int, list]:
    """Matchs qui alimentent chaque match (« vainqueur/perdant de »), résolus en une requête. Liens inconnus ignorés.
    Le frontend s'en sert pour le tableau et pour masquer, en anti-spoil, une équipe placée grâce à un résultat."""
    ms = list(ms)
    wanted = {p["source_id"] for m in ms for p in m.previous or [] if p.get("source_id")}
    if not wanted:
        return {}
    rows = db.execute(select(Match.source_id, Match.id, Match.name).where(Match.source == src(), Match.source_id.in_(wanted))).all()
    by = {r.source_id: r for r in rows}
    return {
        m.id: [{"match_id": by[p["source_id"]].id, "name": by[p["source_id"]].name, "type": p["type"]}
               for p in m.previous or [] if p.get("source_id") in by]
        for m in ms
    }


def _match_query():
    return select(Match).where(Match.source == src()).options(
        joinedload(Match.team1), joinedload(Match.team2),
        joinedload(Match.phase).joinedload(Phase.edition).joinedload(Edition.competition),
    )


def edition_status(ed: Edition, now: datetime) -> str:
    if ed.begin_at and ed.begin_at > now:
        return "upcoming"
    if ed.winner_team_id or (ed.end_at and ed.end_at < now):
        return "finished"
    return "ongoing"


def standings(phase: Phase) -> list[dict]:
    """Bilan calculé à partir des matchs terminés. Les départages ne sont pas appliqués."""
    rows: dict[int, dict] = {}
    for m in phase.matches:
        for t in (m.team1, m.team2):
            if t:
                rows.setdefault(t.id, {"team": team_out(t), "wins": 0, "losses": 0, "game_wins": 0, "game_losses": 0, "played": 0})
        if m.status != "finished" or not (m.team1 and m.team2 and m.winner_id):
            continue
        for t, mine, theirs in ((m.team1, m.score1, m.score2), (m.team2, m.score2, m.score1)):
            r = rows[t.id]
            r["played"] += 1
            r["wins" if m.winner_id == t.id else "losses"] += 1
            r["game_wins"] += mine or 0
            r["game_losses"] += theirs or 0
    out = sorted(rows.values(), key=lambda r: (-r["wins"], r["losses"], -(r["game_wins"] - r["game_losses"]), name_key(r["team"]["name"])))
    for i, r in enumerate(out):
        tied = any(o is not r and o["wins"] == r["wins"] and o["losses"] == r["losses"] for o in out)
        r["rank"], r["tied"] = i + 1, tied
    return out


@router.get("/meta")
def meta(db: Session = Depends(get_db)):
    s = get_settings()
    states = db.scalars(select(SyncState).where(SyncState.source == s.source)).all()
    last = max((st.last_success_at for st in states if st.last_success_at), default=None)
    now = datetime.now(UTC)
    stale = s.data_mode == "pandascore" and (last is None or now - last > timedelta(minutes=3 * s.sync_interval_minutes))
    return {
        "mode": s.data_mode,
        "last_sync_at": last,
        "stale": stale,
        "errors": [{"resource": st.resource, "error": st.last_error, "at": st.last_attempt_at} for st in states if st.last_error],
        "server_time": now,
    }


@router.get("/matches")
def list_matches(
    db: Session = Depends(get_db),
    game: str | None = Query(None, description="Jeux séparés par des virgules"),
    status: str = Query("upcoming", pattern="^(upcoming|live|past|all)$"),
    date_from: datetime | None = Query(None, alias="from"),
    date_to: datetime | None = Query(None, alias="to"),
    team_ids: str | None = None,
    edition_ids: str | None = None,
    limit: int = Query(100, le=500),
):
    q = _match_query()
    if game:
        q = q.where(Match.game.in_(game.split(",")))
    if status == "upcoming":
        q = q.where(Match.status.in_(UPCOMING)).order_by(Match.scheduled_at)
    elif status == "live":
        q = q.where(Match.status == "running").order_by(Match.scheduled_at)
    elif status == "past":
        q = q.where(Match.status.in_(PAST)).order_by(Match.scheduled_at.desc())
    else:
        q = q.order_by(Match.scheduled_at)
    if date_from:
        q = q.where(Match.scheduled_at >= date_from)
    if date_to:
        q = q.where(Match.scheduled_at < date_to)
    teams, editions = _ids(team_ids), _ids(edition_ids)
    # Favoris : un match passe s'il implique une équipe suivie OU appartient à une édition suivie.
    conds = []
    if teams:
        conds += [Match.team1_id.in_(teams), Match.team2_id.in_(teams)]
    if editions:
        conds.append(Match.phase.has(Phase.edition_id.in_(editions)))
    if team_ids is not None or edition_ids is not None:
        if not conds:
            return []
        q = q.where(or_(*conds))
    ms = db.scalars(q.limit(limit)).unique().all()
    links = resolve_links(db, ms)
    return [match_out(m, links) for m in ms]


@router.get("/matches/{match_id}")
def get_match(match_id: int, db: Session = Depends(get_db)):
    m = db.scalar(_match_query().where(Match.id == match_id))
    if not m:
        raise HTTPException(404, "Match introuvable")
    ed_rules = get_rules().for_edition(src(), m.phase.edition.source_id)
    ph_rules = get_rules().for_phase(src(), m.phase.source_id)
    siblings = [mm for mm in db.scalars(select(Match).where(Match.phase_id == m.phase_id)).all()]
    names = {t.id: t.name for mm in siblings for t in (mm.team1, mm.team2) if t}
    scenario = compute(
        SMatch(m.id, m.team1_id, m.team2_id, m.winner_id, m.status, m.bracket_round),
        ph_rules,
        [SMatch(x.id, x.team1_id, x.team2_id, x.winner_id, x.status, x.bracket_round) for x in siblings],
        names,
    )
    if ph_rules and ph_rules.type in ("round_robin", "swiss"):
        # Matchs dont dépend le scénario, pour les afficher par nom.
        scenario["related"] = {x.id: {"name": f"{x.team1.name if x.team1 else '?'} – {x.team2.name if x.team2 else '?'}",
                                      "scheduled_at": x.scheduled_at} for x in siblings}
    return {
        **match_out(m, resolve_links(db, [m])),
        "scenario": scenario,
        "phase_rules": ph_rules.model_dump(mode="json") if ph_rules else None,
        "rules_meta": {"verified_at": ed_rules.verified_at, "sources": [s.model_dump() for s in ed_rules.sources],
                       "is_fictional": ed_rules.is_fictional} if ed_rules else None,
    }


@router.get("/teams")
def list_teams(db: Session = Depends(get_db), game: str | None = None, q: str | None = None):
    query = select(Team).where(Team.source == src()).order_by(Team.name, Team.game)
    if game:
        query = query.where(Team.game.in_(game.split(",")))
    if q:
        query = query.where(Team.name.ilike(f"%{q}%"))
    return [team_out(t) for t in db.scalars(query.limit(500))]


@router.get("/organizations")
def list_orgs(db: Session = Depends(get_db)):
    orgs = db.scalars(select(Organization).where(Organization.source == src()).options(selectinload(Organization.teams)).order_by(Organization.name))
    return [{"id": o.id, "name": o.name, "logo_url": o.logo_url, "teams": [team_out(t) for t in sorted(o.teams, key=lambda t: t.game)]} for o in orgs]


@router.get("/teams/{team_id}")
def get_team(team_id: int, db: Session = Depends(get_db)):
    t = db.scalar(select(Team).where(Team.source == src(), Team.id == team_id).options(selectinload(Team.players), joinedload(Team.organization).selectinload(Organization.teams)))
    if not t:
        raise HTTPException(404, "Équipe introuvable")
    involved = or_(Match.team1_id == t.id, Match.team2_id == t.id)
    upcoming = db.scalars(_match_query().where(involved, Match.status.in_(UPCOMING + ("running",))).order_by(Match.scheduled_at).limit(10)).unique().all()
    recent = db.scalars(_match_query().where(involved, Match.status.in_(PAST)).order_by(Match.scheduled_at.desc()).limit(10)).unique().all()
    links = resolve_links(db, [*upcoming, *recent])
    eds = db.scalars(
        select(Edition).join(Phase).join(Match).where(involved).options(joinedload(Edition.competition)).distinct()
    ).unique().all()
    now = datetime.now(UTC)
    return {
        **team_out(t),
        "location": t.location,
        "roster_synced_at": t.roster_synced_at,
        "synced_at": t.synced_at,
        "organization": {"id": t.organization.id, "name": t.organization.name,
                         "teams": [team_out(x) for x in t.organization.teams]} if t.organization else None,
        "players": [{"id": p.id, "handle": p.handle, "first_name": p.first_name, "last_name": p.last_name, "role": p.role,
                     "nationality": p.nationality, "photo_url": p.photo_url} for p in t.players],
        "upcoming": [match_out(m, links) for m in upcoming],
        "recent": [match_out(m, links) for m in recent],
        "editions": [_edition_brief(e, now) for e in sorted(eds, key=lambda e: e.begin_at or now, reverse=True)],
    }


def _series(f) -> str:
    return f"{'BO' if f.type == 'best_of' else 'FT'}{f.value}"


def format_summary(rules) -> list[dict]:
    """Résumé d'une ligne du format : une entrée par phase du règlement (« Phase de groupes · BO1 »)."""
    if rules is None:
        return []
    return [{"name": p.name, "type": p.type, "series": " / ".join(dict.fromkeys(_series(f) for f in p.formats))} for p in rules.phases]


def _edition_brief(e: Edition, now: datetime) -> dict:
    rules = get_rules().for_edition(src(), e.source_id)
    return {"id": e.id, "name": e.name, "game": e.competition.game, "competition": {"id": e.competition.id, "name": e.competition.name},
            "begin_at": e.begin_at, "end_at": e.end_at, "status": edition_status(e, now), "winner_team_id": e.winner_team_id,
            "has_rules": rules is not None, "format": format_summary(rules)}


@router.get("/editions")
def list_editions(db: Session = Depends(get_db), game: str | None = None):
    q = select(Edition).where(Edition.source == src()).options(joinedload(Edition.competition)).order_by(Edition.begin_at.desc())
    if game:
        q = q.where(Edition.competition.has(Competition.game.in_(game.split(","))))
    now = datetime.now(UTC)
    return [_edition_brief(e, now) for e in db.scalars(q.limit(300))]


@router.get("/editions/{edition_id}")
def get_edition(edition_id: int, db: Session = Depends(get_db)):
    e = db.scalar(select(Edition).where(Edition.source == src(), Edition.id == edition_id).options(joinedload(Edition.competition)))
    if not e:
        raise HTTPException(404, "Compétition introuvable")
    phases = db.scalars(
        select(Phase).where(Phase.edition_id == e.id).order_by(Phase.begin_at)
        .options(selectinload(Phase.matches).joinedload(Match.team1), selectinload(Phase.matches).joinedload(Match.team2))
    ).all()
    for p in phases:
        for m in p.matches:
            m.phase = p  # évite des requêtes paresseuses dans match_out
    rules = get_rules().for_edition(src(), e.source_id)
    now = datetime.now(UTC)
    siblings = db.scalars(select(Edition).where(Edition.competition_id == e.competition_id).order_by(Edition.begin_at.desc())).all()
    participants = {t.id: t for p in phases for m in p.matches for t in (m.team1, m.team2) if t}
    winner = db.get(Team, e.winner_team_id) if e.winner_team_id else None
    links = resolve_links(db, [m for p in phases for m in p.matches])
    phase_out = []
    for p in phases:
        pr = get_rules().for_phase(src(), p.source_id)
        phase_out.append({
            "id": p.id, "name": p.name, "begin_at": p.begin_at, "end_at": p.end_at, "has_bracket": p.has_bracket,
            "rules_key": pr.key if pr else None, "type": pr.type if pr else None,
            "standings": standings(p) if not (pr and pr.type.endswith("elimination")) and not (not pr and p.has_bracket) else None,
            "matches": [match_out(m, links) for m in p.matches],
        })
    return {
        **_edition_brief(e, now),
        "season": e.season, "year": e.year, "synced_at": e.synced_at,
        "winner": team_out(winner),
        "siblings": [{"id": s.id, "name": s.name, "begin_at": s.begin_at, "status": edition_status(s, now)} for s in siblings],
        "participants": sorted((team_out(t) for t in participants.values()), key=lambda t: name_key(t["name"])),
        "rules": rules.model_dump(mode="json") if rules else None,
        "phases": phase_out,
    }
