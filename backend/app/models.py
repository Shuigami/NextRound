"""Schéma : compétition (league) → édition (serie) → phase (tournament) → match.

Chaque ligne porte `source` (demo | pandascore) et `source_id` : les deux jeux de données
cohabitent sans jamais se mélanger, et un autre fournisseur pourra être ajouté plus tard.
"""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _sourced(table: str):
    return (UniqueConstraint("source", "source_id", name=f"uq_{table}_source"),)


class Organization(Base):
    __tablename__ = "organizations"
    __table_args__ = _sourced("organizations")
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    logo_url: Mapped[str | None] = mapped_column(Text)
    teams: Mapped[list["Team"]] = relationship(back_populates="organization")


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = _sourced("teams")
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(64))
    game: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(200))
    acronym: Mapped[str | None] = mapped_column(String(20))
    logo_url: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(10))
    organization_id: Mapped[int | None] = mapped_column(ForeignKey("organizations.id"))
    roster_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    organization: Mapped[Organization | None] = relationship(back_populates="teams")
    players: Mapped[list["Player"]] = relationship(back_populates="team", cascade="all, delete-orphan")


class Player(Base):
    __tablename__ = "players"
    __table_args__ = _sourced("players")
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(64))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), index=True)
    handle: Mapped[str] = mapped_column(String(100))
    first_name: Mapped[str | None] = mapped_column(String(100))
    last_name: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[str | None] = mapped_column(String(50))
    nationality: Mapped[str | None] = mapped_column(String(10))
    photo_url: Mapped[str | None] = mapped_column(Text)
    team: Mapped[Team | None] = relationship(back_populates="players")


class Competition(Base):
    __tablename__ = "competitions"
    __table_args__ = _sourced("competitions")
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(64))
    game: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(200))
    logo_url: Mapped[str | None] = mapped_column(Text)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    editions: Mapped[list["Edition"]] = relationship(back_populates="competition")


class Edition(Base):
    __tablename__ = "editions"
    __table_args__ = _sourced("editions")
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(64))
    competition_id: Mapped[int] = mapped_column(ForeignKey("competitions.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    season: Mapped[str | None] = mapped_column(String(50))
    year: Mapped[int | None] = mapped_column(Integer)
    begin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    winner_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    competition: Mapped[Competition] = relationship(back_populates="editions")
    phases: Mapped[list["Phase"]] = relationship(back_populates="edition", order_by="Phase.begin_at")


class Phase(Base):
    __tablename__ = "phases"
    __table_args__ = _sourced("phases")
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(64))
    edition_id: Mapped[int] = mapped_column(ForeignKey("editions.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    begin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    has_bracket: Mapped[bool] = mapped_column(Boolean, default=False)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    edition: Mapped[Edition] = relationship(back_populates="phases")
    matches: Mapped[list["Match"]] = relationship(back_populates="phase", order_by="Match.scheduled_at")


class Match(Base):
    __tablename__ = "matches"
    __table_args__ = _sourced("matches")
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20), index=True)
    source_id: Mapped[str] = mapped_column(String(64))
    phase_id: Mapped[int] = mapped_column(ForeignKey("phases.id"), index=True)
    game: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str | None] = mapped_column(String(300))
    # not_started | running | finished | postponed | canceled
    status: Mapped[str] = mapped_column(String(20), index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    begin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    original_scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rescheduled: Mapped[bool] = mapped_column(Boolean, default=False)
    # best_of | first_to | all_games_played | ...
    match_type: Mapped[str | None] = mapped_column(String(30))
    number_of_games: Mapped[int | None] = mapped_column(Integer)
    team1_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), index=True)
    team2_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), index=True)
    score1: Mapped[int | None] = mapped_column(Integer)
    score2: Mapped[int | None] = mapped_column(Integer)
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    forfeit: Mapped[bool] = mapped_column(Boolean, default=False)
    draw: Mapped[bool] = mapped_column(Boolean, default=False)
    # Clé de tour définie dans le fichier de règles de la phase (ex. "ub_sf"). Absente si inconnue.
    bracket_round: Mapped[str | None] = mapped_column(String(50))
    # Matchs qui alimentent celui-ci, dans l'ordre des places : [{"source_id": "...", "type": "winner" | "loser"}].
    previous: Mapped[list] = mapped_column(JSON, default=list)
    streams: Mapped[list] = mapped_column(JSON, default=list)
    source_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    phase: Mapped[Phase] = relationship(back_populates="matches")
    team1: Mapped[Team | None] = relationship(foreign_keys=[team1_id])
    team2: Mapped[Team | None] = relationship(foreign_keys=[team2_id])


class SyncState(Base):
    __tablename__ = "sync_state"
    __table_args__ = (UniqueConstraint("source", "resource", name="uq_sync_state"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(20))
    resource: Mapped[str] = mapped_column(String(100))
    last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    items: Mapped[int] = mapped_column(Integer, default=0)


class User(Base):
    """Compte facultatif : il ne sert qu'à synchroniser les préférences (favoris, anti-spoil) entre appareils."""
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("google_sub", name="uq_users_google_sub"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    # Vide pour un compte créé via Google : la connexion par mot de passe est alors refusée.
    password_hash: Mapped[str | None] = mapped_column(String(200))
    google_sub: Mapped[str | None] = mapped_column(String(64))
    # Copie des clés localStorage synchronisées : {"nextround:demo:favorites": "{...}", ...}
    prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    # Empreinte SHA-256 du jeton : une fuite de la base ne donne accès à aucune session.
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
