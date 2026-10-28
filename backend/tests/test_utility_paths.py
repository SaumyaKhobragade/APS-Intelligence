"""AUDIT-004 regression tests: standalone utility database path consistency."""

from __future__ import annotations

import os
from pathlib import Path
import pytest

from app.core.config import Settings
from scripts.db_ops import (
    DEFAULT_BACKUP_DIR,
    DEFAULT_DB_PATH,
    resolve_default_paths,
)


def test_default_paths_are_absolute() -> None:
    db_path, backup_dir = resolve_default_paths()
    assert db_path.is_absolute(), f"DEFAULT_DB_PATH is not absolute: {db_path}"
    assert backup_dir.is_absolute(), f"DEFAULT_BACKUP_DIR is not absolute: {backup_dir}"
    assert DEFAULT_DB_PATH.is_absolute()
    assert DEFAULT_BACKUP_DIR.is_absolute()


def test_paths_match_settings_persistent_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    custom_dir = tmp_path / "custom_data"
    custom_dir.mkdir()
    custom_db = custom_dir / "custom.db"

    monkeypatch.setenv("PERSISTENT_STORAGE_DIR", str(custom_dir))
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{custom_db}")

    # Re-evaluate with modified environment
    from app.core.config import get_settings

    get_settings.cache_clear()
    try:
        resolved_db, resolved_backup = resolve_default_paths()
        assert resolved_db == custom_db.resolve()
        assert resolved_backup == (custom_dir / "backups").resolve()
    finally:
        get_settings.cache_clear()


def test_no_database_created_in_arbitrary_cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Change cwd to empty tmp_path
    monkeypatch.chdir(tmp_path)

    # Calling resolve_default_paths must not create any files in cwd
    db_path, backup_dir = resolve_default_paths()
    assert not (tmp_path / "data").exists()
    assert not (tmp_path / "aps_intelligence.db").exists()
    assert db_path.is_absolute()
    assert backup_dir.is_absolute()
