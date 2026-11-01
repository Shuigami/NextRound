from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Chemin absolu : le .env du backend est lu quel que soit le dossier de lancement.
    model_config = SettingsConfigDict(env_file=Path(__file__).resolve().parent.parent / ".env", extra="ignore")

    # "demo" sert des données fictives, "pandascore" des données réelles. Les deux ne se mélangent jamais.
    data_mode: Literal["demo", "pandascore"] = "demo"
    database_url: str = "postgresql+psycopg://nextround:nextround@localhost:5432/nextround"
    pandascore_token: str = ""
    pandascore_base_url: str = "https://api.pandascore.co"
    # Offre gratuite : 1000 req/h et 60 req/min. Un cycle complet consomme ~20 requêtes.
    sync_interval_minutes: int = 15
    sync_on_startup: bool = True
    rules_dir: Path = Path(__file__).resolve().parent.parent / "rules"
    cors_origins: str = "http://localhost:3000"
    # Connexion Google facultative : sans identifiants, le bouton n'apparaît pas.
    google_client_id: str = ""
    google_client_secret: str = ""
    # Adresse vue par le navigateur ; Google y renvoie après connexion ({public_url}/api/auth/google/callback).
    public_url: str = "http://localhost:3000"
    # Envoi des e-mails (vérification, mot de passe oublié). Sans SMTP_HOST, ils sont écrits dans les logs du backend.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    mail_from: str = "NextRound <no-reply@localhost>"

    @property
    def source(self) -> str:
        return self.data_mode


@lru_cache
def get_settings() -> Settings:
    return Settings()
