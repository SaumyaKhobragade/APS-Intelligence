"""Comprehensive tests for SQLite database backup, restore, schema verification, and safety mechanisms."""

from pathlib import Path
import shutil
import sqlite3
import subprocess
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
    with pytest.raises(RuntimeError, match="Service manager \\(systemd\\) could not verify service status.*--confirmed-offline-maintenance"):
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


@pytest.mark.parametrize(
    ("stdout", "returncode", "expected_active", "expected_msg_snippet"),
    [
        # Explicitly active
        ("LoadState=loaded\nActiveState=active\nSubState=running\n", 0, True, "active (running"),
        # Active with unusual or masked LoadState (always True regardless of LoadState)
        ("LoadState=masked\nActiveState=active\nSubState=running\n", 0, True, "active (running"),
        ("LoadState=not-found\nActiveState=active\nSubState=running\n", 0, True, "active (running"),
        # Explicitly inactive
        ("LoadState=loaded\nActiveState=inactive\nSubState=dead\n", 0, False, "inactive (dead)"),
        ("LoadState=loaded\nActiveState=inactive\nSubState=inactive\n", 0, False, "inactive (inactive)"),
        # Failed but positively stopped
        ("LoadState=loaded\nActiveState=failed\nSubState=dead\n", 0, False, "failed/stopped (dead)"),
        ("LoadState=loaded\nActiveState=failed\nSubState=failed\n", 0, False, "failed/stopped (failed)"),
        # Failed but auto-restart (classified as active/unsafe: True)
        ("LoadState=loaded\nActiveState=failed\nSubState=auto-restart\n", 0, True, "auto-restart"),
        # Missing / unknown unit (inactive)
        ("LoadState=not-found\nActiveState=inactive\nSubState=dead\n", 0, None, "not found"),
        ("LoadState=masked\nActiveState=inactive\nSubState=dead\n", 0, None, "not found"),
        # Transitioning states
        ("LoadState=loaded\nActiveState=activating\nSubState=start-pre\n", 0, "transitioning", "transitioning (activating"),
        ("LoadState=loaded\nActiveState=deactivating\nSubState=stop-sigterm\n", 0, "transitioning", "transitioning (deactivating"),
        ("LoadState=loaded\nActiveState=reloading\nSubState=reload\n", 0, "transitioning", "transitioning (reloading"),
        # Unrecognized / unknown
        ("LoadState=loaded\nActiveState=unknown\nSubState=other\n", 0, None, "unrecognized/ambiguous state"),
    ],
)
def test_check_systemd_service_status_property_classifications(
    monkeypatch,
    stdout: str,
    returncode: int,
    expected_active: bool | str | None,
    expected_msg_snippet: str,
) -> None:
    class MockProcess:
        def __init__(self, out: str, code: int):
            self.stdout = out
            self.stderr = ""
            self.returncode = code

    monkeypatch.setattr("shutil.which", lambda cmd: "/usr/bin/systemctl")
    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: MockProcess(stdout, returncode))

    active, msg = check_systemd_service_status("test-service")
    assert active == expected_active
    assert expected_msg_snippet in msg


def test_check_systemd_service_status_errors(monkeypatch) -> None:
    # 1. Missing systemctl binary
    monkeypatch.setattr("shutil.which", lambda cmd: None)
    active, msg = check_systemd_service_status("test-service")
    assert active is None
    assert "command not found" in msg

    # 2. Systemd not booted or command execution error (returncode != 0)
    class MockProcessFail:
        returncode = 1
        stdout = ""
        stderr = "Failed to connect to bus: Host is down"

    monkeypatch.setattr("shutil.which", lambda cmd: "/usr/bin/systemctl")
    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: MockProcessFail())
    active, msg = check_systemd_service_status("test-service")
    assert active is None
    assert "systemctl execution failed" in msg

    # 3. Timeout
    def mock_timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd="systemctl", timeout=5.0)

    monkeypatch.setattr("subprocess.run", mock_timeout)
    active, msg = check_systemd_service_status("test-service")
    assert active is None
    assert "timed out" in msg

    # 4. OS / Permission error
    def mock_oserror(*args, **kwargs):
        raise PermissionError("EACCES: permission denied")

    monkeypatch.setattr("subprocess.run", mock_oserror)
    active, msg = check_systemd_service_status("test-service")
    assert active is None
    assert "execution error" in msg


def test_restore_refuses_active_service_even_with_confirmation(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=3)
    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=1)

    with pytest.raises(RuntimeError, match="actively running or transitioning.*sudo systemctl stop aps-backend"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (True, "active (running)"),
        )


def test_restore_refuses_transitioning_service_even_with_confirmation(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=3)
    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=1)

    with pytest.raises(RuntimeError, match="actively running or transitioning.*transitioning"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: ("transitioning", "transitioning (activating: start-pre)"),
        )


def test_restore_refuses_failed_auto_restart_even_with_confirmation(tmp_path: Path) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    with pytest.raises(RuntimeError, match="actively running or transitioning.*failed \\(auto-restart"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (True, "failed (auto-restart: service is restarting, LoadState=loaded)"),
        )

    # Invariants verification
    assert target_db.exists()
    assert get_table_counts(target_db)["dataset_metadata"] == 6
    assert wal_file.exists()
    assert wal_file.read_bytes() == b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8
    assert len(list(target_db.parent.glob("*.staged_old_*"))) == 0
    assert len(list(target_db.parent.glob("*.tmp_restore_*"))) == 0


def test_restore_refuses_masked_active_service_even_with_confirmation(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    class MockMaskedActiveProcess:
        stdout = "LoadState=masked\nActiveState=active\nSubState=running\n"
        stderr = ""
        returncode = 0

    monkeypatch.setattr("shutil.which", lambda cmd: "/usr/bin/systemctl")
    monkeypatch.setattr("subprocess.run", lambda *args, **kwargs: MockMaskedActiveProcess())

    with pytest.raises(RuntimeError, match="actively running or transitioning.*active \\(running, LoadState=masked\\)"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
        )

    # Invariants verification
    assert target_db.exists()
    assert get_table_counts(target_db)["dataset_metadata"] == 6
    assert wal_file.exists()
    assert wal_file.read_bytes() == b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8


def test_is_database_locked_fail_closed_on_unexpected_errors(tmp_path: Path, monkeypatch) -> None:
    test_db = tmp_path / "test.db"
    create_valid_aps_db(test_db, sample_count=2)

    # 1. Available -> returns False
    assert is_database_locked(test_db) is False

    # 2. Unexpected SQLite operational error -> raises RuntimeError
    def mock_sqlite_op_error(*args, **kwargs):
        raise sqlite3.OperationalError("disk I/O error: simulated hardware failure")

    monkeypatch.setattr(sqlite3, "connect", mock_sqlite_op_error)
    with pytest.raises(RuntimeError, match="unexpected SQLite operational error"):
        is_database_locked(test_db)

    # 3. Unexpected OS / Exception error -> raises RuntimeError
    def mock_perm_error(*args, **kwargs):
        raise PermissionError("Access denied")

    monkeypatch.setattr(sqlite3, "connect", mock_perm_error)
    with pytest.raises(RuntimeError, match="unexpected error \\(PermissionError\\)"):
        is_database_locked(test_db)


def test_restore_refuses_when_lock_status_undetermined(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "target.db"
    create_valid_aps_db(target_db, sample_count=3)
    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=1)

    # Mock is_database_locked to raise RuntimeError
    def mock_locked_error(p):
        raise RuntimeError("Disk failure during lock probe")

    monkeypatch.setattr("scripts.db_ops.is_database_locked", mock_locked_error)

    with pytest.raises(RuntimeError, match="Lock status on .* could not be determined"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (False, "inactive (dead)"),
        )


# =========================================================================
# FAULT-INJECTION TESTS: Failure-Safe Staging, Replacement & Rollback
# =========================================================================

def test_fault_injection_failure_during_staging(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    # Monkeypatch backup method to fail during staging restore
    class FailBackupConn:
        def __init__(self, *args, **kwargs):
            pass
        def backup(self, dest):
            raise RuntimeError("Injected staging backup write failure")
        def close(self):
            pass

    # Patch only when connecting to temporary target
    original_connect = sqlite3.connect
    def mock_connect(uri_or_path, *args, **kwargs):
        if "tmp_restore" in str(uri_or_path):
            return FailBackupConn()
        return original_connect(uri_or_path, *args, **kwargs)

    monkeypatch.setattr(sqlite3, "connect", mock_connect)

    with pytest.raises(RuntimeError, match="Restore failed during staging restore.*Original database remains untouched and active"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (False, "inactive (dead)"),
        )

    # Verify original database and sidecars are untouched
    assert get_table_counts(target_db)["dataset_metadata"] == 6
    assert wal_file.exists()
    assert wal_file.read_bytes() == b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8

    # Verify no leftover tmp files
    tmp_files = list(target_db.parent.glob("*.tmp_restore_*"))
    assert len(tmp_files) == 0


def test_fault_injection_failure_during_staging_verification(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    # Monkeypatch verify_sqlite_integrity to fail only on tmp_restore
    original_verify = verify_sqlite_integrity
    def mock_verify(path):
        if "tmp_restore" in str(path):
            return False, "Injected staged database corruption"
        return original_verify(path)

    monkeypatch.setattr("scripts.db_ops.verify_sqlite_integrity", mock_verify)

    with pytest.raises(RuntimeError, match="Restore failed during staging verification.*Original database remains untouched and active"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (False, "inactive (dead)"),
        )

    # Verify original database and sidecars are untouched
    assert get_table_counts(target_db)["dataset_metadata"] == 6
    assert wal_file.exists()
    assert wal_file.read_bytes() == b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8

    # Verify no leftover tmp files
    tmp_files = list(target_db.parent.glob("*.tmp_restore_*"))
    assert len(tmp_files) == 0


def test_fault_injection_failure_during_sidecar_archival(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    def mock_copy2_fail(src, dst):
        raise OSError("Injected archival disk quota exceeded")

    monkeypatch.setattr(shutil, "copy2", mock_copy2_fail)

    with pytest.raises(RuntimeError, match="Restore aborted during sidecar forensic archival.*Original database remains untouched and active"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (False, "inactive (dead)"),
        )

    # Verify original database and sidecars are untouched
    assert get_table_counts(target_db)["dataset_metadata"] == 6
    assert wal_file.exists()
    assert wal_file.read_bytes() == b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8


def test_fault_injection_failure_during_atomic_replacement(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    original_replace = shutil.os.replace
    def mock_replace(src, dst):
        # Fail when placing new database into target_db path
        if str(dst) == str(target_db) and "tmp_restore" in str(src):
            raise OSError("Injected target database replace lock conflict")
        return original_replace(src, dst)

    monkeypatch.setattr(shutil.os, "replace", mock_replace)

    with pytest.raises(RuntimeError, match="Restore failed during target database replacement.*Rollback completed.*Original database remains active"):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (False, "inactive (dead)"),
        )

    # Rollback must have restored target DB and WAL file completely
    assert get_table_counts(target_db)["dataset_metadata"] == 6
    assert wal_file.exists()
    assert wal_file.read_bytes() == b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8

    # No leftover staged_old files
    assert len(list(target_db.parent.glob("*.staged_old_*"))) == 0


def test_fault_injection_failure_during_stale_sidecar_cleanup(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    # Simulate a stale sidecar remaining or appearing right after target replacement
    original_replace = shutil.os.replace

    def mock_replace(src, dst):
        res = original_replace(src, dst)
        if str(dst) == str(target_db) and "tmp_restore" in str(src):
            stale_wal = Path(f"{target_db.as_posix()}-wal")
            stale_wal.write_bytes(b"STRAY_STALE_WAL_DATA")
        return res

    monkeypatch.setattr(shutil.os, "replace", mock_replace)

    # Injected failure when unlinking stale sidecars at target path before commit
    original_unlink = Path.unlink

    def mock_unlink(self, *args, **kwargs):
        if self.name == f"{target_db.name}-wal":
            raise OSError("Injected permission error unlinking stale sidecar")
        return original_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", mock_unlink)

    with pytest.raises(
        RuntimeError,
        match="Restore failed during stale sidecar cleanup: .*Rollback completed: original database and sidecar files were restored. Original database remains active.",
    ):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (False, "inactive (dead)"),
        )

    # 1. Original target database exists
    assert target_db.exists()
    # 2. Original row counts preserved (6, NOT restored 2)
    assert get_table_counts(target_db)["dataset_metadata"] == 6
    # 3. Restored database did NOT accidentally become active
    assert get_table_counts(target_db)["dataset_metadata"] != 2
    # 4. Original sidecars preserved
    assert wal_file.exists()
    assert wal_file.read_bytes() == b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8
    # 5. Staged recovery files removed on rollback completion
    assert len(list(target_db.parent.glob("*.staged_old_*"))) == 0
    assert len(list(target_db.parent.glob("*.tmp_restore_*"))) == 0


def test_fault_injection_failure_during_old_database_cleanup(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    # Injected failure when unlinking staged_old_main during post-commit cleanup
    original_unlink = Path.unlink

    def mock_unlink(self, *args, **kwargs):
        if "staged_old" in self.name and not any(sfx in self.name for sfx in ("-wal", "-shm", "-journal")):
            raise OSError("Injected permission error unlinking staged_old database")
        return original_unlink(self, *args, **kwargs)

    monkeypatch.setattr(Path, "unlink", mock_unlink)

    with pytest.raises(
        RuntimeError,
        match="Database replacement committed successfully, but cleanup of old staged artifacts failed.*Target database '.*' is active and valid.*Staged recovery files remain for manual cleanup",
    ):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (False, "inactive (dead)"),
        )

    # 1. Target database exists and is active
    assert target_db.exists()
    # 2. Restored database correctly became active (has 2 rows from backup, replacement was committed)
    assert get_table_counts(target_db)["dataset_metadata"] == 2
    # 3. Old staged database file is preserved on disk for manual cleanup with original 6 rows
    staged_old_dbs = list(target_db.parent.glob("*.staged_old_*"))
    main_staged = [p for p in staged_old_dbs if not any(sfx in p.name for sfx in ("-wal", "-shm", "-journal"))]
    assert len(main_staged) == 1
    assert get_table_counts(main_staged[0])["dataset_metadata"] == 6
    # 4. Mandatory safety snapshot also preserved with original 6 rows
    safety_snaps = list(target_db.parent.glob("backups/safety_pre_restore_*.db"))
    assert len(safety_snaps) == 1
    assert get_table_counts(safety_snaps[0])["dataset_metadata"] == 6


def test_fault_injection_failure_during_rollback_recovery(tmp_path: Path, monkeypatch) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    original_replace = shutil.os.replace

    def mock_replace_double_fail(src, dst):
        # 1. Fail replacement
        if str(dst) == str(target_db) and "tmp_restore" in str(src):
            raise OSError("Injected target database replacement failure")
        # 2. Fail rollback restore
        if str(dst) == str(target_db) and "staged_old" in str(src):
            raise OSError("Injected catastrophic failure restoring staged_old to target_db")
        return original_replace(src, dst)

    monkeypatch.setattr(shutil.os, "replace", mock_replace_double_fail)

    with pytest.raises(
        RuntimeError,
        match="CRITICAL: Restore failed during target database replacement.*Automatic rollback failed.*Original database is preserved at staged file.*Manual recovery is required",
    ):
        restore_database(
            backup_file=backup_file,
            target_db=target_db,
            confirmed_offline_maintenance=True,
            service_status_checker=lambda s: (False, "inactive (dead)"),
        )

    # 1. Verify that staged_old file is preserved on disk with original 6 rows for manual recovery
    staged_old_dbs = list(target_db.parent.glob("*.staged_old_*"))
    main_staged = [p for p in staged_old_dbs if not any(sfx in p.name for sfx in ("-wal", "-shm", "-journal"))]
    assert len(main_staged) == 1
    assert get_table_counts(main_staged[0])["dataset_metadata"] == 6

    # 2. Verify safety snapshot also exists in backups directory with original 6 rows
    safety_snaps = list(target_db.parent.glob("backups/safety_pre_restore_*.db"))
    assert len(safety_snaps) == 1
    assert get_table_counts(safety_snaps[0])["dataset_metadata"] == 6

    # 3. Verify target database was not corrupted with restored 2 rows
    if target_db.exists():
        assert get_table_counts(target_db).get("dataset_metadata") != 2


def test_successful_restore_staged_artifacts_cleaned_after_commit(tmp_path: Path) -> None:
    target_db = tmp_path / "data" / "target.db"
    target_db.parent.mkdir(parents=True)
    create_valid_aps_db(target_db, sample_count=6)
    wal_file = Path(f"{target_db.as_posix()}-wal")
    wal_file.write_bytes(b"ORIGINAL_TARGET_WAL_PAYLOAD" * 8)

    backup_file = tmp_path / "backup.db"
    create_valid_aps_db(backup_file, sample_count=2)

    restore_database(
        backup_file=backup_file,
        target_db=target_db,
        confirmed_offline_maintenance=True,
        service_status_checker=lambda s: (False, "inactive (dead)"),
    )

    # 1. Target database exists and has new backup data (2 rows)
    assert target_db.exists()
    assert get_table_counts(target_db)["dataset_metadata"] == 2

    # 2. Stale sidecars removed
    assert not wal_file.exists()

    # 3. Old staged artifacts cleaned up
    assert len(list(target_db.parent.glob("*.staged_old_*"))) == 0
    assert len(list(target_db.parent.glob("*.tmp_restore_*"))) == 0

    # 4. Mandatory safety snapshot preserved in backups directory with original 6 rows
    safety_snaps = list(target_db.parent.glob("backups/safety_pre_restore_*.db"))
    assert len(safety_snaps) == 1
    assert get_table_counts(safety_snaps[0])["dataset_metadata"] == 6
