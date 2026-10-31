"""« Ce que ce match change » : calculé uniquement à partir des règles structurées et des résultats connus.

Quand les données ne suffisent pas, on renvoie determined=False avec la raison. On n'invente jamais
une qualification.
"""

from collections import Counter
from dataclasses import dataclass
from itertools import product

from .rules import Outcome, PhaseRules

DONE, CANCELED = "finished", "canceled"
MAX_OPEN_MATCHES = 14  # 2^14 combinaisons par issue : énumération exhaustive encore instantanée


@dataclass(frozen=True)
class SMatch:
    id: int
    team1: int | None
    team2: int | None
    winner: int | None
    status: str
    bracket_round: str | None = None


def _unknown(reason: str) -> dict:
    return {"determined": False, "reason": reason, "teams": []}


def _out(o: Outcome | tuple) -> dict:
    if isinstance(o, Outcome):
        return {"kind": o.kind, "label": o.label, "certain": True}
    if o[0] == "ok":
        return {"kind": o[1], "label": o[2], "certain": True}
    return {"kind": "tiebreak", "label": "Égalité à départager", "certain": False,
            "possible": [{"kind": k, "label": lbl, "certain": True} for k, lbl in o[1]]}


def compute(match: SMatch, rules: PhaseRules | None, phase_matches: list[SMatch], names: dict[int, str]) -> dict:
    if match.status in (DONE, CANCELED):
        return _unknown("Ce match est terminé ou annulé.")
    if rules is None:
        return _unknown("Aucune règle vérifiée n'est enregistrée pour cette phase. Impossible de dire ce que ce match change.")
    if rules.type.endswith("elimination"):
        return _bracket(match, rules)
    if match.team1 is None or match.team2 is None:
        return _unknown("Les deux adversaires ne sont pas encore connus.")
    if rules.type == "swiss":
        return _swiss(match, rules, phase_matches)
    return _round_robin(match, rules, phase_matches, names)


def _bracket(match: SMatch, rules: PhaseRules) -> dict:
    rnd = rules.round(match.bracket_round)
    if rnd is None:
        return _unknown("Le tour de ce match n'est pas identifié dans les règles de la phase.")
    return {
        "determined": True,
        "method": "bracket",
        "round": rnd.name,
        "teams": [{"team_id": t, "record": None, "win": _out(rnd.on_win), "loss": _out(rnd.on_loss)} for t in (match.team1, match.team2)],
        "note": None,
    }


def _swiss(match: SMatch, rules: PhaseRules, pm: list[SMatch]) -> dict:
    W, L = rules.wins_to_qualify, rules.losses_to_eliminate
    teams = []
    for t in (match.team1, match.team2):
        played = [m for m in pm if m.status == DONE and t in (m.team1, m.team2) and m.id != match.id]
        if any(m.winner is None for m in played):
            return _unknown("Un résultat précédent de cette équipe est manquant : bilan incalculable.")
        w = sum(m.winner == t for m in played)
        lo = len(played) - w
        if w >= W or lo >= L:
            return _unknown("Le bilan enregistré ne correspond pas aux règles : l'équipe devrait déjà être qualifiée ou éliminée.")
        win = rules.swiss_qualified if w + 1 >= W else Outcome(kind="continue", label=f"Bilan {w + 1}-{lo}, reste en lice pour la ronde suivante")
        loss = rules.swiss_eliminated if lo + 1 >= L else Outcome(kind="continue", label=f"Bilan {w}-{lo + 1}, reste en lice pour la ronde suivante")
        teams.append({"team_id": t, "record": f"{w}-{lo}", "win": _out(win), "loss": _out(loss)})
    return {"determined": True, "method": "swiss", "teams": teams, "note": rules.pairing}


def _round_robin(match: SMatch, rules: PhaseRules, pm: list[SMatch], names: dict[int, str]) -> dict:
    teams = sorted({t for m in pm for t in (m.team1, m.team2) if t is not None})
    expected = rules.participants // rules.group_count
    if len(teams) != expected:
        return _unknown(f"{len(teams)} équipes trouvées dans cette poule pour {expected} attendues : données incomplètes.")
    decided = [m for m in pm if m.status == DONE and m.id != match.id]
    if any(m.winner is None for m in decided):
        return _unknown("Un résultat de la poule est manquant ou nul : classement incalculable.")
    others = [m for m in pm if m.status not in (DONE, CANCELED) and m.id != match.id]
    if any(m.team1 is None or m.team2 is None for m in others):
        return _unknown("Certains adversaires de la poule ne sont pas encore connus.")
    if len(others) > MAX_OPEN_MATCHES:
        return _unknown("Trop de matchs restent à jouer pour énumérer tous les scénarios.")

    rank_outcome = {r: (o.kind, o.label) for o in rules.rank_outcomes for r in o.ranks}
    h2h_first = bool(rules.tiebreakers) and rules.tiebreakers[0].key == "head_to_head"
    base = [(m.team1, m.team2, m.winner) for m in decided]

    def outcome(team: int, results: list[tuple]) -> tuple:
        wins = Counter(w for *_, w in results)
        pos = 1
        for level in sorted({wins[t] for t in teams}, reverse=True):
            grp = [t for t in teams if wins[t] == level]
            if team in grp:
                ranks = list(range(pos, pos + len(grp)))
                if len(grp) == 2 and h2h_first:
                    h2h = [w for a, b, w in results if {a, b} == set(grp)]
                    if len(h2h) == 1:
                        ranks = [pos if h2h[0] == team else pos + 1]
                outs = sorted({rank_outcome[r] for r in ranks})
                return ("ok", *outs[0]) if len(outs) == 1 else ("tiebreak", tuple(outs))
            pos += len(grp)
        raise AssertionError("équipe absente du classement")

    def label_win(m: SMatch, side: int) -> str:
        w, lo = (m.team1, m.team2) if side == 0 else (m.team2, m.team1)
        return f"si {names.get(w, '?')} bat {names.get(lo, '?')}"

    record = {t: f"{sum(w == t for *_, w in base)}-{sum(t in (a, b) and w != t for a, b, w in base)}" for t in (match.team1, match.team2)}
    result_teams = []
    for focal in (match.team1, match.team2):
        entry = {"team_id": focal, "record": record[focal]}
        for key, target_winner in (("win", focal), ("loss", match.team2 if focal == match.team1 else match.team1)):
            table = {}
            for assign in product((0, 1), repeat=len(others)):
                res = base + [(match.team1, match.team2, target_winner)]
                res += [(m.team1, m.team2, m.team1 if a == 0 else m.team2) for m, a in zip(others, assign)]
                table[assign] = outcome(focal, res)
            uniq = sorted(set(table.values()), key=str)
            if len(uniq) == 1:
                entry[key] = _out(uniq[0])
                continue
            flip = lambda a, i: a[:i] + (1 - a[i],) + a[i + 1 :]
            relevant = [i for i in range(len(others)) if any(table[a] != table[flip(a, i)] for a in table)]
            conditions = []
            if len(relevant) <= 2:
                for combo in product((0, 1), repeat=len(relevant)):
                    sample = next(a for a in table if all(a[i] == v for i, v in zip(relevant, combo)))
                    conditions.append({
                        "label": " et ".join(label_win(others[i], v) for i, v in zip(relevant, combo)),
                        "outcome": _out(table[sample]),
                    })
            entry[key] = {
                "kind": "depends",
                "label": "Dépend d'autres résultats",
                "certain": False,
                "possible": [_out(u) for u in uniq],
                "depends_on": [others[i].id for i in relevant],
                "conditions": conditions,
            }
        result_teams.append(entry)
    tb = "; ".join(t.label for t in rules.tiebreakers)
    return {"determined": True, "method": "round_robin", "teams": result_teams,
            "note": f"Départages prévus par le règlement : {tb}." if tb else None}
