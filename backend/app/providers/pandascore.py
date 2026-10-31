"""Adaptateur PandaScore (offre gratuite : calendrier, statuts, résultats, équipes).

Les statistiques détaillées et le live ne sont pas utilisés. Toutes les requêtes partent du serveur ;
la clé n'est jamais transmise au navigateur.
"""

import re
import time
from datetime import datetime

import httpx

from .base import GAMES, Batch, PCompetition, PEdition, PMatch, PPhase, PPlayer, PTeam

PREFIX = {"lol": "lol", "valorant": "valorant", "rl": "rl", "ow": "ow"}
SLUG_TO_GAME = {"league-of-legends": "lol", "valorant": "valorant", "rl": "rl", "ow": "ow"}
STATUSES = {"not_started", "running", "finished", "postponed", "canceled"}


class PandaScoreError(Exception):
    pass


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def org_key(name: str) -> str:
    # shortcut: PandaScore n'expose pas d'organisation ; on regroupe les équipes de même nom normalisé
    # ("Team Liquid" LoL + Valorant). À remplacer par une table de correspondance si des faux regroupements apparaissent.
    return re.sub(r"[^a-z0-9]", "", name.lower())


def map_match(m: dict, game: str, batch: Batch) -> None:
    league, serie, tour = m.get("league") or {}, m.get("serie") or {}, m.get("tournament") or {}
    if not (league.get("id") and serie.get("id") and tour.get("id")):
        return
    comp_id, ed_id, ph_id = str(league["id"]), str(serie["id"]), str(tour["id"])
    batch.competitions[comp_id] = PCompetition(comp_id, game, league.get("name") or "Compétition", league.get("image_url"))
    serie_label = serie.get("full_name") or serie.get("name") or ""
    batch.editions[ed_id] = PEdition(
        source_id=ed_id,
        competition_source_id=comp_id,
        name=f"{league.get('name', '')} {serie_label}".strip(),
        season=serie.get("season"),
        year=serie.get("year"),
        begin_at=_dt(serie.get("begin_at")),
        end_at=_dt(serie.get("end_at")),
        winner_team_source_id=str(serie["winner_id"]) if serie.get("winner_id") and serie.get("winner_type") == "Team" else None,
    )
    batch.phases[ph_id] = PPhase(
        ph_id, ed_id, tour.get("name") or "Phase", _dt(tour.get("begin_at")), _dt(tour.get("end_at")), bool(tour.get("has_bracket"))
    )

    team_ids: list[str | None] = []
    for opp in (m.get("opponents") or [])[:2]:
        t = opp.get("opponent") or {}
        if opp.get("type") != "Team" or not t.get("id"):
            continue
        tid = str(t["id"])
        team_ids.append(tid)
        batch.teams.setdefault(
            tid,
            PTeam(tid, game, t.get("name") or "Équipe", t.get("acronym"), t.get("image_url"), t.get("location"),
                  org_key(t.get("name") or tid), t.get("name")),
        )
    team_ids += [None] * (2 - len(team_ids))
    scores = {str(r.get("team_id")): r.get("score") for r in m.get("results") or [] if r.get("team_id")}
    status = m.get("status") if m.get("status") in STATUSES else "not_started"
    finished = status == "finished"

    batch.matches[str(m["id"])] = PMatch(
        source_id=str(m["id"]),
        phase_source_id=ph_id,
        game=game,
        status=status,
        name=m.get("name"),
        scheduled_at=_dt(m.get("scheduled_at")),
        begin_at=_dt(m.get("begin_at")),
        end_at=_dt(m.get("end_at")),
        original_scheduled_at=_dt(m.get("original_scheduled_at")),
        rescheduled=bool(m.get("rescheduled")),
        match_type=m.get("match_type"),
        number_of_games=m.get("number_of_games"),
        team1_source_id=team_ids[0],
        team2_source_id=team_ids[1],
        # Un score 0-0 sur un match non commencé n'est pas un résultat.
        score1=scores.get(team_ids[0]) if finished or status == "running" else None,
        score2=scores.get(team_ids[1]) if finished or status == "running" else None,
        winner_source_id=str(m["winner_id"]) if finished and m.get("winner_id") and m.get("winner_type") == "Team" else None,
        forfeit=bool(m.get("forfeit")),
        draw=bool(m.get("draw")),
        streams=[
            {"url": s["raw_url"], "language": s.get("language"), "official": bool(s.get("official")), "main": bool(s.get("main"))}
            for s in m.get("streams_list") or []
            if s.get("raw_url")
        ],
        modified_at=_dt(m.get("modified_at")),
        previous=[{"source_id": str(p["match_id"]), "type": p.get("type", "winner")}
                  for p in m.get("previous_matches") or [] if p.get("match_id")],
    )


def map_team(t: dict) -> PTeam | None:
    game = SLUG_TO_GAME.get((t.get("current_videogame") or {}).get("slug", ""))
    if not game:
        return None
    return PTeam(
        str(t["id"]), game, t.get("name") or "Équipe", t.get("acronym"), t.get("image_url"), t.get("location"),
        org_key(t.get("name") or str(t["id"])), t.get("name"),
        players=[
            PPlayer(str(p["id"]), p.get("name") or "?", p.get("first_name"), p.get("last_name"), p.get("role"),
                    p.get("nationality"), p.get("image_url"))
            for p in t.get("players") or []
            if p.get("active", True)
        ],
    )


class PandaScoreProvider:
    source = "pandascore"

    def __init__(self, token: str, base_url: str, client: httpx.Client | None = None, sleep=time.sleep):
        if not token:
            raise PandaScoreError("PANDASCORE_TOKEN est vide : impossible d'utiliser le mode pandascore.")
        self.client = client or httpx.Client(base_url=base_url, headers={"Authorization": f"Bearer {token}"}, timeout=20)
        self.sleep = sleep

    def _request(self, path: str, params: dict, retries: int = 3) -> httpx.Response:
        for attempt in range(retries + 1):
            r = self.client.get(path, params=params)
            if (r.status_code == 429 or r.status_code >= 500) and attempt < retries:
                # Retry-After est fourni sur les 429 ; sinon recul exponentiel.
                self.sleep(min(float(r.headers.get("retry-after") or 5 * 2**attempt), 120))
                continue
            break
        if r.status_code >= 400:
            raise PandaScoreError(f"HTTP {r.status_code} sur {path} : {r.text[:200]}")
        return r

    def _get_all(self, path: str, params: dict, max_pages: int) -> list[dict]:
        items: list[dict] = []
        for page in range(1, max_pages + 1):
            r = self._request(path, {**params, "page": page, "per_page": 100})
            items += r.json()
            if 'rel="next"' not in r.headers.get("link", ""):
                break
        return items

    def _matches(self, game: str, kind: str, params: dict, max_pages: int) -> Batch:
        batch = Batch()
        for m in self._get_all(f"/{PREFIX[game]}/matches/{kind}", params, max_pages):
            map_match(m, game, batch)
        return batch

    def resources(self):
        res = []
        for g in GAMES:
            res += [
                (f"{g}:running", lambda g=g: self._matches(g, "running", {}, 1)),
                (f"{g}:upcoming", lambda g=g: self._matches(g, "upcoming", {"sort": "scheduled_at"}, 3)),
                # Re-télécharger les matchs récents capte les corrections de score et les reports.
                (f"{g}:past", lambda g=g: self._matches(g, "past", {"sort": "-scheduled_at"}, 2)),
            ]
        return res

    def fetch_rosters(self, team_source_ids: list[str]) -> Batch:
        batch = Batch()
        for i in range(0, len(team_source_ids), 100):
            chunk = team_source_ids[i : i + 100]
            for t in self._get_all("/teams", {"filter[id]": ",".join(chunk)}, 1):
                if team := map_team(t):
                    batch.teams[team.source_id] = team
        return batch
