"""SQLite Database Operations Utility: Backup, Restore & Verification.

Uses Python's sqlite3 Online Backup API for point-in-time consistent backups.
Hardened with schema validation, Alembic revision verification, active-process lock
detection, staging database pre-verification, and atomic replacement.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
from typing import Callable

# Ensure backend root is on sys.path
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from app.core.config import get_settings

    DEFAULT_DB_PATH = Path(get_settings().database_url.replace("sqlite:///", ""))
    if not DEFAULT_DB_PATH.is_absolute():
        DEFAULT_DB_PATH = (BACKEND_DIR / DEFAULT_DB_PATH).resolve()
except Exception:
    DEFAULT_DB_PATH = BACKEND_DIR / "data" / "aps_intelligence.db"

DEFAULT_BACKUP_DIR = BACKEND_DIR / "data" / "backups"

# Schema validation constants
REQUIRED_TABLES = {
    "alembic_version",
    "dataset_metadata",
    "model_training_runs",
    "experiment_runs",
    "model_promotions",
    "decision_policies",
    "predictions",
    "preprocessing_runs",
}

SUPPORTED_ALEMBIC_REVISIONS = {"20261027_0005"}


def calculate_sha256(file_path: Path) -> str:
    """Calculate SHA-256 digest of a file in streaming chunks."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def verify_sqlite_integrity(db_path: Path) -> tuple[bool, str]:
    """Run PRAGMA integrity_check on target SQLite database."""
    if not db_path.exists():
        return False, f"File does not exist: {db_path}"
    try:
        conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
        cursor = conn.cursor()
        cursor.execute("PRAGMA integrity_check")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        if len(rows) == 1 and rows[0][0] == "ok":
            return True, "ok"
        messages = "; ".join(r[0] for r in rows)
        return False, messages
    except Exception as e:
        return False, str(e)


def verify_schema_and_alembic(db_path: Path) -> tuple[bool, str]:
    """Verify that database contains all required application tables and supported Alembic revision."""
    if not db_path.exists():
        return False, f"File does not exist: {db_path}"
    try:
        conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = {row[0] for row in cursor.fetchall()}
        missing = REQUIRED_TABLES - tables
        if missing:
            cursor.close()
            conn.close()
            return False, f"Missing required application tables: {sorted(missing)}"

        cursor.execute("SELECT version_num FROM alembic_version")
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        if not rows:
            return False, "Alembic version table is empty; unmigrated database."
        rev = rows[0][0]
        if rev not in SUPPORTED_ALEMBIC_REVISIONS:
            return False, f"Incompatible Alembic revision '{rev}'. Expected one of: {sorted(SUPPORTED_ALEMBIC_REVISIONS)}"
        return True, f"Schema compatible (Alembic revision: {rev})"
    except Exception as e:
        return False, f"Schema check failed: {e}"


def is_database_locked(db_path: Path) -> bool:
    """Check if target SQLite database is active and locked by another running process."""
    if not db_path.exists():
        return False
    try:
        conn = sqlite3.connect(db_path.as_posix(), timeout=0.0)
        cursor = conn.cursor()
        cursor.execute("BEGIN EXCLUSIVE")
        conn.rollback()
        cursor.close()
        conn.close()
        return False
    except sqlite3.OperationalError:
        return True
    except Exception:
        return False


def get_sqlite_sidecars(db_path: Path) -> dict[str, Path]:
    """Detect existing SQLite sidecar files (-wal, -shm, -journal)."""
    sidecars: dict[str, Path] = {}
    for suffix in ("-wal", "-shm", "-journal"):
        sidecar_path = Path(f"{db_path.as_posix()}{suffix}")
        if sidecar_path.exists():
            sidecars[suffix] = sidecar_path
    return sidecars


def check_systemd_service_status(service_name: str = "aps-backend") -> tuple[bool | None, str]:
    """Query systemd to check whether the specified service is currently active.

    Returns:
        (True, status_str): Service is running (active).
        (False, status_str): Service is stopped (inactive/failed/unknown).
        (None, reason_str): systemctl is not available or not on Linux.
    """
    systemctl_bin = shutil.which("systemctl")
    if not systemctl_bin:
        return None, "systemctl command not found (non-systemd environment)"

    try:
        res = subprocess.run(
            [systemctl_bin, "is-active", service_name],
            capture_output=True,
            text=True,
            timeout=5.0,
            check=False,
        )
        output = res.stdout.strip() or res.stderr.strip()
        if res.returncode == 0:
            return True, output or "active"
        return False, output or f"inactive (exit code {res.returncode})"
    except (subprocess.SubprocessError, OSError) as e:
        return None, f"Failed to execute systemctl: {e}"


def get_table_counts(db_path: Path) -> dict[str, int]:
    """Query row counts for all user tables in target database."""
    counts: dict[str, int] = {}
    if not db_path.exists():
        return counts
    conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [row[0] for row in cursor.fetchall()]
    for table in sorted(tables):
        cursor.execute(f"SELECT COUNT(*) FROM \"{table}\"")  # noqa: S608
        counts[table] = cursor.fetchone()[0]
    cursor.close()
    conn.close()
    return counts


def backup_database(
    source_db: Path = DEFAULT_DB_PATH,
    backup_dir: Path = DEFAULT_BACKUP_DIR,
    custom_name: str | None = None,
) -> Path:
    """Create a point-in-time consistent SQLite backup using Online Backup API."""
    if not source_db.exists():
        raise FileNotFoundError(f"Source database not found: {source_db}")

    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = custom_name or f"aps_intelligence_backup_{timestamp}.db"
    dest_path = backup_dir / filename

    print("[*] Starting online backup...")
    print(f"    Source: {source_db}")
    print(f"    Destination: {dest_path}")

    # Use online backup API
    src_conn = sqlite3.connect(f"file:{source_db.as_posix()}?mode=ro", uri=True)
    dest_conn = sqlite3.connect(dest_path.as_posix())

    try:
        with dest_conn:
            src_conn.backup(dest_conn)
    finally:
        dest_conn.close()
        src_conn.close()

    # Integrity verification
    is_valid, msg = verify_sqlite_integrity(dest_path)
    if not is_valid:
        raise RuntimeError(f"Backup failed integrity verification: {msg}")

    size_bytes = dest_path.stat().st_size
    sha256 = calculate_sha256(dest_path)

    print("[+] Backup completed successfully.")
    print(f"    Size: {size_bytes:,} bytes")
    print(f"    SHA-256: {sha256}")
    print(f"    Integrity Check: {msg}")
    return dest_path


def restore_database(
    backup_file: Path,
    target_db: Path = DEFAULT_DB_PATH,
    confirmed_offline_maintenance: bool = False,
    skip_process_lock_check: bool = False,
    service_name: str = "aps-backend",
    service_status_checker: Callable[[str], tuple[bool | None, str]] | None = None,
) -> None:
    """Safely restore a SQLite database from a verified backup.

    Guarantees:
    - Service manager verification (refuses restore if aps-backend service is active).
    - Operator confirmation required when systemd is unavailable (non-systemd / test env).
    - Pre-flight integrity and schema compatibility verification on the backup file.
    - Active process lock detection as supplementary safeguard.
    - Sidecar (-wal, -shm, -journal) inspection, safety archiving, and clean isolation.
    - Mandatory safety snapshot before touching an existing target database.
    - Staging restore into a temporary database followed by verification.
    - Atomic replacement so target and sidecars are never partially overwritten on failure.
    """
    if not backup_file.exists():
        raise FileNotFoundError(f"Backup file not found: {backup_file}")

    print(f"[*] Pre-flight check on backup file: {backup_file}")
    is_valid, msg = verify_sqlite_integrity(backup_file)
    if not is_valid:
        raise ValueError(f"Backup file failed SQLite integrity check: {msg}")

    is_schema_valid, schema_msg = verify_schema_and_alembic(backup_file)
    if not is_schema_valid:
        raise ValueError(f"Backup file failed schema/migration check: {schema_msg}")

    print(f"[+] Backup file SQLite integrity: {msg}")
    print(f"[+] Backup file schema check: {schema_msg}")

    # Check service status via service manager (systemd on Linux)
    checker = service_status_checker or check_systemd_service_status
    service_active, service_msg = checker(service_name)

    if service_active is True:
        raise RuntimeError(
            f"Cannot restore: APS backend service '{service_name}' is actively running ({service_msg}). "
            f"Restore must not replace database while service is running. "
            f"Stop the service first: sudo systemctl stop {service_name}"
        )
    elif service_active is False:
        print(f"[+] Verified service '{service_name}' is stopped ({service_msg}).")
    else:  # service_active is None (non-systemd or systemctl missing)
        is_confirmed = confirmed_offline_maintenance or skip_process_lock_check
        if not is_confirmed:
            raise RuntimeError(
                f"Service manager (systemd) is not available to verify service status ({service_msg}). "
                "To perform database restore in a non-systemd or test environment, provide "
                "'--confirmed-offline-maintenance' (or confirmed_offline_maintenance=True)."
            )
        print(f"[*] Non-systemd environment: proceeding with confirmed offline maintenance ({service_msg}).")

    # Detect and preserve any existing sidecars (-wal, -shm, -journal)
    sidecars = get_sqlite_sidecars(target_db)
    sidecar_snapshots: dict[str, bytes] = {}
    if sidecars:
        print(f"[!] Warning: Detected existing SQLite sidecar files: {[p.name for p in sidecars.values()]}")
        for suffix, p in sidecars.items():
            if p.exists():
                try:
                    sidecar_snapshots[suffix] = p.read_bytes()
                except OSError:
                    pass
                if p.stat().st_size > 0:
                    print(f"    - {p.name}: {p.stat().st_size:,} bytes (may contain uncommitted transactions if stopped ungracefully)")

    # Supplementary check: active process lock on target database file
    if target_db.exists():
        if is_database_locked(target_db):
            raise RuntimeError(
                f"Target database '{target_db}' is locked by an active process. "
                "Ensure all database connections and backend processes are fully closed before restoring."
            )

    # Mandatory safety snapshot if target database already exists
    if target_db.exists():
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        safety_dir = target_db.parent / "backups"
        safety_dir.mkdir(parents=True, exist_ok=True)
        safety_name = f"safety_pre_restore_{target_db.stem}_{timestamp}.db"
        print(f"[*] Target database exists. Creating mandatory safety snapshot at: {safety_dir / safety_name}")
        backup_database(source_db=target_db, backup_dir=safety_dir, custom_name=safety_name)

        # Archive existing sidecar files alongside the safety backup
        for suffix, data in sidecar_snapshots.items():
            sidecar_backup = safety_dir / f"{safety_name}{suffix}"
            sidecar_backup.write_bytes(data)
            print(f"    Preserved sidecar snapshot: {sidecar_backup}")

    target_db.parent.mkdir(parents=True, exist_ok=True)
    timestamp_tmp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    temp_target = target_db.with_name(f"{target_db.name}.tmp_restore_{timestamp_tmp}")

    print(f"[*] Restoring into temporary staging database: {temp_target}")
    try:
        src_conn = sqlite3.connect(f"file:{backup_file.as_posix()}?mode=ro", uri=True)
        dest_conn = sqlite3.connect(temp_target.as_posix())
        try:
            with dest_conn:
                src_conn.backup(dest_conn)
        finally:
            dest_conn.close()
            src_conn.close()

        # Verify staged database before replacing active target
        staged_valid, staged_msg = verify_sqlite_integrity(temp_target)
        if not staged_valid:
            raise RuntimeError(f"Staged restore database failed integrity check: {staged_msg}")

        staged_schema_valid, staged_schema_msg = verify_schema_and_alembic(temp_target)
        if not staged_schema_valid:
            raise RuntimeError(f"Staged restore database failed schema check: {staged_schema_msg}")

        # Atomic replacement of target database
        print(f"[*] Staging verified. Atomically replacing target database: {target_db}")
        os.replace(temp_target, target_db)

        # Clean up any leftover sidecars from the old target DB to ensure clean state
        for suffix in ("-wal", "-shm", "-journal"):
            Path(f"{target_db.as_posix()}{suffix}").unlink(missing_ok=True)
    except Exception:
        # Rollback: restore any missing original sidecars so target remains untouched
        for suffix, data in sidecar_snapshots.items():
            sc_path = Path(f"{target_db.as_posix()}{suffix}")
            if not sc_path.exists():
                try:
                    sc_path.write_bytes(data)
                except OSError:
                    pass
        if temp_target.exists():
            temp_target.unlink(missing_ok=True)
        raise

    source_counts = get_table_counts(backup_file)
    target_counts = get_table_counts(target_db)

    print("[+] Restore completed successfully.")
    print(f"    Target: {target_db}")
    print(f"    Size: {target_db.stat().st_size:,} bytes")
    print(f"    SHA-256: {calculate_sha256(target_db)}")
    print(f"    Integrity Check: {staged_msg}")
    print(f"    Schema & Migration: {staged_schema_msg}")
    print("    Row Count Comparison:")
    for tbl in sorted(set(source_counts.keys()) | set(target_counts.keys())):
        src_c = source_counts.get(tbl, 0)
        dst_c = target_counts.get(tbl, 0)
        status = "MATCH" if src_c == dst_c else "MISMATCH"
        print(f"      - {tbl}: backup={src_c}, restored={dst_c} [{status}]")


def main() -> None:
    parser = argparse.ArgumentParser(description="APS Intelligence SQLite Management Utility")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # Backup subcommand
    backup_parser = subparsers.add_parser("backup", help="Create an online backup of the database")
    backup_parser.add_argument("--source", type=Path, default=DEFAULT_DB_PATH, help="Path to source SQLite database")
    backup_parser.add_argument("--dest-dir", type=Path, default=DEFAULT_BACKUP_DIR, help="Destination directory for backups")
    backup_parser.add_argument("--name", type=str, default=None, help="Custom filename for backup")

    # Restore subcommand
    restore_parser = subparsers.add_parser("restore", help="Restore database from a backup file")
    restore_parser.add_argument("--backup-file", type=Path, required=True, help="Path to backup file")
    restore_parser.add_argument("--target", type=Path, default=DEFAULT_DB_PATH, help="Target SQLite database path")
    restore_parser.add_argument(
        "--confirmed-offline-maintenance",
        "--skip-process-lock-check",
        dest="confirmed_offline_maintenance",
        action="store_true",
        help="Confirm offline maintenance when running in non-systemd or test environments.",
    )
    restore_parser.add_argument(
        "--service-name",
        type=str,
        default="aps-backend",
        help="Systemd service name to check on Linux (default: aps-backend).",
    )

    # Verify subcommand
    verify_parser = subparsers.add_parser("verify", help="Verify integrity and inspect database or backup file")
    verify_parser.add_argument("--path", type=Path, default=DEFAULT_DB_PATH, help="Path to SQLite database to verify")

    args = parser.parse_args()

    if args.command == "backup":
        backup_database(source_db=args.source, backup_dir=args.dest_dir, custom_name=args.name)
    elif args.command == "restore":
        restore_database(
            backup_file=args.backup_file,
            target_db=args.target,
            confirmed_offline_maintenance=args.confirmed_offline_maintenance,
            service_name=args.service_name,
        )
    elif args.command == "verify":
        is_valid, msg = verify_sqlite_integrity(args.path)
        print(f"File: {args.path}")
        print(f"Integrity Check: {msg}")
        is_schema_valid, schema_msg = verify_schema_and_alembic(args.path)
        print(f"Schema & Migration Check: {schema_msg}")
        if is_valid and is_schema_valid:
            print(f"SHA-256: {calculate_sha256(args.path)}")
            counts = get_table_counts(args.path)
            print("Table Counts:")
            for tbl, count in counts.items():
                print(f"  - {tbl}: {count} rows")
        else:
            sys.exit(1)


if __name__ == "__main__":
    main()
