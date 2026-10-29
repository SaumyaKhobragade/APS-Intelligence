#!/usr/bin/env python3
"""Repeatable local release lifecycle and deployment configuration verification."""

import os
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile

from alembic import command
from alembic.config import Config


def log(msg: str) -> None:
    print(f"[*] {msg}")


def log_success(msg: str) -> None:
    print(f"[+] {msg}")


def log_warn(msg: str) -> None:
    print(f"[!] {msg}")


def create_symlink(src: Path, dst: Path) -> None:
    """Create directory link/symlink across Linux and Windows without admin rights."""
    if os.path.exists(dst) or os.path.islink(dst):
        if os.name == "nt":
            os.rmdir(dst)
        else:
            os.unlink(dst)

    if os.name == "nt":
        import _winapi
        _winapi.CreateJunction(str(src), str(dst))
    else:
        os.symlink(src, dst, target_is_directory=True)


def atomic_replace_link(src_target: Path, tmp_link: Path, active_link: Path) -> None:
    """Simulate atomic release symlink switch pattern."""
    create_symlink(src_target, tmp_link)
    assert tmp_link.exists() and tmp_link.is_dir()

    if os.name == "nt":
        # On Windows, replace junction by removing existing and moving tmp
        if os.path.exists(active_link) or os.path.islink(active_link):
            os.rmdir(active_link)
        os.rename(tmp_link, active_link)
    else:
        # On Linux/POSIX, atomic rename of symlink on same filesystem
        os.replace(tmp_link, active_link)


def run_release_verification() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    backend_dir = repo_root / "backend"
    deployment_dir = repo_root / "deployment"

    log(f"Starting release lifecycle verification for {repo_root}")

    # Create temporary isolated verification sandbox
    temp_dir = Path(tempfile.mkdtemp(prefix="aps_release_verification_"))
    try:
        releases_dir = temp_dir / "releases"
        releases_dir.mkdir(parents=True)
        storage_root = temp_dir / "var_data"
        config_dir = storage_root / "config"
        data_dir = storage_root / "data"
        datasets_dir = storage_root / "datasets" / "raw"
        artifacts_dir = storage_root / "artifacts"
        for p in (config_dir, data_dir, datasets_dir, artifacts_dir):
            p.mkdir(parents=True, exist_ok=True)

        db_file = data_dir / "aps_intelligence.db"
        backend_env_file = config_dir / "backend.env"
        frontend_env_file = config_dir / "frontend.env"

        # 1. Write stable external configuration files
        backend_env_file.write_text(
            f'APP_NAME="APS Intelligence API"\n'
            f'ENVIRONMENT="production"\n'
            f'DATABASE_URL="sqlite:///{db_file.as_posix()}"\n'
            f'PERSISTENT_STORAGE_DIR="{storage_root.as_posix()}"\n'
            f'DATASET_STORAGE_DIR="{datasets_dir.parent.as_posix()}"\n'
            f'MODEL_ARTIFACT_DIR="{(artifacts_dir / "models").as_posix()}"\n'
            f'REPORT_STORAGE_DIR="{(artifacts_dir / "reports").as_posix()}"\n'
            f'MAX_DATASET_UPLOAD_BYTES=52428800\n'
            f'ALLOWED_CORS_ORIGINS=["https://aps.test.example.com"]\n',
            encoding="utf-8",
        )
        frontend_env_file.write_text(
            'NODE_ENV="production"\n'
            'PORT=3000\n'
            'INTERNAL_API_URL="http://127.0.0.1:8000/api/v1"\n',
            encoding="utf-8",
        )
        log_success("Created stable external environment configuration files outside releases")

        # 2. Prepare mock release directories
        rel1 = releases_dir / "release-20261029-001"
        rel2 = releases_dir / "release-20261029-002"
        rel1.mkdir()
        rel2.mkdir()
        (rel1 / "backend").mkdir()
        (rel2 / "backend").mkdir()

        # 3. Test atomic symlink creation and switching
        current_symlink = temp_dir / "current"
        current_tmp = temp_dir / "current.tmp"

        # Initial link to release 1
        create_symlink(rel1, current_symlink)
        assert current_symlink.resolve() == rel1.resolve()
        log_success("Initial symlink points to release 1")

        # Atomic switch to release 2
        atomic_replace_link(rel2, current_tmp, current_symlink)
        assert current_symlink.resolve() == rel2.resolve()
        log_success("Atomic symlink replacement switched to release 2")

        # Atomic rollback to release 1
        atomic_replace_link(rel1, current_tmp, current_symlink)
        assert current_symlink.resolve() == rel1.resolve()
        log_success("Atomic symlink rollback returned to release 1")

        # 4. Verify Alembic initialization on clean SQLite database outside release folder
        sys.path.insert(0, str(backend_dir))
        from app.core.config import get_settings
        os.environ["DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"
        get_settings.cache_clear()

        alembic_ini_path = backend_dir / "alembic.ini"
        alembic_cfg = Config(str(alembic_ini_path))
        alembic_cfg.set_main_option("script_location", str(backend_dir / "alembic"))
        alembic_cfg.set_main_option("sqlalchemy.url", f"sqlite:///{db_file.as_posix()}")

        command.upgrade(alembic_cfg, "head")
        assert db_file.exists() and db_file.stat().st_size > 0
        log_success(f"Alembic successfully initialized clean database at external path: {db_file}")

        # Check tables in created SQLite DB
        with sqlite3.connect(db_file.as_posix()) as conn:
            tables = [row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table';").fetchall()]
            assert "dataset_metadata" in tables
            assert "alembic_version" in tables
        log_success(f"Verified schema tables created: {', '.join(sorted(tables))}")

        # 5. Verify backend boots with release configuration and passes health checks
        from app.core.config import Settings
        from app.main import create_app
        from fastapi.testclient import TestClient

        release_settings = Settings(_env_file=backend_env_file)
        assert release_settings.max_dataset_upload_bytes == 52_428_800
        assert release_settings.database_url == f"sqlite:///{db_file.as_posix()}"
        assert str(releases_dir) not in release_settings.database_url

        app = create_app(release_settings)
        with TestClient(app) as client:
            resp = client.get("/api/v1/health?verbose=true")
            assert resp.status_code == 200
            health_data = resp.json()
            assert health_data["status"] == "ok"
            assert health_data["database"] == "operational"
            assert health_data["storage"] == "operational"
            assert health_data["readiness"] == "ready"
            assert health_data["liveness"] == "alive"
            log_success("Backend booted with release configuration; /health check reported healthy (operational & ready)")

        # 6. Verify PM2 and systemd templates point to stable paths
        service_template = (deployment_dir / "systemd" / "aps-backend.service").read_text(encoding="utf-8")
        assert "EnvironmentFile=/var/data/aps-intelligence/config/backend.env" in service_template
        assert "WorkingDirectory=/opt/aps-intelligence/current/backend" in service_template
        log_success("Verified systemd service references stable external backend environment")

        pm2_template = (deployment_dir / "pm2" / "ecosystem.config.cjs").read_text(encoding="utf-8")
        assert "/var/data/aps-intelligence/config/frontend.env" in pm2_template
        assert "cwd: '/opt/aps-intelligence/current/frontend'" in pm2_template
        log_success("Verified PM2 ecosystem configuration references stable external frontend environment")

        # 7. Database location check
        assert not str(db_file).startswith(str(releases_dir))
        log_success("Confirmed database remains strictly outside release directories")

        log_success("=== All release lifecycle verification checks PASSED ===")
        log_warn("Host environment note: Actual systemd daemon and PM2 process manager require Linux host.")
        return 0

    except Exception as exc:
        print(f"[-] Release verification failed: {exc}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        os.environ.pop("DATABASE_URL", None)
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(run_release_verification())
