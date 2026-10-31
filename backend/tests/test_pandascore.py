import httpx
import pytest

from app.providers.base import Batch
from app.providers.pandascore import PandaScoreError, PandaScoreProvider, map_match, map_team

MATCH = {
    "id": 101, "name": "Upper final: T1 vs G2", "status": "finished", "scheduled_at": "2026-10-01T15:00:00Z",
    "begin_at": "2026-10-01T15:05:00Z", "end_at": "2026-10-01T17:00:00Z", "original_scheduled_at": "2026-09-30T15:00:00Z",
    "rescheduled": True, "match_type": "best_of", "number_of_games": 5, "forfeit": False, "draw": False,
    "winner_id": 2, "winner_type": "Team", "modified_at": "2026-10-01T17:10:00Z",
    "league": {"id": 7, "name": "LEC", "image_url": None},
    "serie": {"id": 70, "full_name": "Fall 2026", "year": 2026, "begin_at": "2026-09-01T00:00:00Z", "end_at": None},
    "tournament": {"id": 700, "name": "Playoffs", "has_bracket": True},
    "opponents": [{"type": "Team", "opponent": {"id": 1, "name": "Team Liquid", "acronym": "TL", "image_url": "https://x/tl.png"}},
                  {"type": "Team", "opponent": {"id": 2, "name": "G2 Esports", "acronym": "G2", "image_url": None}}],
    "results": [{"team_id": 1, "score": 1}, {"team_id": 2, "score": 3}],
    "streams_list": [{"raw_url": "https://twitch.tv/lec", "language": "en", "official": True, "main": True}, {"raw_url": None}],
}


def test_map_match_normalizes_hierarchy_scores_and_streams():
    b = Batch()
    map_match(MATCH, "lol", b)
    m = b.matches["101"]
    assert (m.team1_source_id, m.team2_source_id, m.score1, m.score2, m.winner_source_id) == ("1", "2", 1, 3, "2")
    assert m.rescheduled and m.original_scheduled_at.day == 30 and m.bracket_round is None
    assert b.editions["70"].name == "LEC Fall 2026" and b.phases["700"].edition_source_id == "70"
    assert m.streams == [{"url": "https://twitch.tv/lec", "language": "en", "official": True, "main": True}]
    assert b.teams["1"].org_key == "teamliquid" and b.teams["1"].players is None  # effectif inconnu ≠ vide


def test_upcoming_zero_scores_are_not_results_and_tbd_is_kept():
    b = Batch()
    map_match({**MATCH, "status": "not_started", "winner_id": None, "opponents": MATCH["opponents"][:1],
               "results": [{"team_id": 1, "score": 0}]}, "lol", b)
    m = b.matches["101"]
    assert m.score1 is None and m.team2_source_id is None and m.winner_source_id is None


def test_match_without_tournament_is_skipped():
    b = Batch()
    map_match({**MATCH, "tournament": None}, "lol", b)
    assert not b.matches


def test_map_team_roster():
    t = map_team({"id": 1, "name": "Team Liquid", "current_videogame": {"slug": "valorant"},
                  "players": [{"id": 9, "name": "nAts", "image_url": "https://x/p.png", "active": True},
                              {"id": 10, "name": "old", "active": False}]})
    assert t.game == "valorant" and [p.handle for p in t.players] == ["nAts"]


def test_pagination_follows_link_and_retries_429():
    calls = []

    def handler(req: httpx.Request):
        calls.append(req.url.params.get("page"))
        assert req.headers["authorization"] == "Bearer secret"
        if len(calls) == 1:
            return httpx.Response(429, headers={"retry-after": "1"})
        page = int(req.url.params["page"])
        link = '<https://api.pandascore.co/x?page=2>; rel="next"' if page == 1 else ""
        return httpx.Response(200, json=[{**MATCH, "id": page}], headers={"link": link})

    client = httpx.Client(base_url="https://api.pandascore.co", transport=httpx.MockTransport(handler),
                          headers={"Authorization": "Bearer secret"})
    p = PandaScoreProvider("secret", "", client=client, sleep=lambda s: None)
    batch = dict(p.resources())["lol:upcoming"]()
    assert set(batch.matches) == {"1", "2"} and calls == ["1", "1", "2"]


def test_http_error_raises_and_missing_token_refused():
    client = httpx.Client(base_url="https://x", transport=httpx.MockTransport(lambda r: httpx.Response(403, text="forbidden")))
    with pytest.raises(PandaScoreError):
        PandaScoreProvider("t", "", client=client, sleep=lambda s: None).fetch_rosters(["1"])
    with pytest.raises(PandaScoreError):
        PandaScoreProvider("", "")


def test_list_payload_without_previous_matches_means_unknown_links():
    b = Batch()
    map_match(MATCH, "lol", b)
    assert b.matches["101"].previous is None  # ne doit pas effacer des liens déjà connus


def test_fetch_brackets_maps_links_onto_known_phase():
    bracket = [
        {"id": 3, "name": "Grand Final: TBD vs TBD", "status": "not_started", "tournament_id": 700, "opponents": [], "results": [],
         "previous_matches": [{"type": "winner", "match_id": 1}, {"type": "winner", "match_id": 2}]},
        {"id": 1, "name": "Semifinal 1: TL vs G2", "status": "finished", "tournament_id": 700, "winner_id": 2, "winner_type": "Team",
         "opponents": MATCH["opponents"], "results": MATCH["results"], "previous_matches": []},
    ]
    client = httpx.Client(base_url="https://x", transport=httpx.MockTransport(
        lambda r: httpx.Response(200, json=bracket) if r.url.path == "/tournaments/700/brackets" else httpx.Response(404)))
    b = PandaScoreProvider("t", "", client=client, sleep=lambda s: None).fetch_brackets([("700", "lol")])
    gf = b.matches["3"]
    assert gf.phase_source_id == "700" and gf.game == "lol"
    assert gf.previous == [{"source_id": "1", "type": "winner"}, {"source_id": "2", "type": "winner"}]
    assert b.matches["1"].previous == [] and b.matches["1"].winner_source_id == "2"
