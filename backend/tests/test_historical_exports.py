"""AUDIT-001 regression tests: historical experiment exports."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import sqlite3
from typing import Any

from fastapi.testclient import TestClient
import pytest

from app.core.config import Settings
from app.database.base import Base
from app.main import create_app


def _hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _get_table_row_counts(db_path: Path) -> dict[str, int]:
    conn = sqlite3.connect(db_path)
    try:
        tables = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        ]
        return {
            table: conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            for table in tables
        }
    finally:
        conn.close()


@pytest.fixture
def export_test_app(tmp_path: Path) -> tuple[TestClient, dict[str, str], Path]:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    repo_backend = Path(__file__).resolve().parents[1]
    repo_data = repo_backend / "data"
    p3_src = repo_data / "phase3_smoke.db"
    p4_src = repo_data / "phase4_smoke.db"
    p9_src = repo_data / "phase9_validation.db"

    shutil.copy2(p3_src, data_dir / "phase3_smoke.db")
    shutil.copy2(p4_src, data_dir / "phase4_smoke.db")
    shutil.copy2(p9_src, data_dir / "phase9_validation.db")

    # Copy Phase 9 and Phase 10 artifacts into tmp_path
    repo_artifacts = repo_backend / "artifacts"
    if (repo_artifacts / "phase9").exists():
        shutil.copytree(repo_artifacts / "phase9", tmp_path / "artifacts" / "phase9", dirs_exist_ok=True)
    if (repo_artifacts / "phase10").exists():
        shutil.copytree(repo_artifacts / "phase10", tmp_path / "artifacts" / "phase10", dirs_exist_ok=True)

    settings = Settings(
        environment="test",
        persistent_storage_dir=data_dir,
        database_url=f"sqlite:///{data_dir / 'aps_intelligence.db'}",
        dataset_storage_dir=tmp_path / "datasets",
        model_artifact_dir=tmp_path / "artifacts" / "models",
        report_storage_dir=tmp_path / "artifacts" / "reports",
        expected_feature_count=3,
        analytics_export_max_rows=100,
        allowed_cors_origins=[],
        log_level="WARNING",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        Base.metadata.create_all(app.state.engine)
        initial_hashes = {
            "active": _hash_file(data_dir / "aps_intelligence.db"),
            "phase3": _hash_file(data_dir / "phase3_smoke.db"),
            "phase4": _hash_file(data_dir / "phase4_smoke.db"),
            "phase9": _hash_file(data_dir / "phase9_validation.db"),
        }
        yield client, initial_hashes, tmp_path


def test_historical_phase3_exports(export_test_app: tuple[TestClient, dict[str, str], Path]) -> None:
    client, _, _ = export_test_app
    ref_id = "run-e5fbb875ddc44a0a97f2"

    # JSON export
    res = client.get(f"/api/v1/exports/experiments/training_run/{ref_id}.json")
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    payload = res.json()
    assert payload["source"] == "historical_evidence_records"
    assert payload["is_historical_evidence"] is True
    assert payload["evaluation_scope"] == "validation"
    assert payload["official_test_evaluation_available"] is False
    assert payload["registry"]["reference_id"] == ref_id
    assert payload["registry"]["model_name"] == "catboost"

    # CSV export
    res_csv = client.get(f"/api/v1/exports/experiments/training_run/{ref_id}.csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    csv_text = res_csv.text
    assert ref_id in csv_text
    assert "catboost" in csv_text

    # PDF export
    res_pdf = client.get(f"/api/v1/reports/experiments/training_run/{ref_id}.pdf")
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert res_pdf.content.startswith(b"%PDF")


def test_historical_phase4_exports(export_test_app: tuple[TestClient, dict[str, str], Path]) -> None:
    client, _, _ = export_test_app
    ref_id = "exp-ea031c709de9475fa03f"

    # JSON export
    res = client.get(f"/api/v1/exports/experiments/experiment/{ref_id}.json")
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    payload = res.json()
    assert payload["source"] == "historical_evidence_records"
    assert payload["is_historical_evidence"] is True
    assert payload["evaluation_scope"] == "validation"
    assert payload["official_test_evaluation_available"] is False
    assert payload["registry"]["reference_id"] == ref_id
    assert payload["threshold_analytics"] is None

    # CSV export
    res_csv = client.get(f"/api/v1/exports/experiments/experiment/{ref_id}.csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert ref_id in res_csv.text

    # PDF export
    res_pdf = client.get(f"/api/v1/reports/experiments/experiment/{ref_id}.pdf")
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert res_pdf.content.startswith(b"%PDF")


def test_historical_phase9_exports_with_phase10_evidence(export_test_app: tuple[TestClient, dict[str, str], Path]) -> None:
    client, _, _ = export_test_app
    ref_id = "phase9-final-validation-candidate"

    # JSON export
    res = client.get(f"/api/v1/exports/experiments/experiment/{ref_id}.json")
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    payload = res.json()
    assert payload["source"] == "historical_evidence_records"
    assert payload["is_historical_evidence"] is True
    assert payload["evaluation_scope"] == "validation"
    # Phase 10 evidence is present and verified on disk
    assert payload["official_test_evaluation_available"] is True
    assert payload["registry"]["reference_id"] == ref_id
    assert payload["threshold_analytics"] is not None

    # Crucial scientific check: validation metrics must remain validation metrics (362.0), not official test metrics (564.0)
    val_metrics = payload["registry"]["validation_metrics"]
    assert val_metrics["estimated_business_cost"] == 362.0
    assert val_metrics["pr_auc"] == pytest.approx(0.8011, abs=0.001)

    # CSV export
    res_csv = client.get(f"/api/v1/exports/experiments/experiment/{ref_id}.csv")
    assert res_csv.status_code == 200
    assert "text/csv" in res_csv.headers["content-type"]
    assert ref_id in res_csv.text
    assert "362.0" in res_csv.text

    # PDF export
    res_pdf = client.get(f"/api/v1/reports/experiments/experiment/{ref_id}.pdf")
    assert res_pdf.status_code == 200
    assert res_pdf.headers["content-type"] == "application/pdf"
    assert res_pdf.content.startswith(b"%PDF")


def test_historical_phase9_when_phase10_evidence_missing_or_corrupt(
    export_test_app: tuple[TestClient, dict[str, str], Path],
) -> None:
    client, _, tmp_path = export_test_app
    ref_id = "phase9-final-validation-candidate"

    # Case 1: Delete Phase 10 evidence directory
    p10_dir = tmp_path / "artifacts" / "phase10" / "official-test-evaluation"
    shutil.rmtree(p10_dir)

    res = client.get(f"/api/v1/exports/experiments/experiment/{ref_id}.json")
    assert res.status_code == 200
    payload = res.json()
    assert payload["official_test_evaluation_available"] is False
    # Validation metrics remain intact
    assert payload["registry"]["validation_metrics"]["estimated_business_cost"] == 362.0

    res_pdf = client.get(f"/api/v1/reports/experiments/experiment/{ref_id}.pdf")
    assert res_pdf.status_code == 200
    assert res_pdf.content.startswith(b"%PDF")

    # Case 2: Re-create Phase 10 with corrupted json
    p10_dir.mkdir(parents=True, exist_ok=True)
    (p10_dir / "official_test_metrics.json").write_text("{corrupt: json}", encoding="utf-8")
    (p10_dir / "official_test_calibration.json").write_text("{}", encoding="utf-8")
    (p10_dir / "official_test_reliability.json").write_text("{}", encoding="utf-8")
    (p10_dir / "official_test_integrity.json").write_text("{}", encoding="utf-8")
    (p10_dir / "pre_evaluation_audit.json").write_text("{}", encoding="utf-8")

    res_corrupt = client.get(f"/api/v1/exports/experiments/experiment/{ref_id}.json")
    assert res_corrupt.status_code == 200
    payload_corrupt = res_corrupt.json()
    assert payload_corrupt["official_test_evaluation_available"] is False


def test_nonexistent_experiment_export_returns_404(
    export_test_app: tuple[TestClient, dict[str, str], Path],
) -> None:
    client, _, _ = export_test_app

    res_json = client.get("/api/v1/exports/experiments/training_run/run-does-not-exist.json")
    assert res_json.status_code == 404
    assert "was not found" in res_json.json()["error"]["message"]

    res_csv = client.get("/api/v1/exports/experiments/experiment/exp-does-not-exist.csv")
    assert res_csv.status_code == 404

    res_pdf = client.get("/api/v1/reports/experiments/training_run/run-does-not-exist.pdf")
    assert res_pdf.status_code == 404


def test_missing_historical_database_returns_503(
    export_test_app: tuple[TestClient, dict[str, str], Path],
) -> None:
    client, _, tmp_path = export_test_app
    data_dir = tmp_path / "data"

    # Remove phase3_smoke.db
    (data_dir / "phase3_smoke.db").unlink()

    res = client.get("/api/v1/exports/experiments/training_run/run-e5fbb875ddc44a0a97f2.json")
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "artifact_unavailable"

    # Remove phase9_validation.db
    (data_dir / "phase9_validation.db").unlink()

    res_p9 = client.get("/api/v1/exports/experiments/experiment/phase9-final-validation-candidate.json")
    assert res_p9.status_code == 503
    assert res_p9.json()["error"]["code"] == "artifact_unavailable"


def test_corrupt_historical_database_returns_409(
    export_test_app: tuple[TestClient, dict[str, str], Path],
) -> None:
    client, _, tmp_path = export_test_app
    data_dir = tmp_path / "data"

    # Corrupt phase4_smoke.db
    (data_dir / "phase4_smoke.db").write_text("CORRUPTED_NOT_SQLITE_FILE", encoding="utf-8")

    res = client.get("/api/v1/exports/experiments/experiment/exp-ea031c709de9475fa03f.json")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "artifact_incompatible"


def test_historical_exports_zero_db_mutations(
    export_test_app: tuple[TestClient, dict[str, str], Path],
) -> None:
    client, initial_hashes, _ = export_test_app
    app_settings: Settings = client.app.state.settings
    data_dir = app_settings.persistent_storage_dir
    active_db = data_dir / "aps_intelligence.db"

    initial_row_counts = _get_table_row_counts(active_db)

    # Trigger comprehensive suite of exports across Phase 3, Phase 4, Phase 9
    client.get("/api/v1/exports/experiments/training_run/run-e5fbb875ddc44a0a97f2.json")
    client.get("/api/v1/exports/experiments/training_run/run-e5fbb875ddc44a0a97f2.csv")
    client.get("/api/v1/reports/experiments/training_run/run-e5fbb875ddc44a0a97f2.pdf")

    client.get("/api/v1/exports/experiments/experiment/exp-ea031c709de9475fa03f.json")
    client.get("/api/v1/exports/experiments/experiment/exp-ea031c709de9475fa03f.csv")
    client.get("/api/v1/reports/experiments/experiment/exp-ea031c709de9475fa03f.pdf")

    client.get("/api/v1/exports/experiments/experiment/phase9-final-validation-candidate.json")
    client.get("/api/v1/exports/experiments/experiment/phase9-final-validation-candidate.csv")
    client.get("/api/v1/reports/experiments/experiment/phase9-final-validation-candidate.pdf")

    # Verify hashes unchanged for all 4 databases (active + 3 historical)
    assert _hash_file(active_db) == initial_hashes["active"]
    assert _hash_file(data_dir / "phase3_smoke.db") == initial_hashes["phase3"]
    assert _hash_file(data_dir / "phase4_smoke.db") == initial_hashes["phase4"]
    assert _hash_file(data_dir / "phase9_validation.db") == initial_hashes["phase9"]

    # Verify zero mutations across all tables in active database
    final_row_counts = _get_table_row_counts(active_db)
    assert final_row_counts == initial_row_counts
    for count in final_row_counts.values():
        assert count == 0
