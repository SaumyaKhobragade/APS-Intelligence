"""Comprehensive tests for SQLite database backup, restore, schema verification, and safety mechanisms."""

from pathlib import Path
import sqlite3
import pytest

from scripts.db_ops import (
    REQUIRED_TABLES,
    SUPPORTED_ALEMBIC_REVISIONS,
    backup_database,
    calculate_sha256,
    check_systemd_service_status,
    get_sqlite_sidecars,
    get_table_counts,
    is_database_locked,
    restore_database,
    verify_schema_and_alembic,
    verify_sqlite_integrity,
)


def create_valid_aps_db(db_path: Path, sample_count: int = 5) -> None:
    """Create a fully compliant SQLite database with all required APS Intelligence tables."""
    conn = sqlite3.connect(db_path.as_posix())
    cur = conn.cursor()
    cur.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)")
    cur.execute("INSERT INTO alembic_version VALUES ('20261027_0005')")
    for tbl in REQUIRED_TABLES:
        if tbl != "alembic_version":
            cur.execute(f"CREATE TABLE {tbl} (id INTEGER PRIMARY KEY, name TEXT)")
    for i in range(sample_count):
        cur.execute("INSERT INTO dataset_metadata (name) VALUES (?)", (f"dataset_{i}",))
        cur.execute("INSERT INTO model_training_runs (name) VALUES (?)", (f"run_{i}",))
    conn.commit()
    conn.close()


def test_valid_backup_creation(tmp_path: Path) -> None:
    source_db = tmp_path / "valid_source.db"
    backup_dir = tmp_path / "backups"
    create_valid_aps_db(source_db, sample_count=3)

    backup_file = backup_database(source_db=source_db, backup_dir=backup_dir, custom_name="valid_backup.db")

    assert backup_file.exists()
    assert backup_file.stat().st_size > 0
    is_valid, msg = verify_sqlite_integrity(backup_file)
    assert is_valid
    assert msg == "ok"

    is_schema_ok, schema_msg = verify_schema_and_alembic(backup_file)
    assert is_schema_ok
    assert "20261027_0005" in schema_msg


def test_corrupt_backup_rejected(tmp_path: Path) -> None:
    corrupt_backup = tmp_path / "corrupt_backup.db"
    corrupt_backup.write_bytes(b"NOT A SQLITE DATABASE HEADER CORRUPTED FILE CONTENT" * 50)

    is_valid, msg = verify_sqlite_integrity(corrupt_backup)
    assert not is_valid

    target_db = tmp_path / "target.db"
    with pytest.raises(ValueError, match="SQLite integrity check"):
        restore_database(backup_file=corrupt_backup, target_db=target_db)


def test_wrong_schema_rejected(tmp_path: Path) -> None:
    wrong_schema_db = tmp_path / "wrong_schema.db"
    conn = sqlite3.connect(wrong_schema_db.as_posix())
    cur = conn.cursor()
    cur.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)")
    cur.execute("INSERT INTO alembic_version VALUES ('20261027_0005')")
    cur.execute("CREATE TABLE random_unrelated_table (id INTEGER PRIMARY KEY)")
    conn.commit()
    conn.close()

    is_schema_ok, msg = verify_schema_and_alembic(wrong_schema_db)
    assert not is_schema_ok
    assert "Missing required application tables" in msg

    target_db = tmp_path / "target.db"
    with pytest.raises(ValueError, match="schema/migration check"):
        restore_database(backup_file=wrong_schema_db, target_db=target_db)


def test_incompatible_alembic_revision_rejected(tmp_path: Path) -> None:
    old_rev_db = tmp_path / "old_rev.db"
    conn = sqlite3.connect(old_rev_db.as_posix())
    cur = conn.cursor()
    cur.execute("CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)")
    cur.execute("INSERT INTO alembic_version VALUES ('20261025_0001')")
    for tbl in REQUIRED_TABLES:
        if tbl != "alembic_version":
            cur.execute(f"CREATE TABLE {tbl} (id INTEGER PRIMARY KEY)")
    conn.commit()
    conn.close()

    is_schema_ok, msg = verify_schema_and_alembic(old_rev_db)
    assert not is_schema_ok
    assert "Incompatible Alembic revision" in msg

    target_db = tmp_path / "target.db"
    with pytest.raises(ValueError, match="schema/migration check"):
        restore_database(backup_file=old_rev_db, target_db=target_db)


def test_missing_backup_file_raises_error(tmp_path: Path) -> None:
    missing_file = tmp_path / "does_not_exist.db"
    target_db = tmp_path / "target.db"

    with pytest.raises(FileNotFoundError, match="Backup file not found"):
        restore_database(backup_file=missing_file, target_db=target_db)


def test_failed_restore_preserves_existing_target(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=10)
    original_sha = calculate_sha256(target_db)
    original_counts = get_table_counts(target_db)

    # Attempt to restore from an invalid backup with corrupted schema
    bad_backup = tmp_path / "bad_schema_backup.db"
    conn = sqlite3.connect(bad_backup.as_posix())
    conn.execute("CREATE TABLE incomplete_table (id INT)")
    conn.commit()
    conn.close()

    with pytest.raises(ValueError, match="schema/migration check"):
        restore_database(backup_file=bad_backup, target_db=target_db)

    # Target database must be completely untouched
    assert calculate_sha256(target_db) == original_sha
    assert get_table_counts(target_db) == original_counts


def test_safety_snapshot_created_when_target_exists(tmp_path: Path) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=7)

    # Valid backup to restore
    backup_file = tmp_path / "source_backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    safety_dir = target_db.parent / "backups"
    assert not safety_dir.exists() or len(list(safety_dir.glob("safety_pre_restore_*.db"))) == 0

    restore_database(backup_file=backup_file, target_db=target_db, confirmed_offline_maintenance=True)

    # Safety snapshot must have been created in backups directory
    safety_snapshots = list(safety_dir.glob("safety_pre_restore_*.db"))
    assert len(safety_snapshots) == 1
    assert safety_snapshots[0].exists()

    # The safety snapshot contains the old target's data (7 rows)
    snapshot_counts = get_table_counts(safety_snapshots[0])
    assert snapshot_counts["dataset_metadata"] == 7

    # The restored target contains the new backup's data (2 rows)
    target_counts = get_table_counts(target_db)
    assert target_counts["dataset_metadata"] == 2


def test_refuse_restore_over_locked_database(tmp_path: Path) -> None:
    target_db = tmp_path / "locked_target.db"
    create_valid_aps_db(target_db, sample_count=3)

    backup_file = tmp_path / "source_backup.db"
    create_valid_aps_db(backup_file, sample_count=1)

    # Open exclusive connection to simulate active running process
    conn = sqlite3.connect(target_db.as_posix())
    conn.execute("BEGIN EXCLUSIVE")

    try:
        assert is_database_locked(target_db)
        with pytest.raises(RuntimeError, match="locked by an active process"):
            restore_database(
                backup_file=backup_file,
                target_db=target_db,
                confirmed_offline_maintenance=True,
            )
    finally:
        conn.rollback()
        conn.close()


def test_successful_restore_and_row_count_preservation(tmp_path: Path) -> None:
    source_db = tmp_path / "source.db"
    create_valid_aps_db(source_db, sample_count=12)
    backup_dir = tmp_path / "backups"
    backup_file = backup_database(source_db=source_db, backup_dir=backup_dir, custom_name="master.db")

    target_db = tmp_path / "restored.db"
    restore_database(backup_file=backup_file, target_db=target_db, confirmed_offline_maintenance=True)

    is_valid, msg = verify_sqlite_integrity(target_db)
    assert is_valid
    assert msg == "ok"

    is_schema_ok, _ = verify_schema_and_alembic(target_db)
    assert is_schema_ok

    src_counts = get_table_counts(backup_file)
    dst_counts = get_table_counts(target_db)
    assert src_counts == dst_counts
    assert dst_counts["dataset_metadata"] == 12
    assert dst_counts["model_training_runs"] == 12


def test_restore_blocked_when_service_is_active(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=4)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=1)

    # Mock service status returning active
    with pytest.raises(RuntimeError, match="actively running.*sudo systemctl stop aps-backend"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            service_status_checker=lambda s: (True, "active (running)"),
        )


def test_restore_succeeds_when_service_is_stopped(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=2)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=8)

    # When service is stopped, restore proceeds even without confirmed_offline_maintenance
    restore_database(
        backup_file=backup_file,
        target_db=target_db,
        service_status_checker=lambda s: (False, "inactive (dead)"),
    )

    dst_counts = get_table_counts(target_db)
    assert dst_counts["dataset_metadata"] == 8


def test_restore_blocked_when_systemd_unavailable_without_confirmation(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=2)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=5)

    # Mock systemd missing
    with pytest.raises(RuntimeError, match="Service manager .* is not available.*--confirmed-offline-maintenance"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=False,
            service_status_checker=lambda s: (None, "systemctl command not found"),
        )


def test_restore_succeeds_when_systemd_unavailable_with_confirmation(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=2)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=9)

    restore_database(
        backup_file=backup_file,
        target_db=target_db,
        confirmed_offline_maintenance=True,
        service_status_checker=lambda s: (None, "systemctl command not found"),
    )

    dst_counts = get_table_counts(target_db)
    assert dst_counts["dataset_metadata"] == 9


def test_wal_and_sidecars_safely_handled_and_archived(tmp_path: Path) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)

    # Simulate existing WAL and SHM sidecars
    wal_file = Path(f"{target_db.as_posix()}-wal")
    shm_file = Path(f"{target_db.as_posix()}-shm")
    wal_file.write_bytes(b"MOCK_OLD_WAL_CONTENT" * 32)
    shm_file.write_bytes(b"MOCK_OLD_SHM_CONTENT" * 16)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=3)

    safety_dir = target_db.parent / "backups"

    restore_database(
        backup_file=backup_file,
        target_db=target_db,
        confirmed_offline_maintenance=True,
    )

    # Verify safety snapshots include sidecars
    safety_dbs = list(safety_dir.glob("safety_pre_restore_*.db"))
    assert len(safety_dbs) == 1
    safety_stem = safety_dbs[0].stem
    safety_wal = safety_dir / f"{safety_dbs[0].name}-wal"
    safety_shm = safety_dir / f"{safety_dbs[0].name}-shm"

    assert safety_wal.exists()
    assert safety_wal.read_bytes() == b"MOCK_OLD_WAL_CONTENT" * 32
    assert safety_shm.exists()
    assert safety_shm.read_bytes() == b"MOCK_OLD_SHM_CONTENT" * 16

    # Verify old sidecars were removed so restored DB does not mix with old WAL
    assert not wal_file.exists()
    assert not shm_file.exists()

    # Restored DB has the new data
    dst_counts = get_table_counts(target_db)
    assert dst_counts["dataset_metadata"] == 3


def test_failed_restore_preserves_target_and_sidecars(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=5)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_content = b"ORIGINAL_ACTIVE_WAL_DATA"
    wal_file.write_bytes(wal_content)

    bad_backup = tmp_path / "bad_backup.db"
    bad_backup.write_bytes(b"INVALID DATA")

    with pytest.raises(ValueError, match="SQLite integrity check"):
        restore_database(
            backup_file=bad_backup,
            target_db=target_db,
            confirmed_offline_maintenance=True,
        )

    # Original target DB and WAL file remain completely intact
    assert wal_file.exists()
    assert wal_file.read_bytes() == wal_content
    counts = get_table_counts(target_db)
    assert counts["dataset_metadata"] == 5


def test_sqlite_sidecar_detection(tmp_path: Path) -> None:
    db_path = tmp_path / "test.db"
    db_path.touch()

    sidecars = get_sqlite_sidecars(db_path)
    assert len(sidecars) == 0

    wal = Path(f"{db_path.as_posix()}-wal")
    journal = Path(f"{db_path.as_posix()}-journal")
    wal.touch()
    journal.touch()

    sidecars = get_sqlite_sidecars(db_path)
    assert set(sidecars.keys()) == {"-wal", "-journal"}
    assert sidecars["-wal"] == wal
    assert sidecars["-journal"] == journal


def test_check_systemd_service_status_unit(monkeypatch) -> None:
    # 1. When systemctl is missing
    monkeypatch.setattr("shutil.which", lambda cmd: None)
    active, msg = check_systemd_service_status("test-service")
    assert active is None
    assert "not found" in msg

    # 2. When systemctl reports active (returncode 0)
    class MockProcessActive:
        returncode = 0
        stdout = "active\n"
        stderr = ""

    monkeypatch.setattr("shutil.which", lambda cmd: "/usr/bin/systemctl")
    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: MockProcessActive())
    active, msg = check_systemd_service_status("test-service")
    assert active is True
    assert msg == "active"

    # 3. When systemctl reports inactive (returncode 3)
    class MockProcessInactive:
        returncode = 3
        stdout = "inactive\n"
        stderr = ""

    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: MockProcessInactive())
    active, msg = check_systemd_service_status("test-service")
    assert active is False
    assert msg == "inactive"
