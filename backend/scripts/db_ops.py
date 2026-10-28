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
    """Check if target SQLite database is active and locked by another running process.

    NOTE: SQLite locking is a supplementary check, not proof that every process
    has stopped. The systemd service-state check remains the primary production guard.

    Returns:
        True: Database is actively locked/busy by another process.
        False: Database is available for exclusive access.

    Raises:
        RuntimeError: If lock status could not be determined due to unexpected SQLite
                      or operating-system error.
    """
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
    except sqlite3.OperationalError as e:
        msg = str(e).lower()
        if "locked" in msg or "busy" in msg:
            return True
        raise RuntimeError(
            f"Unable to determine database lock status due to unexpected SQLite operational error: {e}"
        ) from e
    except Exception as e:
        raise RuntimeError(
            f"Unable to determine database lock status due to unexpected error ({type(e).__name__}): {e}"
        ) from e


def get_sqlite_sidecars(db_path: Path) -> dict[str, Path]:
    """Detect existing SQLite sidecar files (-wal, -shm, -journal)."""
    sidecars: dict[str, Path] = {}
    for suffix in ("-wal", "-shm", "-journal"):
        sidecar_path = Path(f"{db_path.as_posix()}{suffix}")
        if sidecar_path.exists():
            sidecars[suffix] = sidecar_path
    return sidecars


def check_systemd_service_status(service_name: str = "aps-backend") -> tuple[bool | str | None, str]:
    """Query systemd to check whether the specified service is currently active.

    Uses 'systemctl show' to inspect explicit unit properties (ActiveState, SubState, LoadState).

    Returns:
        (True, status_str): Service is explicitly running or auto-restarting (active/unsafe).
        ("transitioning", status_str): Service is activating, deactivating, or reloading (unsafe).
        (False, status_str): Service is positively confirmed stopped (inactive or dead/failed).
        (None, reason_str): Service state is unknown, missing unit, non-systemd, or execution failed.
    """
    systemctl_bin = shutil.which("systemctl")
    if not systemctl_bin:
        return None, "systemctl command not found (non-systemd environment)"

    try:
        res = subprocess.run(
            [systemctl_bin, "show", service_name, "--property=ActiveState,SubState,LoadState"],
            capture_output=True,
            text=True,
            timeout=5.0,
            check=False,
        )
        if res.returncode != 0:
            err_msg = res.stderr.strip() or res.stdout.strip()
            return None, f"systemctl execution failed (exit code {res.returncode}): {err_msg}"

        props: dict[str, str] = {}
        for line in res.stdout.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                props[k.strip()] = v.strip()

        load_state = props.get("LoadState", "")
        active_state = props.get("ActiveState", "")
        sub_state = props.get("SubState", "")

        # 1. Explicitly active service (ActiveState=active: always return True regardless of LoadState/SubState)
        if active_state == "active":
            return True, f"active ({sub_state or 'running'}, LoadState={load_state or 'unknown'})"

        # 2. Failed with auto-restart: classify as active/unsafe and block restore
        if active_state == "failed" and sub_state == "auto-restart":
            return True, f"failed (auto-restart: service is restarting, LoadState={load_state or 'unknown'})"

        # 3. Transitioning states: dedicated unsafe/transitioning result
        if active_state in ("activating", "deactivating", "reloading"):
            return "transitioning", f"transitioning ({active_state}: {sub_state}, LoadState={load_state or 'unknown'})"

        # 4. Missing unit or unknown service
        if load_state in ("not-found", "masked", ""):
            return None, f"service unit '{service_name}' not found (LoadState={load_state or 'unknown'})"

        # 5. Explicitly inactive / stopped service
        if active_state == "inactive" and sub_state in ("dead", "inactive"):
            return False, f"inactive ({sub_state})"

        # 6. Failed service: return False ONLY if positively confirmed stopped/dead
        if active_state == "failed":
            if sub_state in ("dead", "failed"):
                return False, f"failed/stopped ({sub_state})"
            return None, f"failed service state ambiguous (SubState={sub_state})"

        # 7. Unrecognized or ambiguous states
        return None, f"unrecognized/ambiguous state: {active_state} ({sub_state})"

    except subprocess.TimeoutExpired:
        return None, "systemctl command timed out"
    except (subprocess.SubprocessError, OSError) as e:
        return None, f"systemctl execution error: {e}"


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
    service_name: str = "aps-backend",
    service_status_checker: Callable[[str], tuple[bool | str | None, str]] | None = None,
) -> None:
    """Safely restore a SQLite database from a verified backup.

    Guarantees:
    - Fail-closed service manager verification (refuses restore if service is active or transitioning).
    - Explicit operator confirmation required ONLY when systemd is unavailable (non-systemd / test env).
    - Confirmation flag NEVER bypasses an active service, transitioning state, or detected SQLite lock.
    - Pre-flight integrity and schema compatibility verification on the backup file.
    - Fail-closed SQLite lock detection as supplementary safeguard.
    - Pre-restore safety snapshot using SQLite Online Backup API.
    - Forensic sidecar archival preserved alongside safety snapshot.
    - Staging restore and verification prior to touching active database.
    - Transaction-like atomic replacement with reversible staging.
    - Failure-safe rollback with unambiguous status reporting.
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

    # Primary guard: check service status via service manager (systemd on Linux)
    checker = service_status_checker or check_systemd_service_status
    service_active, service_msg = checker(service_name)

    # Active or auto-restarting or transitioning states must NEVER be bypassed by any flag
    if service_active is True or service_active in ("active", "transitioning", "auto-restart", "unsafe"):
        raise RuntimeError(
            f"Cannot restore: APS backend service '{service_name}' is actively running or transitioning ({service_msg}). "
            f"Restore must not replace database while service is running or transitioning. "
            f"Stop the service first: sudo systemctl stop {service_name}"
        )

    if service_active is False or service_active == "stopped":
        print(f"[+] Verified service '{service_name}' is stopped ({service_msg}).")
    else:  # service_active is None (unverifiable, non-systemd, missing unit, ambiguous)
        if not confirmed_offline_maintenance:
            raise RuntimeError(
                f"Service manager (systemd) could not verify service status ({service_msg}). "
                "To perform database restore in a non-systemd or test environment, provide "
                "'--confirmed-offline-maintenance' (or confirmed_offline_maintenance=True)."
            )
        print(f"[*] Proceeding with confirmed offline maintenance ({service_msg}).")

    # Detect existing sidecars (-wal, -shm, -journal) before any DB connection
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
                    print(f"    - {p.name}: {p.stat().st_size:,} bytes")

    # Supplementary check: active process lock on target database file (fail-closed)
    if target_db.exists():
        try:
            locked = is_database_locked(target_db)
        except Exception as lock_err:
            raise RuntimeError(
                f"Cannot proceed with restore: Lock status on '{target_db}' could not be determined: {lock_err}"
            ) from lock_err

        if locked:
            raise RuntimeError(
                f"Target database '{target_db}' is locked by an active process. "
                "Ensure all database connections and backend processes are fully closed before restoring."
            )

    # Re-ensure any sidecars exist on disk prior to safety backup and staging
    for suffix, data in sidecar_snapshots.items():
        sc_path = Path(f"{target_db.as_posix()}{suffix}")
        if not sc_path.exists():
            try:
                sc_path.write_bytes(data)
            except OSError:
                pass

    # Mandatory safety snapshot if target database already exists
    safety_snapshot_path: Path | None = None
    if target_db.exists():
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        safety_dir = target_db.parent / "backups"
        safety_dir.mkdir(parents=True, exist_ok=True)
        safety_name = f"safety_pre_restore_{target_db.stem}_{timestamp}.db"
        print(f"[*] Target database exists. Creating mandatory safety snapshot at: {safety_dir / safety_name}")

        safety_snapshot_path = backup_database(source_db=target_db, backup_dir=safety_dir, custom_name=safety_name)

        try:
            # Archive existing sidecar files alongside the safety backup as forensic artifacts
            for suffix, sidecar_path in sidecars.items():
                sidecar_backup = safety_dir / f"{safety_name}{suffix}"
                if sidecar_path.exists():
                    shutil.copy2(sidecar_path, sidecar_backup)
                if suffix in sidecar_snapshots:
                    sidecar_backup.write_bytes(sidecar_snapshots[suffix])
                print(f"    Preserved forensic sidecar artifact: {sidecar_backup}")
        except Exception as sc_arch_err:
            # Ensure sidecars remain on disk
            for suffix, data in sidecar_snapshots.items():
                sc_p = Path(f"{target_db.as_posix()}{suffix}")
                if not sc_p.exists():
                    try:
                        sc_p.write_bytes(data)
                    except OSError:
                        pass
            raise RuntimeError(
                f"Restore aborted during sidecar forensic archival: {sc_arch_err}. "
                "Original database remains untouched and active."
            ) from sc_arch_err

    target_db.parent.mkdir(parents=True, exist_ok=True)
    timestamp_tmp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S_%f")
    temp_target = target_db.with_name(f"{target_db.name}.tmp_restore_{timestamp_tmp}")

    print(f"[*] Restoring into temporary staging database: {temp_target}")

    # 1. Staging restore
    try:
        src_conn = sqlite3.connect(f"file:{backup_file.as_posix()}?mode=ro", uri=True)
        dest_conn = sqlite3.connect(temp_target.as_posix())
        try:
            with dest_conn:
                src_conn.backup(dest_conn)
        finally:
            dest_conn.close()
            src_conn.close()
    except Exception as staging_err:
        if temp_target.exists():
            temp_target.unlink(missing_ok=True)
        for suffix, data in sidecar_snapshots.items():
            sc_p = Path(f"{target_db.as_posix()}{suffix}")
            if not sc_p.exists():
                try:
                    sc_p.write_bytes(data)
                except OSError:
                    pass
        raise RuntimeError(
            f"Restore failed during staging restore: {staging_err}. "
            "Original database remains untouched and active."
        ) from staging_err

    # 2. Staging verification
    try:
        staged_valid, staged_msg = verify_sqlite_integrity(temp_target)
        if not staged_valid:
            raise RuntimeError(f"Staged restore database failed integrity check: {staged_msg}")

        staged_schema_valid, staged_schema_msg = verify_schema_and_alembic(temp_target)
        if not staged_schema_valid:
            raise RuntimeError(f"Staged restore database failed schema check: {staged_schema_msg}")
    except Exception as verify_err:
        if temp_target.exists():
            temp_target.unlink(missing_ok=True)
        for suffix, data in sidecar_snapshots.items():
            sc_p = Path(f"{target_db.as_posix()}{suffix}")
            if not sc_p.exists():
                try:
                    sc_p.write_bytes(data)
                except OSError:
                    pass
        raise RuntimeError(
            f"Restore failed during staging verification: {verify_err}. "
            "Original database remains untouched and active."
        ) from verify_err

    # Ensure sidecars exist on disk before staging away
    for suffix, data in sidecar_snapshots.items():
        sc_p = Path(f"{target_db.as_posix()}{suffix}")
        if not sc_p.exists():
            try:
                sc_p.write_bytes(data)
            except OSError:
                pass

    # 3. Transaction-like replacement protocol
    staged_old_main = target_db.with_name(f"{target_db.name}.staged_old_{timestamp_tmp}")
    staged_old_sidecars: list[tuple[Path, Path]] = [
        (Path(f"{target_db.as_posix()}{suffix}"), Path(f"{target_db.as_posix()}{suffix}.staged_old_{timestamp_tmp}"))
        for suffix in sidecar_snapshots.keys()
    ]

    target_staged = False
    sidecars_staged = False
    new_target_installed = False
    stage = "atomic staging preparation"

    try:
        # Step A: Stage active sidecars away
        stage = "sidecar staging"
        for orig_sc, staged_sc in staged_old_sidecars:
            if orig_sc.exists():
                os.replace(orig_sc, staged_sc)
        sidecars_staged = True

        # Step B: Stage active database away
        stage = "target database staging"
        if target_db.exists():
            os.replace(target_db, staged_old_main)
            target_staged = True

        # Step C: Atomically place new database into active target path
        stage = "target database replacement"
        print(f"[*] Staging verified. Atomically replacing target database: {target_db}")
        os.replace(temp_target, target_db)
        new_target_installed = True

        # Step D: Clean up stale sidecars at target path before commit
        stage = "stale sidecar cleanup"
        for suffix in ("-wal", "-shm", "-journal"):
            sc_to_clean = Path(f"{target_db.as_posix()}{suffix}")
            if sc_to_clean.exists():
                sc_to_clean.unlink()

        # Step E: EXPLICIT COMMIT POINT
        # All operations that could invalidate target replacement or trigger rollback have completed.
        stage = "committed"
        print(f"[+] Database replacement committed. Target database '{target_db}' is active.")

    except Exception as replace_err:
        # Pre-commit failure: execute failure-safe rollback
        rollback_succeeded = True
        rollback_err = None

        try:
            # 1. Safely restore main database if it was staged away
            # Atomically replace target_db with staged_old_main without unlinking target_db first
            if target_staged and staged_old_main.exists():
                os.replace(staged_old_main, target_db)
                target_staged = False
            elif new_target_installed and not target_staged:
                # Target was never staged (didn't exist originally) but new target was placed
                target_db.unlink(missing_ok=True)

            # 2. Restore original sidecars from staged locations
            if sidecars_staged:
                for orig_sc, staged_sc in staged_old_sidecars:
                    if staged_sc.exists():
                        os.replace(staged_sc, orig_sc)

            # 3. Ensure all original sidecar content is restored on disk
            for suffix, data in sidecar_snapshots.items():
                sc_p = Path(f"{target_db.as_posix()}{suffix}")
                if not sc_p.exists():
                    try:
                        sc_p.write_bytes(data)
                    except OSError:
                        pass
        except Exception as rb_exc:
            rollback_succeeded = False
            rollback_err = rb_exc
        finally:
            if temp_target.exists():
                temp_target.unlink(missing_ok=True)

        if rollback_succeeded:
            raise RuntimeError(
                f"Restore failed during {stage}: {replace_err}. "
                "Rollback completed: original database and sidecar files were restored. "
                "Original database remains active."
            ) from replace_err
        else:
            preserved_loc = []
            if staged_old_main.exists():
                preserved_loc.append(f"staged file '{staged_old_main}'")
            if target_db.exists() and not new_target_installed:
                preserved_loc.append(f"active path '{target_db}'")
            if safety_snapshot_path and safety_snapshot_path.exists():
                preserved_loc.append(f"safety snapshot '{safety_snapshot_path}'")
            preserved_desc = ", ".join(preserved_loc) if preserved_loc else "unknown (check filesystem)"

            raise RuntimeError(
                f"CRITICAL: Restore failed during {stage}: {replace_err}. "
                f"Automatic rollback failed ({rollback_err}). "
                f"Original database is preserved at {preserved_desc}. "
                "Manual recovery is required before restarting the service."
            ) from replace_err

    # POST-COMMIT: cleanup of staged old artifacts
    # Replacement is committed; rollback is NOT attempted if cleanup fails.
    cleanup_failed_artifacts: list[str] = []
    try:
        # Clean staged old sidecars
        for _, staged_sc in staged_old_sidecars:
            if staged_sc.exists():
                try:
                    staged_sc.unlink()
                except OSError as e:
                    cleanup_failed_artifacts.append(f"{staged_sc.name} ({e})")

        # Clean staged old main DB
        if staged_old_main.exists():
            try:
                staged_old_main.unlink()
            except OSError as e:
                cleanup_failed_artifacts.append(f"{staged_old_main.name} ({e})")

        if temp_target.exists():
            temp_target.unlink(missing_ok=True)

    except Exception as cleanup_err:
        cleanup_failed_artifacts.append(str(cleanup_err))

    if cleanup_failed_artifacts:
        print(f"[!] Warning: Replacement committed, but failed to clean up staged old files: {cleanup_failed_artifacts}")
        raise RuntimeError(
            f"Database replacement committed successfully, but cleanup of old staged artifacts failed: "
            f"{', '.join(cleanup_failed_artifacts)}. Target database '{target_db}' is active and valid. "
            f"Staged recovery files remain for manual cleanup: '{staged_old_main}'"
        )

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
        dest="confirmed_offline_maintenance",
        action="store_true",
        help="Confirm offline maintenance when running in non-systemd or test environments where service manager is unavailable.",
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
