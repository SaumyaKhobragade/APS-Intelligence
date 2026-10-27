"""Read-only historical evidence adapters and API contract tests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.exceptions import ArtifactCompatibilityError
from app.main import create_app
from app.services.historical_evidence import HistoricalEvidenceService


def _write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _metric_payload() -> dict[str, object]:
    return {
        "threshold": 0.115,
        "pr_auc": 0.8011077174714956,
        "roc_auc": 0.9940724576271186,
        "precision": 0.488,
        "recall": 0.915,
        "f1_score": 0.6365217391304347,
        "true_negative": 11608,
        "false_positive": 192,
        "false_negative": 17,
        "true_positive": 183,
        "false_positive_cost": 1.0,
        "false_negative_cost": 10.0,
        "estimated_business_cost": 362.0,
    }


def _experiment_row(reference_id: str, *, status: str = "completed", pipeline_path: str | None = None) -> tuple[object, ...]:
    return (
        reference_id,
        "catboost",
        "phase9.1.0",
        "training-fixture",
        "fixture-fingerprint",
        status,
        "class_weight",
        "native",
        0,
        42,
        0.2,
        0.115,
        1.0,
        10.0,
        6,
        3,
        "artifacts/models/experiments/" + reference_id,
        pipeline_path or f"artifacts/models/experiments/{reference_id}/pipeline.joblib",
        f"artifacts/models/experiments/{reference_id}/preprocessor.joblib",
        f"artifacts/models/experiments/{reference_id}/metadata.json",
        f"artifacts/models/experiments/{reference_id}/splits.json",
        f"artifacts/models/experiments/{reference_id}/curves.json",
        f"artifacts/models/experiments/{reference_id}/feature_importance.json",
        f"artifacts/models/experiments/{reference_id}/confusion_matrix.svg",
        json.dumps({"model_name": "catboost"}),
        json.dumps({"depth": 6}),
        json.dumps([]),
        json.dumps({"pr_auc": 0.4}),
        json.dumps({}),
        json.dumps([]),
        10,
        2,
        "{}",
        "{}",
        None,
        None,
        "fixture failure" if status == "failed" else None,
        "2026-10-27 00:00:00",
        None,
    )


def _insert_experiment(connection: sqlite3.Connection, row: tuple[object, ...]) -> None:
    placeholders = ",".join("?" for _ in row)
    connection.execute(f"INSERT INTO experiment_runs VALUES ({placeholders})", row)


@pytest.fixture
def historical_environment(tmp_path: Path) -> tuple[Settings, HistoricalEvidenceService]:
    settings = Settings(
        environment="test",
        persistent_storage_dir=tmp_path / "data",
        database_url=f"sqlite:///{tmp_path / 'active.db'}",
        dataset_storage_dir=tmp_path / "datasets",
        model_artifact_dir=tmp_path / "artifacts" / "models",
        report_storage_dir=tmp_path / "artifacts" / "reports",
        log_level="WARNING",
    )
    settings.persistent_storage_dir.mkdir(parents=True)

    phase9_db = settings.persistent_storage_dir / "phase9_validation.db"
    connection = sqlite3.connect(phase9_db)
    connection.execute(
        """CREATE TABLE experiment_runs (
            experiment_id TEXT, model_name TEXT, model_version TEXT,
            dataset_id TEXT, dataset_fingerprint TEXT, status TEXT,
            imbalance_strategy TEXT, preprocessing_strategy TEXT,
            optimize_hyperparameters INTEGER, random_seed INTEGER,
            validation_ratio REAL, threshold REAL, false_positive_cost REAL,
            false_negative_cost REAL, search_budget INTEGER, cv_folds INTEGER,
            artifact_directory TEXT, pipeline_artifact_path TEXT,
            preprocessor_artifact_path TEXT, metadata_artifact_path TEXT,
            split_metadata_path TEXT, curves_artifact_path TEXT,
            feature_importance_artifact_path TEXT,
            confusion_matrix_visualization_path TEXT,
            configuration_json TEXT, best_parameters_json TEXT,
            search_results_json TEXT, metrics_json TEXT, curves_json TEXT,
            feature_importance_json TEXT, training_records INTEGER,
            validation_records INTEGER, training_class_counts_json TEXT,
            validation_class_counts_json TEXT, training_duration_seconds REAL,
            inference_duration_seconds REAL, error_message TEXT,
            created_at TEXT, completed_at TEXT
        )"""
    )
    _insert_experiment(connection, _experiment_row("phase9-final-validation-candidate"))
    connection.commit()
    connection.close()

    candidate_dir = settings.model_artifact_dir / "experiments" / "phase9-final-validation-candidate"
    for name in ("pipeline.joblib", "preprocessor.joblib", "metadata.json", "splits.json", "curves.json", "feature_importance.json", "confusion_matrix.svg"):
        candidate_dir.joinpath(name).parent.mkdir(parents=True, exist_ok=True)
        candidate_dir.joinpath(name).write_bytes(b"persisted fixture artifact")

    phase9_root = settings.model_artifact_dir.parent / "phase9" / "phase9-final-validation"
    _write_json(phase9_root / "final_candidate.json", {"model_family": "catboost", "imbalance_strategy": "class_weight", "calibration": {"selected_method": "isotonic"}})
    _write_json(phase9_root / "validation_metrics.json", {"selected_candidate": {"calibrated_internal_min_cost_threshold": _metric_payload()}})
    _write_json(
        phase9_root / "selected" / "threshold_policy_comparisons.json",
        {
            "selected_threshold": 0.115,
            "selected_objective": "minimum_cost",
            "selection_scope": "internal OOF policy subset",
            "external_validation": {"calibrated_internal_min_cost_threshold": _metric_payload()},
            "internal_min_cost": {"threshold": 0.115, "business_cost": 397.0},
        },
    )
    _write_json(
        phase9_root / "selected" / "calibration.json",
        {
            "selected_method": "isotonic",
            "external_validation_comparison": {"isotonic": {"brier_score": 0.01, "reliability_curve": []}},
        },
    )
    phase9_root.joinpath("selected", "calibrator_isotonic.joblib").write_bytes(b"calibrator")

    phase10_root = settings.model_artifact_dir.parent / "phase10" / "official-test-evaluation"
    official_metric = {**_metric_payload(), "pr_auc": 0.8638064645500229, "roc_auc": 0.993536, "precision": 0.613718, "recall": 0.906667, "f1_score": 0.731970, "true_negative": 15411, "false_positive": 214, "false_negative": 35, "true_positive": 340, "estimated_business_cost": 564.0}
    _write_json(
        phase10_root / "official_test_metrics.json",
        {
            "evaluation_id": "phase10-official-test-evaluation",
            "candidate_id": "phase9-final-validation-candidate",
            "frozen_threshold": 0.115,
            "primary_policy": official_metric,
            "confidence_intervals": {"method": "stratified percentile bootstrap", "replicates": 1000, "intervals": {"pr_auc": {"lower": 0.836307, "upper": 0.890892}}},
            "official_test_evaluated": True,
            "retraining_performed": False,
            "calibration_refit": False,
            "threshold_changed": False,
        },
    )
    _write_json(phase10_root / "official_test_calibration.json", {"calibration_method": "isotonic", "brier_score": 0.006978, "log_loss": 0.024511, "expected_calibration_error": 0.001427, "reliability_curve": []})
    _write_json(phase10_root / "official_test_reliability.json", {"expected_calibration_error": 0.001427, "reliability_curve": []})
    _write_json(phase10_root / "official_test_integrity.json", {"official_test_evaluated": True, "model_retrained": False, "calibrator_refit": False, "threshold_changed": False, "promotion_performed": False, "label_reconciliation_passed": True, "output_artifact_sha256": {}})
    _write_json(phase10_root / "pre_evaluation_audit.json", {"model": {"class": "CatBoostClassifier"}})
    _write_json(phase10_root / "official_test_pr_curve.json", {"precision": [0.6], "recall": [0.9], "thresholds": [0.115]})
    _write_json(phase10_root / "official_test_roc_curve.json", {"false_positive_rate": [0.01], "true_positive_rate": [0.9], "thresholds": [0.115]})
    for name in ("official_test_comparison.csv", "official_test_confusion_matrix.json", "official_test_predictions.csv", "official_test_report.md"):
        phase10_root.joinpath(name).parent.mkdir(parents=True, exist_ok=True)
        phase10_root.joinpath(name).write_text("fixture", encoding="utf-8")

    return settings, HistoricalEvidenceService(settings)


def test_phase9_nested_metrics_are_normalized_without_mixing_cv(historical_environment: tuple[Settings, HistoricalEvidenceService]) -> None:
    _, service = historical_environment

    response = service.validation_detail("phase9-final-validation-candidate")
    metric = response.metrics[0]

    assert response.normalization_version == "phase9-validation-nested-v1"
    assert metric.scope == "validation"
    assert metric.threshold == pytest.approx(0.115)
    assert metric.pr_auc == pytest.approx(0.8011077174714956)
    assert metric.confusion_matrix is not None
    assert metric.confusion_matrix.true_negative == 11608
    assert response.cross_validation is None
    assert response.reference.lifecycle_status == "evaluated"
    assert response.reference.candidate_label == "Final validation candidate — not production approved"


def test_phase9_threshold_and_calibration_are_persisted_and_read_only(
    historical_environment: tuple[Settings, HistoricalEvidenceService],
) -> None:
    _, service = historical_environment

    threshold = service.thresholds("phase9-final-validation-candidate")
    calibration = service.calibration("phase9-final-validation-candidate")

    assert threshold.frozen_threshold == pytest.approx(0.115)
    assert threshold.calibration_method == "isotonic"
    assert threshold.selection_objective == "minimum_cost"
    assert calibration.selected_method == "isotonic"
    assert calibration.evaluation_scope.startswith("External validation")


def test_validation_comparison_uses_frozen_candidate_operating_point(
    historical_environment: tuple[Settings, HistoricalEvidenceService],
) -> None:
    _, service = historical_environment

    response = service.validation_comparison(page=1, page_size=100)
    candidate = next(item for item in response.items if item.reference_id == "phase9-final-validation-candidate")

    assert candidate.threshold == pytest.approx(0.115)
    assert candidate.validation_metrics is not None
    assert candidate.validation_metrics.pr_auc == pytest.approx(0.8011077174714956)


def test_failed_experiment_is_retained_with_unavailable_artifacts(tmp_path: Path) -> None:
    settings = Settings(
        environment="test",
        persistent_storage_dir=tmp_path / "data",
        database_url=f"sqlite:///{tmp_path / 'active.db'}",
        dataset_storage_dir=tmp_path / "datasets",
        model_artifact_dir=tmp_path / "artifacts" / "models",
        report_storage_dir=tmp_path / "artifacts" / "reports",
        log_level="WARNING",
    )
    settings.persistent_storage_dir.mkdir(parents=True)
    connection = sqlite3.connect(settings.persistent_storage_dir / "phase4_smoke.db")
    connection.execute("CREATE TABLE experiment_runs (experiment_id TEXT, model_name TEXT, model_version TEXT, dataset_id TEXT, dataset_fingerprint TEXT, status TEXT, imbalance_strategy TEXT, preprocessing_strategy TEXT, optimize_hyperparameters INTEGER, random_seed INTEGER, validation_ratio REAL, threshold REAL, false_positive_cost REAL, false_negative_cost REAL, search_budget INTEGER, cv_folds INTEGER, artifact_directory TEXT, pipeline_artifact_path TEXT, preprocessor_artifact_path TEXT, metadata_artifact_path TEXT, split_metadata_path TEXT, curves_artifact_path TEXT, feature_importance_artifact_path TEXT, confusion_matrix_visualization_path TEXT, configuration_json TEXT, best_parameters_json TEXT, search_results_json TEXT, metrics_json TEXT, curves_json TEXT, feature_importance_json TEXT, training_records INTEGER, validation_records INTEGER, training_class_counts_json TEXT, validation_class_counts_json TEXT, training_duration_seconds REAL, inference_duration_seconds REAL, error_message TEXT, created_at TEXT, completed_at TEXT)")
    _insert_experiment(connection, _experiment_row("failed-experiment", status="failed"))
    connection.commit()
    connection.close()

    detail = HistoricalEvidenceService(settings).experiment_detail("failed-experiment")
    assert detail.status == "failed"
    assert detail.artifact_available is False
    assert any(item.status == "failed" for item in detail.availability)
    assert detail.error_message == "fixture failure"


def test_historical_artifact_path_traversal_is_rejected(tmp_path: Path) -> None:
    settings = Settings(
        environment="test",
        persistent_storage_dir=tmp_path / "data",
        database_url=f"sqlite:///{tmp_path / 'active.db'}",
        dataset_storage_dir=tmp_path / "datasets",
        model_artifact_dir=tmp_path / "artifacts" / "models",
        report_storage_dir=tmp_path / "artifacts" / "reports",
        log_level="WARNING",
    )
    settings.persistent_storage_dir.mkdir(parents=True)
    connection = sqlite3.connect(settings.persistent_storage_dir / "phase4_smoke.db")
    connection.execute("CREATE TABLE experiment_runs (experiment_id TEXT, model_name TEXT, model_version TEXT, dataset_id TEXT, dataset_fingerprint TEXT, status TEXT, imbalance_strategy TEXT, preprocessing_strategy TEXT, optimize_hyperparameters INTEGER, random_seed INTEGER, validation_ratio REAL, threshold REAL, false_positive_cost REAL, false_negative_cost REAL, search_budget INTEGER, cv_folds INTEGER, artifact_directory TEXT, pipeline_artifact_path TEXT, preprocessor_artifact_path TEXT, metadata_artifact_path TEXT, split_metadata_path TEXT, curves_artifact_path TEXT, feature_importance_artifact_path TEXT, confusion_matrix_visualization_path TEXT, configuration_json TEXT, best_parameters_json TEXT, search_results_json TEXT, metrics_json TEXT, curves_json TEXT, feature_importance_json TEXT, training_records INTEGER, validation_records INTEGER, training_class_counts_json TEXT, validation_class_counts_json TEXT, training_duration_seconds REAL, inference_duration_seconds REAL, error_message TEXT, created_at TEXT, completed_at TEXT)")
    _insert_experiment(connection, _experiment_row("unsafe", pipeline_path="../outside.joblib"))
    connection.commit()
    connection.close()

    with pytest.raises(ArtifactCompatibilityError):
        HistoricalEvidenceService(settings).experiments(1, 20)


def test_historical_database_connection_is_read_only(historical_environment: tuple[Settings, HistoricalEvidenceService]) -> None:
    _, service = historical_environment
    connection = service._connect("phase9_validation.db")
    assert connection is not None
    with pytest.raises(sqlite3.OperationalError, match="readonly"):
        connection.execute("CREATE TABLE should_not_exist (value TEXT)")
    connection.close()


def test_historical_api_does_not_load_models_or_enable_inference(
    historical_environment: tuple[Settings, HistoricalEvidenceService],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings, _ = historical_environment

    import joblib

    monkeypatch.setattr(joblib, "load", lambda *_args, **_kwargs: pytest.fail("historical evidence must not load model binaries"))
    application = create_app(settings)
    with TestClient(application) as client:
        response = client.get("/api/v1/historical-evidence/validation/phase9-final-validation-candidate")
        assert response.status_code == 200, response.text
        assert response.json()["reference"]["lifecycle_status"] == "evaluated"


def test_official_test_evidence_is_separate_and_persisted(historical_environment: tuple[Settings, HistoricalEvidenceService]) -> None:
    _, service = historical_environment

    evidence = service.official_test()

    assert evidence.evaluation_scope == "official_test"
    assert evidence.model_name == "catboost"
    assert evidence.imbalance_strategy == "class_weight"
    assert evidence.calibration_method == "isotonic"
    assert evidence.frozen_threshold == pytest.approx(0.115)
    assert evidence.metrics.pr_auc == pytest.approx(0.8638064645500229)
    assert evidence.metrics.confusion_matrix is not None
    assert evidence.metrics.confusion_matrix.true_positive == 340
    assert evidence.metrics.scope == "official_test"
    assert "pr_auc" in evidence.confidence_intervals
    assert evidence.integrity_flags["promotion_performed"] is False
    assert evidence.provenance and "raw official test CSV is not read" in evidence.provenance[0]
