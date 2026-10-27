"""Tests for deterministic configuration path resolution and security validation."""

from pathlib import Path
import pytest

from app.core.config import BACKEND_BASE_DIR, Settings, is_path_absolute


def test_is_path_absolute_detects_posix_and_windows() -> None:
    assert is_path_absolute("/var/data/aps.db")
    assert is_path_absolute("\\var\\data\\aps.db")
    assert is_path_absolute("C:/data/aps.db")
    assert not is_path_absolute("./data/aps.db")
    assert not is_path_absolute("data/aps.db")
    assert not is_path_absolute("../data/aps.db")


def test_default_relative_paths_resolve_to_backend_base_dir() -> None:
    settings = Settings()
    expected_storage = (BACKEND_BASE_DIR / "data").resolve()
    expected_db_file = (BACKEND_BASE_DIR / "data" / "aps_intelligence.db").resolve()

    assert settings.persistent_storage_dir == expected_storage
    assert settings.database_url == f"sqlite:///{expected_db_file.as_posix()}"
    assert settings.dataset_storage_dir == (BACKEND_BASE_DIR / "datasets").resolve()
    assert settings.model_artifact_dir == (BACKEND_BASE_DIR / "artifacts" / "models").resolve()
    assert settings.report_storage_dir == (BACKEND_BASE_DIR / "artifacts" / "reports").resolve()


def test_custom_base_dir_resolves_non_existing_and_existing_relative_paths(tmp_path: Path) -> None:
    custom_base = tmp_path / "custom_root"
    custom_base.mkdir()

    # Relative path that does not yet exist
    settings = Settings(
        app_base_dir=custom_base,
        persistent_storage_dir=Path("./non_existing_dir"),
        database_url="sqlite:///./db/non_existing.db",
    )
    assert settings.persistent_storage_dir == (custom_base / "non_existing_dir").resolve()
    assert settings.database_url == f"sqlite:///{(custom_base / 'db' / 'non_existing.db').resolve().as_posix()}"

    # Relative path that already exists
    existing_dir = custom_base / "existing_dir"
    existing_dir.mkdir()
    settings2 = Settings(
        app_base_dir=custom_base,
        persistent_storage_dir=Path("./existing_dir"),
    )
    assert settings2.persistent_storage_dir == existing_dir.resolve()


def test_explicit_absolute_paths_are_strictly_preserved(tmp_path: Path) -> None:
    abs_storage = (tmp_path / "explicit_storage").resolve()
    abs_db = f"sqlite:///{(tmp_path / 'explicit.db').resolve().as_posix()}"

    settings = Settings(
        persistent_storage_dir=abs_storage,
        database_url=abs_db,
    )
    assert settings.persistent_storage_dir == abs_storage
    assert settings.database_url == abs_db


def test_posix_absolute_urls_are_preserved_without_alteration() -> None:
    posix_url = "sqlite:////var/data/aps-intelligence/data/aps_intelligence.db"
    settings = Settings(database_url=posix_url)
    assert settings.database_url == posix_url


def test_in_memory_sqlite_url_preserved() -> None:
    settings = Settings(database_url="sqlite:///:memory:")
    assert settings.database_url == "sqlite:///:memory:"


def test_query_params_preserved_on_relative_sqlite_url(tmp_path: Path) -> None:
    settings = Settings(
        app_base_dir=tmp_path,
        database_url="sqlite:///./data/app.db?cache=shared&mode=rwc",
    )
    expected_path = (tmp_path / "data" / "app.db").resolve().as_posix()
    assert settings.database_url == f"sqlite:///{expected_path}?cache=shared&mode=rwc"


def test_production_cors_wildcard_rejected() -> None:
    with pytest.raises(ValueError, match="Wildcard '\\*' CORS origin is strictly forbidden in production mode"):
        Settings(environment="production", allowed_cors_origins=["*"])

    # Permitted origins in production
    settings = Settings(
        environment="production",
        allowed_cors_origins=["https://aps.example.com", "https://api.example.com"],
    )
    assert settings.allowed_cors_origins == ["https://aps.example.com", "https://api.example.com"]
