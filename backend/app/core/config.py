"""Centralized environment-backed application settings."""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration for the API process.

    The defaults are intentionally local-development friendly. Production
    deployments should provide values through environment variables or a
    private `.env` file outside version control.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "APS Intelligence API"
    app_version: str = "0.1.0"
    environment: str = "development"
    api_prefix: str = "/api/v1"
    backend_host: str = "127.0.0.1"
    backend_port: int = Field(default=8000, ge=1, le=65535)
    persistent_storage_dir: Path = Path("./data")
    database_url: str = "sqlite:///./data/aps_intelligence.db"
    allowed_cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    dataset_storage_dir: Path = Path("./datasets")
    model_artifact_dir: Path = Path("./artifacts/models")
    report_storage_dir: Path = Path("./artifacts/reports")
    log_level: str = "INFO"

    @field_validator("api_prefix")
    @classmethod
    def normalize_api_prefix(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            return ""
        return f"/{normalized.strip('/')}"

    @field_validator("allowed_cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            if not value:
                return []
            if value.startswith("["):
                import json

                return json.loads(value)
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    def ensure_storage_directories(self) -> None:
        """Create local artifact directories without touching database data."""

        self.persistent_storage_dir.mkdir(parents=True, exist_ok=True)
        self.dataset_storage_dir.joinpath("raw").mkdir(parents=True, exist_ok=True)
        self.dataset_storage_dir.joinpath("reference").mkdir(parents=True, exist_ok=True)
        self.dataset_storage_dir.joinpath("processed").mkdir(parents=True, exist_ok=True)
        self.model_artifact_dir.mkdir(parents=True, exist_ok=True)
        self.report_storage_dir.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide immutable-by-convention settings object."""

    return Settings()
