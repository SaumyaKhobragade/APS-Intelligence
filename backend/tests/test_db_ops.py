"""Tests for SQLite database backup, restore, and integrity operations."""

from pathlib import Path
import sqlite3

from scripts.db_ops import (
    backup_database,
    calculate_sha256,
    get_table_counts,
    restore_database,
    verify_sqlite_integrity,
)


def test_backup_and_restore_cycle(tmp_path: Path) -> None:
    source_db = tmp_path / "source.db"
    backup_dir = tmp_path / "backups"
    restore_target = tmp_path / "restored.db"

    # Seed source database with schema and data
    conn = sqlite3.connect(source_db.as_posix())
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE sample_data (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
    cursor.execute("INSERT INTO sample_data (value) VALUES ('alpha'), ('beta'), ('gamma')")
    conn.commit()
    conn.close()

    # 1. Verify source
    is_valid, msg = verify_sqlite_integrity(source_db)
    assert is_valid
    assert msg == "ok"

    # 2. Execute backup
    backup_file = backup_database(source_db=source_db, backup_dir=backup_dir, custom_name="test_backup.db")
    assert backup_file.exists()
    assert backup_file.stat().st_size > 0
    assert len(calculate_sha256(backup_file)) == 64
    assert get_table_counts(backup_file).get("sample_data") == 3

    # 3. Restore to target
    restore_database(backup_file=backup_file, target_db=restore_target, force=True)
    assert restore_target.exists()

    # 4. Verify restored database
    is_valid, msg = verify_sqlite_integrity(restore_target)
    assert is_valid
    assert msg == "ok"

    counts = get_table_counts(restore_target)
    assert counts.get("sample_data") == 3
