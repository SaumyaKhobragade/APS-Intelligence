"""Centralized environment-backed application settings."""

from functools import lru_cache
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Annotated

from pydantic import Field, field_validator, model_validator
try:
    from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict  # type: ignore[attr-defined]
except ImportError:  # pydantic-settings 2.5.x has no NoDecode marker.
    from pydantic_settings import BaseSettings, SettingsConfigDict

    class NoDecode:  # type: ignore[no-redef]
        """Compatibility marker; newer pydantic-settings provides this class."""


# Documented base directory for relative path resolution (the backend root directory)
BACKEND_BASE_DIR: Path = Path(__file__).resolve().parents[2]


def is_path_absolute(path_str: str) -> bool:
    """Return True if path string represents an absolute path on POSIX or Windows.

    Reliably recognizes:
    - POSIX absolute paths (e.g. /var/data/aps.db)
    - Windows drive letter paths on any platform (e.g. C:/data/aps.db, C:\\data\\aps.db)
    - Windows UNC network paths (e.g. \\\\server\\share\\data)
    """
    if not path_str or not path_str.strip():
        return False
    trimmed = path_str.strip()
    return (
        PurePosixPath(trimmed).is_absolute()
        or PureWindowsPath(trimmed).is_absolute()
        or trimmed.startswith("/")
        or trimmed.startswith("\\")
    )


class Settings(BaseSettings):
    """Runtime configuration for the API process.

    The defaults are intentionally local-development friendly. Production
    deployments should provide values through environment variables or a
    private `.env` file outside version control.
    """

    model_config = SettingsConfigDict(
        env_file=(".env", "backend/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_base_dir: Path = BACKEND_BASE_DIR
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
    expected_feature_count: int = Field(default=170, ge=1)
    target_column_name: str = "class"
    default_classification_threshold: float = Field(default=0.5, ge=0, le=1)
    false_positive_cost: float = Field(default=1.0, ge=0)
    false_negative_cost: float = Field(default=10.0, ge=0)
    default_prediction_run_id: str | None = Field(default=None, min_length=1, max_length=80)
    default_prediction_experiment_id: str | None = Field(default=None, min_length=1, max_length=80)
    default_prediction_policy_id: str | None = Field(default=None, min_length=1, max_length=80)
    prediction_batch_max_size: int = Field(default=100, ge=1, le=1000)
    prediction_model_cache_size: int = Field(default=8, ge=1, le=64)
    analytics_export_max_rows: int = Field(default=5000, ge=100, le=100_000)
    analytics_feature_page_max_size: int = Field(default=200, ge=1, le=1000)
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

    @model_validator(mode="after")
    def validate_and_normalize(self) -> "Settings":
        if self.environment.lower() == "production":
            for origin in self.allowed_cors_origins:
                if origin.strip() == "*":
                    raise ValueError("Wildcard '*' CORS origin is strictly forbidden in production mode.")

        base_dir = self.app_base_dir.resolve()

        # Deterministic resolution of storage paths against documented base_dir
        if not self.persistent_storage_dir.is_absolute():
            self.persistent_storage_dir = (base_dir / self.persistent_storage_dir).resolve()

        if not self.dataset_storage_dir.is_absolute():
            self.dataset_storage_dir = (base_dir / self.dataset_storage_dir).resolve()

        if not self.model_artifact_dir.is_absolute():
            self.model_artifact_dir = (base_dir / self.model_artifact_dir).resolve()

        if not self.report_storage_dir.is_absolute():
            self.report_storage_dir = (base_dir / self.report_storage_dir).resolve()

        # Deterministic resolution of SQLite database URL
        if self.database_url.startswith("sqlite:///"):
            db_path_raw = self.database_url[len("sqlite:///"):]
            if db_path_raw != ":memory:" and not db_path_raw.startswith("file:"):
                query = ""
                if "?" in db_path_raw:
                    db_path_raw, query = db_path_raw.split("?", 1)
                    query = f"?{query}"
                if not is_path_absolute(db_path_raw):
                    resolved_p = (base_dir / Path(db_path_raw)).resolve()
                    self.database_url = f"sqlite:///{resolved_p.as_posix()}{query}"

        return self

    def ensure_storage_directories(self) -> None:
        """Create local artifact directories without touching database data."""

        self.persistent_storage_dir.mkdir(parents=True, exist_ok=True)
        self.dataset_storage_dir.joinpath("raw").mkdir(parents=True, exist_ok=True)
        self.dataset_storage_dir.joinpath("reference").mkdir(parents=True, exist_ok=True)
        self.dataset_storage_dir.joinpath("processed").mkdir(parents=True, exist_ok=True)
        self.split_storage_dir.mkdir(parents=True, exist_ok=True)
        self.dataset_metadata_dir.mkdir(parents=True, exist_ok=True)
        self.model_artifact_dir.mkdir(parents=True, exist_ok=True)
        self.report_storage_dir.mkdir(parents=True, exist_ok=True)

    @property
    def raw_dataset_dir(self) -> Path:
        return self.dataset_storage_dir / "raw"

    @property
    def reference_dataset_dir(self) -> Path:
        return self.dataset_storage_dir / "reference"

    @property
    def processed_dataset_dir(self) -> Path:
        return self.dataset_storage_dir / "processed"

    @property
    def split_storage_dir(self) -> Path:
        return self.dataset_storage_dir / "splits"

    @property
    def dataset_metadata_dir(self) -> Path:
        return self.dataset_storage_dir / "metadata"

    @property
    def training_dataset_filename(self) -> str:
        return "aps_failure_training_set.csv"

    @property
    def official_test_dataset_filename(self) -> str:
        return "aps_failure_test_set.csv"

    @property
    def target_column(self) -> str:
        return self.target_column_name


@lru_cache
def get_settings() -> Settings:
    """Return the process-wide immutable-by-convention settings object."""

    return Settings()
