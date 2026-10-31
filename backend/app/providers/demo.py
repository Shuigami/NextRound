"""Données de démonstration : équipes, compétitions et résultats FICTIFS mais cohérents.

Les horaires sont relatifs à l'heure de synchronisation pour que la démo ait toujours un passé et un futur.
Les résultats sont fixes et respectent les règles des fichiers rules/demo-*.yaml (vérifié par les tests).
"""

from datetime import UTC, datetime, timedelta

from .base import Batch, PCompetition, PEdition, PMatch, PPhase, PPlayer, PTeam

# Organisations présentes dans plusieurs jeux, puis équipes isolées (une organisation à une seule équipe).
ORGS = {
    "NOV": ("Nova Esports", ["lol", "valorant", "rl", "ow"]),
    "KRK": ("Kraken Gaming", ["lol", "valorant", "ow"]),
    "ATL": ("Atlas Club", ["lol", "rl"]),
    "SOL": ("Solstice", ["valorant", "rl", "ow"]),
    "FER": ("Ferrum", ["lol", "valorant"]),
    "MIS": ("Mistral GC", ["rl", "ow"]),
    "LUW": ("Lumen Wolves", ["lol"]),
    "OR5": ("Oracle Five", ["lol"]),
    "BAS": ("Basalte", ["lol"]),
    "ECR": ("Écho Rouge", ["lol"]),
    "VTX": ("Vortex Unit", ["valorant"]),
    "HY7": ("Hydra 7", ["valorant"]),
    "FAU": ("Les Faucons", ["valorant"]),
    "PLR": ("Polaris", ["valorant"]),
    "TKT": ("Turbo Kittens", ["rl"]),
    "AER": ("Aero Squad", ["rl"]),
    "NTV": ("Nitro Ville", ["rl"]),
    "ORB": ("Orbit RC", ["rl"]),
    "TTF": ("Titan Forge", ["ow"]),
    "AUR": ("Aurore", ["ow"]),
}
ROLES = {
    "lol": ["Top", "Jungle", "Mid", "ADC", "Support"],
    "valorant": ["Duelliste", "Initiateur", "Contrôleur", "Sentinelle", "Flex"],
    "rl": [None, None, None],
    "ow": ["Tank", "DPS", "DPS", "Support", "Support"],
}
_HANDLES = ["Kestrel", "Nox", "Brume", "Vega", "Rook", "Sable", "Onyx", "Lynx", "Pavo", "Zéphyr", "Ember", "Quill",
            "Talon", "Mirage", "Cobalt", "Echo", "Faro", "Glint", "Haze", "Ixo", "Juno", "Krait", "Lumo", "Mako"]
_FIRST = ["Léa", "Hugo", "Inès", "Noah", "Jade", "Lucas", "Emma", "Yanis", "Chloé", "Adam", "Mila", "Sacha"]
_LAST = ["Martin", "Bernard", "Moreau", "Laurent", "Garnier", "Roux", "Fournier", "Girard", "Lambert", "Mercier"]
_NAT = ["FR", "BE", "CH", "ES", "DE", "PT", "PL", "SE"]


def _players(game: str, acr: str, seed: int) -> list[PPlayer]:
    out = []
    for i, role in enumerate(ROLES[game]):
        k = seed * 7 + i * 5
        out.append(PPlayer(
            source_id=f"{game}-{acr.lower()}-p{i + 1}",
            handle=f"{_HANDLES[k % len(_HANDLES)]}{'' if k < len(_HANDLES) else k % 9}",
            first_name=_FIRST[k % len(_FIRST)],
            last_name=_LAST[(k // 3) % len(_LAST)],
            role=role,
            nationality=_NAT[k % len(_NAT)],
            photo_url=None,  # pas de portraits en démo : l'interface affiche ses avatars de secours
        ))
    return out


def build(now: datetime | None = None) -> Batch:
    now = (now or datetime.now(UTC)).replace(minute=0, second=0, microsecond=0)
    b = Batch()

    for seed, (acr, (name, games)) in enumerate(ORGS.items()):
        for game in games:
            sid = f"{game}-{acr.lower()}"
            b.teams[sid] = PTeam(sid, game, name, acr, None, None, f"demo-{acr.lower()}", name, _players(game, acr, seed))

    def comp(sid, game, name):
        b.competitions[sid] = PCompetition(sid, game, name)

    def edition(sid, comp_sid, name, year, season=None, winner=None):
        b.editions[sid] = PEdition(sid, comp_sid, name, season, year, winner_team_source_id=winner)

    def phase(sid, ed, name, bracket=False):
        b.phases[sid] = PPhase(sid, ed, name, has_bracket=bracket)

    def match(sid, ph, h, t1, t2, score=None, fmt=("best_of", 1), status=None, rnd=None, name=None, orig_h=None, prev=()):
        game = ph.split("-")[0]
        at = now + timedelta(hours=h)
        status = status or ("finished" if score else "not_started")
        winner = None
        if status == "finished":
            winner = t1 if score[0] > score[1] else t2
        b.matches[sid] = PMatch(
            source_id=sid, phase_source_id=ph, game=game, status=status, name=name, scheduled_at=at,
            begin_at=at if status in ("running", "finished") else None,
            end_at=at + timedelta(hours=1) if status == "finished" else None,
            original_scheduled_at=now + timedelta(hours=orig_h) if orig_h is not None else at,
            rescheduled=orig_h is not None, match_type=fmt[0], number_of_games=fmt[1],
            team1_source_id=f"{game}-{t1.lower()}" if t1 else None,
            team2_source_id=f"{game}-{t2.lower()}" if t2 else None,
            score1=score[0] if score else None, score2=score[1] if score else None,
            winner_source_id=f"{game}-{winner.lower()}" if winner else None,
            bracket_round=rnd,
            # "w:x" = vainqueur du match x, "l:x" = perdant ; dans l'ordre des places (équipe 1, équipe 2).
            previous=[{"source_id": p[2:], "type": "winner" if p[0] == "w" else "loser"} for p in prev],
        )

    bo1, bo3, bo5, bo7 = ("best_of", 1), ("best_of", 3), ("best_of", 5), ("best_of", 7)
    ft3, ft4 = ("first_to", 3), ("first_to", 4)
    year = now.year

    # --- League of Legends : Coupe Astrale (fictive) ---
    comp("lol-astrale", "lol", "Coupe Astrale")
    edition("lol-astrale-prev", "lol-astrale", f"Coupe Astrale {year - 1}", year - 1, winner="lol-atl")
    phase("lol-astrale-prev-po", "lol-astrale-prev", "Playoffs", bracket=True)
    match("lol-p1", "lol-astrale-prev-po", -24 * 300, "ATL", "KRK", (3, 0), bo5, rnd="sf", name="Demi-finale 1")
    match("lol-p2", "lol-astrale-prev-po", -24 * 300 + 3, "NOV", "FER", (3, 2), bo5, rnd="sf", name="Demi-finale 2")
    match("lol-p3", "lol-astrale-prev-po", -24 * 299, "ATL", "NOV", (3, 1), bo5, rnd="final", name="Finale", prev=("w:lol-p1", "w:lol-p2"))

    edition("lol-astrale-cur", "lol-astrale", f"Coupe Astrale {year}", year)
    phase("lol-astrale-cur-ga", "lol-astrale-cur", "Groupe A")
    phase("lol-astrale-cur-gb", "lol-astrale-cur", "Groupe B")
    phase("lol-astrale-cur-po", "lol-astrale-cur", "Playoffs", bracket=True)
    ga, gb, po = "lol-astrale-cur-ga", "lol-astrale-cur-gb", "lol-astrale-cur-po"
    match("lol-a1", ga, -50, "NOV", "BAS", (1, 0))
    match("lol-a2", ga, -49, "KRK", "LUW", (1, 0))
    match("lol-a3", ga, -26, "NOV", "LUW", (1, 0))
    match("lol-a4", ga, -25, "BAS", "KRK", (1, 0))
    match("lol-a5", ga, 3, "NOV", "KRK")
    match("lol-a6", ga, 4, "LUW", "BAS")
    match("lol-b1", gb, -48, "ATL", "ECR", (1, 0))
    match("lol-b2", gb, -47, "FER", "OR5", (1, 0))
    match("lol-b3", gb, -24, "ATL", "OR5", (1, 0))
    match("lol-b4", gb, -23, "FER", "ECR", (1, 0))
    match("lol-b5", gb, -22, "ECR", "OR5", (1, 0))
    match("lol-b6", gb, 6, "ATL", "FER")
    match("lol-s1", po, 48, None, None, fmt=bo5, rnd="sf", name="Demi-finale 1 : 1er A contre 2e B")
    match("lol-s2", po, 51, None, None, fmt=bo5, rnd="sf", name="Demi-finale 2 : 1er B contre 2e A")
    match("lol-f", po, 75, None, None, fmt=bo5, rnd="final", name="Finale", prev=("w:lol-s1", "w:lol-s2"))

    # --- Valorant : Vanguard Masters (fictif) ---
    comp("valorant-vanguard", "valorant", "Vanguard Masters")
    edition("valorant-vanguard-cur", "valorant-vanguard", f"Vanguard Masters {year}", year)
    phase("valorant-vanguard-cur-sw", "valorant-vanguard-cur", "Phase suisse")
    phase("valorant-vanguard-cur-po", "valorant-vanguard-cur", "Playoffs", bracket=True)
    sw, vpo = "valorant-vanguard-cur-sw", "valorant-vanguard-cur-po"
    match("val-r1a", sw, -74, "NOV", "PLR", (1, 0), name="Ronde 1")
    match("val-r1b", sw, -73, "KRK", "FAU", (1, 0), name="Ronde 1")
    match("val-r1c", sw, -72, "SOL", "HY7", (1, 0), name="Ronde 1")
    match("val-r1d", sw, -71, "VTX", "FER", (1, 0), name="Ronde 1")
    match("val-r2a", sw, -50, "NOV", "KRK", (2, 1), bo3, name="Ronde 2 (1-0)")
    match("val-r2b", sw, -48, "SOL", "VTX", (2, 0), bo3, name="Ronde 2 (1-0)")
    match("val-r2c", sw, -46, "PLR", "FAU", (2, 1), bo3, name="Ronde 2 (0-1)")
    match("val-r2d", sw, -44, "FER", "HY7", (2, 0), bo3, name="Ronde 2 (0-1)")
    match("val-r3a", sw, 2, "KRK", "FER", fmt=bo3, name="Ronde 3 (1-1)")
    match("val-r3b", sw, 26, "VTX", "PLR", fmt=bo3, name="Ronde 3 (1-1)", status="not_started", orig_h=-3)
    match("val-u1", vpo, 72, None, None, fmt=bo3, rnd="ub_sf", name="Demi-finale du tableau principal 1")
    match("val-u2", vpo, 75, None, None, fmt=bo3, rnd="ub_sf", name="Demi-finale du tableau principal 2")
    match("val-l1", vpo, 96, None, None, fmt=bo3, rnd="lb_r1", name="Repêchage, 1er tour", prev=("l:val-u1", "l:val-u2"))
    match("val-uf", vpo, 99, None, None, fmt=bo3, rnd="ub_final", name="Finale du tableau principal", prev=("w:val-u1", "w:val-u2"))
    match("val-lf", vpo, 120, None, None, fmt=bo3, rnd="lb_final", name="Finale du repêchage", prev=("l:val-uf", "w:val-l1"))
    match("val-gf", vpo, 144, None, None, fmt=bo5, rnd="grand_final", name="Grande finale", prev=("w:val-uf", "w:val-lf"))

    # --- Rocket League : Open Turbo (fictif) ---
    comp("rl-turbo", "rl", "Open Turbo")
    edition("rl-turbo-cur", "rl-turbo", f"Open Turbo {year} · Major d'automne", year, season="Automne")
    phase("rl-turbo-cur-po", "rl-turbo-cur", "Phase finale", bracket=True)
    rp = "rl-turbo-cur-po"
    match("rl-q1", rp, -30, "NOV", "ORB", (3, 1), bo5, rnd="ub_qf", name="Quart du tableau principal 1")
    match("rl-q2", rp, -29, "SOL", "NTV", (3, 2), bo5, rnd="ub_qf", name="Quart du tableau principal 2")
    match("rl-q3", rp, -28, "ATL", "AER", (3, 0), bo5, rnd="ub_qf", name="Quart du tableau principal 3")
    match("rl-q4", rp, -27, "TKT", "MIS", (3, 2), bo5, rnd="ub_qf", name="Quart du tableau principal 4")
    match("rl-l1", rp, -6, "ORB", "NTV", (1, 3), bo5, rnd="lb_r1", name="Repêchage, 1er tour 1", prev=("l:rl-q1", "l:rl-q2"))
    match("rl-l2", rp, -5, "AER", "MIS", (2, 3), bo5, rnd="lb_r1", name="Repêchage, 1er tour 2", prev=("l:rl-q3", "l:rl-q4"))
    match("rl-s1", rp, 0, "NOV", "SOL", (1, 1), bo5, status="running", rnd="ub_sf", name="Demi-finale du tableau principal 1", prev=("w:rl-q1", "w:rl-q2"))
    match("rl-s2", rp, 2, "ATL", "TKT", fmt=bo5, rnd="ub_sf", name="Demi-finale du tableau principal 2", prev=("w:rl-q3", "w:rl-q4"))
    match("rl-l3", rp, 4, "NTV", None, fmt=bo5, rnd="lb_r2", name="Repêchage, 2e tour 1", prev=("w:rl-l1", "l:rl-s2"))
    match("rl-l4", rp, 5, "MIS", None, fmt=bo5, rnd="lb_r2", name="Repêchage, 2e tour 2", prev=("w:rl-l2", "l:rl-s1"))
    match("rl-uf", rp, 24, None, None, fmt=bo5, rnd="ub_final", name="Finale du tableau principal", prev=("w:rl-s1", "w:rl-s2"))
    match("rl-l5", rp, 25, None, None, fmt=bo5, rnd="lb_r3", name="Repêchage, 3e tour", prev=("w:rl-l3", "w:rl-l4"))
    match("rl-lf", rp, 27, None, None, fmt=bo5, rnd="lb_final", name="Finale du repêchage", prev=("l:rl-uf", "w:rl-l5"))
    match("rl-gf", rp, 29, None, None, fmt=bo7, rnd="grand_final", name="Grande finale", prev=("w:rl-uf", "w:rl-lf"))

    # --- Overwatch : Ligue Zénith (fictive) ---
    comp("ow-zenith", "ow", "Ligue Zénith")
    edition("ow-zenith-prev", "ow-zenith", f"Ligue Zénith {year - 1} · Saison 2", year - 1, season="Saison 2", winner="ow-krk")
    phase("ow-zenith-prev-po", "ow-zenith-prev", "Playoffs", bracket=True)
    match("ow-p1", "ow-zenith-prev-po", -24 * 200, "KRK", "NOV", (4, 2), ft4, rnd="final", name="Finale")

    edition("ow-zenith-cur", "ow-zenith", f"Ligue Zénith {year} · Saison 3", year, season="Saison 3")
    phase("ow-zenith-cur-rs", "ow-zenith-cur", "Saison régulière")
    phase("ow-zenith-cur-po", "ow-zenith-cur", "Playoffs", bracket=True)
    rs, opo = "ow-zenith-cur-rs", "ow-zenith-cur-po"
    for i, (t1, t2, sc, h) in enumerate([
        ("NOV", "KRK", (3, 1), -24 * 6), ("SOL", "MIS", (3, 0), -24 * 6 + 2), ("TTF", "AUR", (3, 2), -24 * 6 + 4),
        ("NOV", "SOL", (3, 2), -24 * 5), ("KRK", "TTF", (3, 1), -24 * 5 + 2), ("AUR", "MIS", (3, 1), -24 * 5 + 4),
        ("NOV", "MIS", (3, 0), -24 * 3), ("SOL", "KRK", (3, 2), -24 * 3 + 2), ("TTF", "SOL", (3, 1), -24 * 3 + 4),
        ("NOV", "AUR", (3, 1), -24 * 2), ("AUR", "KRK", (3, 0), -24 * 2 + 2), ("MIS", "TTF", (3, 2), -24 * 2 + 4),
    ]):
        match(f"ow-r{i + 1}", rs, h, t1, t2, sc, ft3, name="Saison régulière")
    match("ow-r13", rs, 20, "SOL", "AUR", fmt=ft3, name="Saison régulière · dernière journée")
    match("ow-r14", rs, 22, "KRK", "MIS", fmt=ft3, name="Saison régulière · dernière journée")
    match("ow-r15", rs, 24, "NOV", "TTF", fmt=ft3, name="Saison régulière · dernière journée")
    match("ow-s1", opo, 72, None, None, fmt=ft3, rnd="sf", name="Demi-finale 1 : 1er contre 4e")
    match("ow-s2", opo, 75, None, None, fmt=ft3, rnd="sf", name="Demi-finale 2 : 2e contre 3e")
    match("ow-f", opo, 98, None, None, fmt=ft4, rnd="final", name="Finale", prev=("w:ow-s1", "w:ow-s2"))

    # Dates des phases et éditions déduites des matchs.
    for ph in b.phases.values():
        times = [m.scheduled_at for m in b.matches.values() if m.phase_source_id == ph.source_id]
        ph.begin_at, ph.end_at = min(times), max(times) + timedelta(hours=2)
    for ed in b.editions.values():
        phases = [p for p in b.phases.values() if p.edition_source_id == ed.source_id]
        ed.begin_at, ed.end_at = min(p.begin_at for p in phases), max(p.end_at for p in phases)
    return b


class DemoProvider:
    source = "demo"

    def resources(self):
        return [("demo:all", build)]

    def fetch_rosters(self, team_source_ids):
        return Batch()  # les effectifs sont déjà fournis par build()
