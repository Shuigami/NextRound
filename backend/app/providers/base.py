"""Format normalisé échangé entre un fournisseur de données et la synchronisation.

Un nouveau fournisseur n'a qu'à produire ces objets : la base, l'API et le frontend n'en savent rien.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

GAMES = ("lol", "valorant", "rl", "ow")


@dataclass
class PPlayer:
    source_id: str
    handle: str
    first_name: str | None = None
    last_name: str | None = None
    role: str | None = None
    nationality: str | None = None
    photo_url: str | None = None


@dataclass
class PTeam:
    source_id: str
    game: str
    name: str
    acronym: str | None = None
    logo_url: str | None = None
    location: str | None = None
    org_key: str | None = None
    org_name: str | None = None
    # None = effectif inconnu (on ne touche pas à l'existant) ; [] = effectif vide confirmé.
    players: list[PPlayer] | None = None


@dataclass
class PCompetition:
    source_id: str
    game: str
    name: str
    logo_url: str | None = None


@dataclass
class PEdition:
    source_id: str
    competition_source_id: str
    name: str
    season: str | None = None
    year: int | None = None
    begin_at: datetime | None = None
    end_at: datetime | None = None
    winner_team_source_id: str | None = None


@dataclass
class PPhase:
    source_id: str
    edition_source_id: str
    name: str
    begin_at: datetime | None = None
    end_at: datetime | None = None
    has_bracket: bool = False


@dataclass
class PMatch:
    source_id: str
    phase_source_id: str
    game: str
    status: str
    name: str | None = None
    scheduled_at: datetime | None = None
    begin_at: datetime | None = None
    end_at: datetime | None = None
    original_scheduled_at: datetime | None = None
    rescheduled: bool = False
    match_type: str | None = None
    number_of_games: int | None = None
    team1_source_id: str | None = None
    team2_source_id: str | None = None
    score1: int | None = None
    score2: int | None = None
    winner_source_id: str | None = None
    forfeit: bool = False
    draw: bool = False
    bracket_round: str | None = None
    # [{"source_id", "type": "winner" | "loser"}] ; None = inconnu (ne pas écraser l'existant)
    previous: list[dict] | None = field(default_factory=list)
    streams: list[dict] = field(default_factory=list)
    modified_at: datetime | None = None


@dataclass
class Batch:
    competitions: dict[str, PCompetition] = field(default_factory=dict)
    editions: dict[str, PEdition] = field(default_factory=dict)
    phases: dict[str, PPhase] = field(default_factory=dict)
    teams: dict[str, PTeam] = field(default_factory=dict)
    matches: dict[str, PMatch] = field(default_factory=dict)


class Provider(Protocol):
    source: str

    def resources(self) -> list[tuple[str, Callable[[], Batch]]]:
        """Ressources à synchroniser (nom, chargeur). Une erreur sur l'une n'arrête pas les autres."""
        ...

    def fetch_rosters(self, team_source_ids: list[str]) -> Batch:
        """Effectifs des équipes demandées."""
        ...

    def fetch_brackets(self, phases: list[tuple[str, str]]) -> Batch:
        """Matchs des tableaux (phase source_id, jeu), avec leurs liens entre matchs."""
        ...
