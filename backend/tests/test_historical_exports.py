"""AUDIT-001 regression tests: historical experiment exports."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
from typing import Any

from fastapi.testclient import TestClient
import pytest

from app.core.config import Settings
from app.database.base import Base
from app.main import create_app
from app.models.training import ModelTrainingRun


def _hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@pytest.fixture
def export_test_app(tmp_path: Path) -> tuple[TestClient, dict[str, str]]:
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)

    repo_data = Path(__file__).resolve().parents[1] / "data"
    p3_src = repo_data / "phase3_smoke.db"
    p4_src = repo_data / "phase4_smoke.db"
    p9_src = repo_data / "phase9_validation.db"

    shutil.copy2(p3_src, data_dir / "phase3_smoke.db")
    shutil.copy2(p4_src, data_dir / "phase4_smoke.db")
    shutil.copy2(p9_src, data_dir / "phase9_validation.db")

    initial_hashes = {
        "phase3": _hash_file(data_dir / "phase3_smoke.db"),
        "phase4": _hash_file(data_dir / "phase4_smoke.db"),
        "phase9": _hash_file(data_dir / "phase9_validation.db"),
    }

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
        yield client, initial_hashes


def test_historical_phase3_exports(export_test_app: tuple[TestClient, dict[str, str]]) -> None:
    client, _ = export_test_app
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


def test_historical_phase4_exports(export_test_app: tuple[TestClient, dict[str, str]]) -> None:
    client, _ = export_test_app
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


def test_historical_phase9_exports(export_test_app: tuple[TestClient, dict[str, str]]) -> None:
    client, _ = export_test_app
    ref_id = "phase9-final-validation-candidate"

    # JSON export
    res = client.get(f"/api/v1/exports/experiments/experiment/{ref_id}.json")
    assert res.status_code == 200
    assert "application/json" in res.headers["content-type"]
    payload = res.json()
    assert payload["source"] == "historical_evidence_records"
    assert payload["is_historical_evidence"] is True
    assert payload["evaluation_scope"] == "validation"
    # Phase 9 final validation candidate is the sole model with Phase 10 test evaluation
    assert payload["official_test_evaluation_available"] is True
    assert payload["registry"]["reference_id"] == ref_id
    assert payload["threshold_analytics"] is not None

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


def test_nonexistent_experiment_export_returns_404(export_test_app: tuple[TestClient, dict[str, str]]) -> None:
    client, _ = export_test_app

    res_json = client.get("/api/v1/exports/experiments/training_run/run-does-not-exist.json")
    assert res_json.status_code == 404

    res_csv = client.get("/api/v1/exports/experiments/experiment/exp-does-not-exist.csv")
    assert res_csv.status_code == 404

    res_pdf = client.get("/api/v1/reports/experiments/training_run/run-does-not-exist.pdf")
    assert res_pdf.status_code == 404


def test_historical_exports_zero_db_mutations(export_test_app: tuple[TestClient, dict[str, str]]) -> None:
    client, initial_hashes = export_test_app
    app_settings: Settings = client.app.state.settings
    data_dir = app_settings.persistent_storage_dir

    # Trigger multiple exports
    client.get("/api/v1/exports/experiments/training_run/run-e5fbb875ddc44a0a97f2.json")
    client.get("/api/v1/exports/experiments/experiment/exp-ea031c709de9475fa03f.csv")
    client.get("/api/v1/reports/experiments/experiment/phase9-final-validation-candidate.pdf")

    # Verify hashes unchanged
    assert _hash_file(data_dir / "phase3_smoke.db") == initial_hashes["phase3"]
    assert _hash_file(data_dir / "phase4_smoke.db") == initial_hashes["phase4"]
    assert _hash_file(data_dir / "phase9_validation.db") == initial_hashes["phase9"]
