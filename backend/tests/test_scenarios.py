from dataclasses import replace

import pytest

from app.config import get_settings
from app.providers.demo import build
from app.rules import load_rules
from app.scenarios import SMatch, compute

RULES = load_rules(get_settings().rules_dir)
BATCH = build()
TEAM_IDS = {sid: i + 1 for i, sid in enumerate(BATCH.teams)}
NAMES = {TEAM_IDS[sid]: t.name for sid, t in BATCH.teams.items()}
MATCH_IDS = {sid: i + 1 for i, sid in enumerate(BATCH.matches)}


def smatch(sid: str) -> SMatch:
    m = BATCH.matches[sid]
    return SMatch(MATCH_IDS[sid], TEAM_IDS.get(m.team1_source_id), TEAM_IDS.get(m.team2_source_id),
                  TEAM_IDS.get(m.winner_source_id), m.status, m.bracket_round)


def phase_of(sid: str) -> list[SMatch]:
    ph = BATCH.matches[sid].phase_source_id
    return [smatch(s) for s, m in BATCH.matches.items() if m.phase_source_id == ph]


def run(sid: str, rules="auto", matches=None) -> dict:
    ph = BATCH.matches[sid].phase_source_id
    r = RULES.for_phase("demo", ph) if rules == "auto" else rules
    return compute(smatch(sid), r, matches if matches is not None else phase_of(sid), NAMES)


def team(res: dict, acr_sid: str) -> dict:
    return next(t for t in res["teams"] if t["team_id"] == TEAM_IDS[acr_sid])


# --- Cohérence données démo ↔ règles ---------------------------------------------------------------

def test_every_demo_phase_and_edition_has_rules():
    for ph in BATCH.phases:
        assert RULES.for_phase("demo", ph), ph
    for ed in BATCH.editions:
        assert RULES.for_edition("demo", ed), ed


def test_bracket_matches_use_known_rounds():
    for sid, m in BATCH.matches.items():
        r = RULES.for_phase("demo", m.phase_source_id)
        if r.type.endswith("elimination"):
            assert r.round(m.bracket_round), sid


def test_swiss_records_respect_thresholds():
    r = RULES.for_phase("demo", "valorant-vanguard-cur-sw")
    sw = [smatch(s) for s, m in BATCH.matches.items() if m.phase_source_id == "valorant-vanguard-cur-sw"]
    for t in {x for m in sw for x in (m.team1, m.team2)}:
        done = [m for m in sw if m.status == "finished" and t in (m.team1, m.team2)]
        w = sum(m.winner == t for m in done)
        assert w <= r.wins_to_qualify and len(done) - w <= r.losses_to_eliminate


def test_round_robin_groups_have_expected_size():
    for ph, phase in BATCH.phases.items():
        r = RULES.for_phase("demo", ph)
        if r.type == "round_robin":
            teams = {t for m in BATCH.matches.values() if m.phase_source_id == ph for t in (m.team1_source_id, m.team2_source_id)}
            assert len(teams) == r.participants // r.group_count, ph


# --- Poules ------------------------------------------------------------------------------------------

def test_group_a_leader_win_is_certain_first_place():
    res = run("lol-a5")  # Nova (2-0) contre Kraken (1-1)
    nova = team(res, "lol-nov")
    assert nova["record"] == "2-0"
    assert nova["win"]["certain"] and nova["win"]["kind"] == "qualified" and "1er" in nova["win"]["label"]


def test_group_a_leader_loss_depends_on_other_match():
    nova = team(run("lol-a5"), "lol-nov")
    loss = nova["loss"]
    assert loss["kind"] == "depends" and loss["depends_on"] == [MATCH_IDS["lol-a6"]]
    by_cond = {c["label"]: c["outcome"] for c in loss["conditions"]}
    # Lumen gagne : Nova et Kraken à 2-1, Kraken a battu Nova → Nova 2e, qualifié.
    assert by_cond["si Lumen Wolves bat Basalte"]["kind"] == "qualified"
    assert "2e" in by_cond["si Lumen Wolves bat Basalte"]["label"]
    # Basalte gagne : égalité à trois à 2-1 → départage, pas de qualification inventée.
    assert by_cond["si Basalte bat Lumen Wolves"]["kind"] == "tiebreak"


def test_group_a_challenger_loss_can_eliminate():
    kraken = team(run("lol-a5"), "lol-krk")
    by_cond = {c["label"]: c["outcome"] for c in kraken["loss"]["conditions"]}
    assert by_cond["si Basalte bat Lumen Wolves"]["kind"] == "eliminated"
    assert by_cond["si Lumen Wolves bat Basalte"]["kind"] == "tiebreak"


def test_group_b_already_qualified_play_for_seeding():
    res = run("lol-b6")
    atl = team(res, "lol-atl")
    assert atl["win"]["certain"] and "1er" in atl["win"]["label"]
    assert atl["loss"]["certain"] and "2e" in atl["loss"]["label"]


def test_ow_last_place_loser_is_eliminated_and_leader_safe():
    mis = team(run("ow-r14"), "ow-mis")
    assert mis["loss"] == {"kind": "eliminated", "label": "Éliminé (5e ou 6e)", "certain": True}
    nova = team(run("ow-r15"), "ow-nov")
    assert nova["win"]["certain"] and nova["loss"]["certain"] and nova["loss"]["kind"] == "qualified"


# --- Suisse et brackets ------------------------------------------------------------------------------

def test_swiss_decider_qualifies_or_eliminates():
    res = run("val-r3a")  # Kraken 1-1 contre Ferrum 1-1
    for t in res["teams"]:
        assert t["record"] == "1-1"
        assert t["win"]["kind"] == "qualified" and t["loss"]["kind"] == "eliminated"


def test_double_elimination_upper_loss_is_not_elimination():
    res = run("rl-s2")
    assert res["method"] == "bracket"
    assert all(t["loss"]["kind"] == "lower_bracket" for t in res["teams"])
    lower = run("rl-l3")
    assert all(t["loss"]["kind"] == "eliminated" for t in lower["teams"])


def test_bracket_with_unknown_opponents_still_explains_round():
    res = run("lol-f")
    assert res["determined"] and res["teams"][0]["team_id"] is None and res["teams"][0]["win"]["kind"] == "title"


# --- Données insuffisantes → indéterminé ------------------------------------------------------------

def test_no_rules_is_undetermined():
    assert run("lol-a5", rules=None)["determined"] is False


def test_missing_result_is_undetermined():
    broken = [replace(m, winner=None) if m.id == MATCH_IDS["lol-a1"] else m for m in phase_of("lol-a5")]
    assert run("lol-a5", matches=broken)["determined"] is False


def test_incomplete_group_is_undetermined():
    partial = [m for m in phase_of("lol-a5") if m.id not in (MATCH_IDS["lol-a2"], MATCH_IDS["lol-a6"], MATCH_IDS["lol-a3"])]
    res = run("lol-a5", matches=partial)
    assert res["determined"] is False and "incomplètes" in res["reason"]


def test_unknown_round_is_undetermined():
    m = [replace(x, bracket_round=None) for x in phase_of("rl-s2")]
    assert compute(replace(smatch("rl-s2"), bracket_round=None), RULES.for_phase("demo", "rl-turbo-cur-po"), m, NAMES)["determined"] is False


def test_finished_match_has_no_scenario():
    assert run("lol-a1")["determined"] is False


@pytest.mark.parametrize("bad", [
    {"rank_outcomes": [{"ranks": [1], "kind": "qualified", "label": "x"}]},
    {"type": "swiss", "rank_outcomes": []},
])
def test_invalid_rules_are_rejected(bad):
    from app.rules import PhaseRules

    base = RULES.for_phase("demo", "lol-astrale-cur-ga").model_dump()
    with pytest.raises(ValueError):
        PhaseRules.model_validate({**base, **bad})


def test_bracket_links_are_coherent_with_results_and_rules():
    """Chaque lien « vainqueur/perdant de » pointe vers un match de la même phase, et l'équipe déjà placée
    est bien le vainqueur (ou le perdant) de ce match. Un lien « perdant » n'existe que si le règlement
    envoie le perdant de ce tour en repêchage."""
    for sid, m in BATCH.matches.items():
        rules = RULES.for_phase("demo", m.phase_source_id)
        for slot, link in enumerate(m.previous):
            src = BATCH.matches[link["source_id"]]
            assert src.phase_source_id == m.phase_source_id, sid
            if link["type"] == "loser":
                assert rules.round(src.bracket_round).on_loss.kind == "lower_bracket", sid
            placed = (m.team1_source_id, m.team2_source_id)[slot]
            if src.status == "finished" and placed:
                loser = src.team2_source_id if src.winner_source_id == src.team1_source_id else src.team1_source_id
                assert placed == (src.winner_source_id if link["type"] == "winner" else loser), sid
