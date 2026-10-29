"""Tests for SQLite concurrency, foreign key enforcement, busy timeout, and online backup."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import sqlite3
import sys
import threading
import time

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.database.base import Base
from app.database.session import create_database_engine, create_session_factory
from app.models.dataset import DatasetMetadata, PreprocessingRun

# Insert db_ops into sys.path
DB_OPS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(DB_OPS_DIR) not in sys.path:
    sys.path.insert(0, str(DB_OPS_DIR))

from db_ops import backup_database, verify_sqlite_integrity


@pytest.fixture
def sqlite_test_db(tmp_path: Path):
    db_file = tmp_path / "concurrency_test.db"
    settings = Settings(
        database_url=f"sqlite:///{db_file.as_posix()}",
        persistent_storage_dir=tmp_path,
        raw_dataset_dir=tmp_path / "raw",
        processed_dataset_dir=tmp_path / "processed",
        model_artifact_dir=tmp_path / "models",
        report_storage_dir=tmp_path / "reports",
    )
    engine = create_database_engine(settings)
    Base.metadata.create_all(engine)
    session_factory = create_session_factory(engine)
    return engine, session_factory, db_file


def test_sqlite_foreign_keys_pragma_enforced(sqlite_test_db) -> None:
    engine, session_factory, _ = sqlite_test_db

    # 1. Verify PRAGMA foreign_keys is ON (returns 1)
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA foreign_keys;")).scalar()
        assert result == 1, "PRAGMA foreign_keys must be enabled"

    # 2. Test constraint enforcement: inserting child with invalid parent ID must fail
    with session_factory() as session:
        orphaned_run = PreprocessingRun(
            run_id="run-non-existent-parent",
            dataset_id="non-existent-dataset-id",
            strategy="median",
            model_kind="xgboost",
            validation_ratio=0.2,
            random_seed=42,
            status="completed",
            artifact_directory="/tmp/fake",
            split_metadata_path="/tmp/fake/splits.json",
            configuration_json="{}",
        )
        session.add(orphaned_run)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_sqlite_busy_timeout_configured(sqlite_test_db) -> None:
    engine, _, _ = sqlite_test_db

    # SQLite pragma busy_timeout returns timeout in milliseconds (30.0s = 30000ms)
    with engine.connect() as conn:
        busy_timeout = conn.execute(text("PRAGMA busy_timeout;")).scalar()
        assert busy_timeout == 30000, f"Expected 30000ms busy timeout, got {busy_timeout}ms"


def test_concurrent_writes_serialize_successfully(sqlite_test_db) -> None:
    _, session_factory, _ = sqlite_test_db

    worker_count = 8
    records_per_worker = 10

    def insert_worker(worker_id: int) -> int:
        success_count = 0
        for i in range(records_per_worker):
            with session_factory() as session:
                record = DatasetMetadata(
                    dataset_id=f"worker-{worker_id}-rec-{i}",
                    dataset_name=f"Dataset {worker_id}-{i}",
                    dataset_type="custom",
                    source_file_name=f"data_{worker_id}_{i}.csv",
                    source_path=f"/path/to/data_{worker_id}_{i}.csv",
                    fingerprint=f"{worker_id:04d}{i:04d}" * 8,
                    file_size_bytes=1024,
                    record_count=100,
                    feature_count=10,
                    status="ready",
                )
                session.add(record)
                session.commit()
                success_count += 1
        return success_count

    with ThreadPoolExecutor(max_workers=worker_count) as executor:
        futures = [executor.submit(insert_worker, wid) for wid in range(worker_count)]
        results = [f.result() for f in futures]

    assert sum(results) == worker_count * records_per_worker

    # Verify total count in database
    with session_factory() as session:
        total = session.query(DatasetMetadata).count()
        assert total == worker_count * records_per_worker


def test_sqlite_controlled_lock_waiting_and_release(sqlite_test_db) -> None:
    _, session_factory, db_file = sqlite_test_db

    lock_acquired = threading.Event()
    release_lock = threading.Event()
    worker_finished = threading.Event()
    worker_error: list[Exception] = []

    def locker_thread() -> None:
        conn_a = sqlite3.connect(db_file.as_posix(), timeout=10.0, isolation_level=None)
        try:
            conn_a.execute("BEGIN EXCLUSIVE;")
            lock_acquired.set()
            release_lock.wait(timeout=5.0)
            conn_a.execute("COMMIT;")
        finally:
            conn_a.close()

    def writer_thread() -> None:
        assert lock_acquired.wait(timeout=5.0)
        # Connection B uses session_factory which inherits 30.0s busy timeout
        try:
            with session_factory() as session:
                record = DatasetMetadata(
                    dataset_id="rec-wait-1",
                    dataset_name="Name",
                    dataset_type="custom",
                    source_file_name="f.csv",
                    source_path="/p/f.csv",
                    fingerprint="b" * 64,
                    file_size_bytes=10,
                    record_count=10,
                    feature_count=1,
                    status="ready",
                )
                session.add(record)
                session.commit()
        except Exception as exc:
            worker_error.append(exc)
        finally:
            worker_finished.set()

    t_lock = threading.Thread(target=locker_thread)
    t_write = threading.Thread(target=writer_thread)

    t_lock.start()
    assert lock_acquired.wait(timeout=5.0)
    t_write.start()

    # Verify writer_thread blocks while lock is held
    time.sleep(0.15)
    assert not worker_finished.is_set(), "Connection B must wait while write lock is held"

    # Signal Connection A to release lock
    release_lock.set()
    t_lock.join(timeout=5.0)
    t_write.join(timeout=5.0)

    assert worker_error == [], f"Worker encountered unexpected error: {worker_error}"
    assert worker_finished.is_set()

    # Verify write completed in DB
    with session_factory() as session:
        record = session.query(DatasetMetadata).filter_by(dataset_id="rec-wait-1").first()
        assert record is not None


def test_sqlite_busy_timeout_failure_when_lock_exceeds_timeout(sqlite_test_db) -> None:
    _, _, db_file = sqlite_test_db

    lock_acquired = threading.Event()
    release_lock = threading.Event()
    worker_error: list[Exception] = []

    def locker_thread() -> None:
        conn_a = sqlite3.connect(db_file.as_posix(), timeout=10.0, isolation_level=None)
        try:
            conn_a.execute("BEGIN EXCLUSIVE;")
            lock_acquired.set()
            release_lock.wait(timeout=5.0)
            conn_a.execute("COMMIT;")
        finally:
            conn_a.close()

    def writer_thread() -> None:
        assert lock_acquired.wait(timeout=5.0)
        # Connection B configured with very short busy timeout (100ms)
        conn_b = sqlite3.connect(db_file.as_posix(), timeout=0.1, isolation_level=None)
        try:
            conn_b.execute("BEGIN IMMEDIATE;")
            conn_b.execute("COMMIT;")
        except sqlite3.OperationalError as exc:
            worker_error.append(exc)
        finally:
            conn_b.close()

    t_lock = threading.Thread(target=locker_thread)
    t_write = threading.Thread(target=writer_thread)

    t_lock.start()
    assert lock_acquired.wait(timeout=5.0)
    t_write.start()

    # Wait for writer_thread to timeout and fail
    t_write.join(timeout=5.0)
    # Release Connection A lock
    release_lock.set()
    t_lock.join(timeout=5.0)

    assert len(worker_error) == 1
    assert "locked" in str(worker_error[0]).lower(), f"Expected 'database is locked', got: {worker_error[0]}"


def test_online_backup_with_active_database_connections(sqlite_test_db, tmp_path: Path) -> None:
    _, session_factory, db_file = sqlite_test_db

    # Seed an initial record
    with session_factory() as session:
        session.add(
            DatasetMetadata(
                dataset_id="backup-seed-1",
                dataset_name="Initial Seed",
                dataset_type="training",
                source_file_name="seed.csv",
                source_path="/path/to/seed.csv",
                fingerprint="a" * 64,
                file_size_bytes=2048,
                record_count=50,
                feature_count=5,
                status="ready",
            )
        )
        session.commit()

    backup_dir = tmp_path / "backups"

    # Keep a session open while running backup
    with session_factory() as active_session:
        # Perform read in open session
        count = active_session.query(DatasetMetadata).count()
        assert count == 1

        # Run online backup
        backup_path = backup_database(
            source_db=db_file,
            backup_dir=backup_dir,
            custom_name="test_online_backup.db",
        )

        assert backup_path.exists()
        assert backup_path.stat().st_size > 0

        # Verify integrity of the backup database
        is_valid, msg = verify_sqlite_integrity(backup_path)
        assert is_valid, f"Backup integrity check failed: {msg}"
        assert msg == "ok"

    # Verify backed-up database has the seeded record
    with sqlite3.connect(backup_path.as_posix()) as backup_conn:
        cursor = backup_conn.cursor()
        cursor.execute("SELECT dataset_id, dataset_name FROM dataset_metadata WHERE dataset_id = 'backup-seed-1';")
        row = cursor.fetchone()
        assert row is not None
        assert row[0] == "backup-seed-1"
        assert row[1] == "Initial Seed"
