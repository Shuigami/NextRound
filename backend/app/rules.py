"""Règles pédagogiques et de qualification, définies par ÉDITION et par PHASE (jamais par jeu).

Stockées dans rules/*.yaml, séparées des résultats. Chaque fichier cite ses sources et sa date de vérification.
Un fichier invalide fait échouer le démarrage : mieux vaut aucune règle qu'une règle fausse.
"""

from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, model_validator

from .config import get_settings

OutcomeKind = Literal["qualified", "eliminated", "advance", "lower_bracket", "title", "runner_up", "continue"]


class Source(BaseModel):
    label: str
    url: str | None = None


class Outcome(BaseModel):
    kind: OutcomeKind
    label: str


class SeriesFormat(BaseModel):
    type: Literal["best_of", "first_to"]
    value: int
    applies_to: str


class RankOutcome(Outcome):
    ranks: list[int]


class Tiebreaker(BaseModel):
    # Seul head_to_head est calculé automatiquement (égalité à deux). Les autres → « départage » affiché tel quel.
    key: Literal["head_to_head", "game_differential", "tiebreaker_match", "other"]
    label: str


class Round(BaseModel):
    key: str
    name: str
    section: Literal["upper", "lower", "final"] | None = None
    on_win: Outcome
    on_loss: Outcome


class PhaseRules(BaseModel):
    key: str
    phase_source_ids: list[str]
    name: str
    type: Literal["round_robin", "swiss", "single_elimination", "double_elimination"]
    participants: int
    summary: str
    formats: list[SeriesFormat]
    qualification: str
    elimination: str
    group_count: int = 1
    rank_outcomes: list[RankOutcome] = []
    tiebreakers: list[Tiebreaker] = []
    wins_to_qualify: int | None = None
    losses_to_eliminate: int | None = None
    swiss_qualified: Outcome | None = None
    swiss_eliminated: Outcome | None = None
    pairing: str | None = None
    rounds: list[Round] = []
    exceptions: list[str] = []
    details: list[str] = []

    @model_validator(mode="after")
    def _check(self):
        if self.type == "round_robin":
            size = self.participants // self.group_count
            covered = sorted(r for o in self.rank_outcomes for r in o.ranks)
            if covered != list(range(1, size + 1)):
                raise ValueError(f"{self.key}: rank_outcomes doit couvrir les places 1 à {size} exactement une fois")
        if self.type == "swiss" and not (self.wins_to_qualify and self.losses_to_eliminate and self.swiss_qualified and self.swiss_eliminated):
            raise ValueError(f"{self.key}: une ronde suisse exige wins_to_qualify, losses_to_eliminate et leurs issues")
        if self.type.endswith("elimination") and not self.rounds:
            raise ValueError(f"{self.key}: un tableau à élimination exige la liste des tours (rounds)")
        return self

    def round(self, key: str | None) -> Round | None:
        return next((r for r in self.rounds if r.key == key), None)


class EditionRules(BaseModel):
    key: str
    source: Literal["demo", "pandascore"]
    edition_source_id: str
    is_fictional: bool
    verified_at: date
    sources: list[Source]
    summary_30s: list[str]
    circuit: str
    rewards: list[str]
    participants: int
    phases: list[PhaseRules]

    @model_validator(mode="after")
    def _check(self):
        if not self.sources:
            raise ValueError(f"{self.key}: au moins une source est obligatoire")
        return self


class RulesIndex:
    def __init__(self, files: list[EditionRules]):
        self.editions = {(r.source, r.edition_source_id): r for r in files}
        self.phases = {(r.source, sid): (r, p) for r in files for p in r.phases for sid in p.phase_source_ids}

    def for_edition(self, source: str, edition_source_id: str) -> EditionRules | None:
        return self.editions.get((source, edition_source_id))

    def for_phase(self, source: str, phase_source_id: str) -> PhaseRules | None:
        hit = self.phases.get((source, phase_source_id))
        return hit[1] if hit else None


def load_rules(directory: Path) -> RulesIndex:
    files = []
    for path in sorted(directory.glob("*.yaml")):
        try:
            files.append(EditionRules.model_validate(yaml.safe_load(path.read_text(encoding="utf-8"))))
        except Exception as exc:
            raise ValueError(f"Fichier de règles invalide {path.name} : {exc}") from exc
    return RulesIndex(files)


@lru_cache
def get_rules() -> RulesIndex:
    return load_rules(get_settings().rules_dir)
