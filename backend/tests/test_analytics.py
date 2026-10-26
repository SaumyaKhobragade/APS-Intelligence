"""Phase 8 analytics, export and unavailable-data contract tests."""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import delete

from app.core.config import Settings
from app.database.base import Base
from app.main import create_app
from app.models.dataset import DatasetMetadata
from app.models.experiment import ExperimentRun
from app.models.prediction import PredictionRecord
from app.models.training import ModelTrainingRun
from app.services.model_training.artifacts import training_artifact_paths


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture
def analytics_environment(tmp_path: Path) -> dict[str, Any]:
    settings = Settings(
        environment="test",
        persistent_storage_dir=tmp_path / "data",
        database_url=f"sqlite:///{tmp_path / 'analytics.db'}",
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
        session = app.state.session_factory()
        dataset = DatasetMetadata(
            dataset_id="dataset-analytics",
            dataset_name="Synthetic analytics fixture",
            dataset_type="training",
            source_file_name="unavailable.csv",
            source_path=str(tmp_path / "unavailable.csv"),
            fingerprint="analytics-fingerprint",
            file_size_bytes=1,
            record_count=10,
            feature_count=3,
            target_column="class",
            status="ready",
            imported_at=utc_now(),
        )
        session.add(dataset)
        run_id = "run-analytics"
        paths = training_artifact_paths(settings.model_artifact_dir, run_id)
        paths.directory.mkdir(parents=True, exist_ok=True)
        for path in (paths.model, paths.preprocessor, paths.metadata, paths.split_metadata):
            path.write_bytes(b"synthetic-artifact")
        session.add(
            ModelTrainingRun(
                run_id=run_id,
                model_name="random_forest",
                model_version="analytics-1",
                dataset_id=dataset.dataset_id,
                dataset_fingerprint=dataset.fingerprint,
                status="completed",
                registry_status="evaluated",
                random_seed=42,
                validation_ratio=0.2,
                threshold=0.5,
                false_positive_cost=1.0,
                false_negative_cost=10.0,
                artifact_directory=str(paths.directory),
                model_artifact_path=str(paths.model),
                preprocessor_artifact_path=str(paths.preprocessor),
                metadata_artifact_path=str(paths.metadata),
                split_metadata_path=str(paths.split_metadata),
                preprocessing_configuration_json=json.dumps({"strategy": "median", "feature_names_before": ["a", "b", "c"]}),
                hyperparameters_json=json.dumps({"n_estimators": 10}),
                class_imbalance_configuration_json=json.dumps({"mode": "balanced"}),
                feature_names_before_json=json.dumps(["a", "b", "c"]),
                feature_names_after_json=json.dumps(["a", "b", "c"]),
                training_records=8,
                validation_records=2,
                metrics_json=json.dumps({"pr_auc": 0.7, "roc_auc": 0.8, "precision": 0.4, "recall": 0.6, "f1_score": 0.48, "estimated_business_cost": 5}),
                created_at=utc_now(),
                completed_at=utc_now(),
                configuration_fingerprint="a" * 64,
                split_identifier="analytics-split",
                library_versions_json=json.dumps({"python": "test"}),
                artifact_checksums_json="{}",
                artifact_integrity_status="pending",
                lifecycle_metadata_json=json.dumps({"synthetic_fixture": True}),
            )
        )
        session.add(
            ExperimentRun(
                experiment_id="exp-analytics",
                model_name="random_forest",
                model_version="analytics-1",
                dataset_id=dataset.dataset_id,
                dataset_fingerprint=dataset.fingerprint,
                status="completed",
                registry_status="evaluated",
                imbalance_strategy="original",
                preprocessing_strategy="median",
                optimize_hyperparameters=False,
                random_seed=42,
                validation_ratio=0.2,
                threshold=0.5,
                false_positive_cost=1.0,
                false_negative_cost=10.0,
                search_budget=1,
                cv_folds=2,
                artifact_directory=str(settings.model_artifact_dir / "experiments" / "exp-analytics"),
                pipeline_artifact_path=str(settings.model_artifact_dir / "experiments" / "exp-analytics" / "pipeline.joblib"),
                preprocessor_artifact_path=str(settings.model_artifact_dir / "experiments" / "exp-analytics" / "preprocessor.joblib"),
                metadata_artifact_path=str(settings.model_artifact_dir / "experiments" / "exp-analytics" / "metadata.json"),
                split_metadata_path=str(settings.model_artifact_dir / "experiments" / "exp-analytics" / "splits.json"),
                curves_artifact_path=str(settings.model_artifact_dir / "experiments" / "exp-analytics" / "curves.json"),
                feature_importance_artifact_path=str(settings.model_artifact_dir / "experiments" / "exp-analytics" / "feature_importance.json"),
                confusion_matrix_visualization_path=str(settings.model_artifact_dir / "experiments" / "exp-analytics" / "confusion_matrix.svg"),
                configuration_json=json.dumps({"feature_names_before": ["a", "b", "c"]}),
                best_parameters_json="{}",
                search_results_json="[]",
                metrics_json=json.dumps({"pr_auc": 0.71, "roc_auc": 0.81, "precision": 0.42, "recall": 0.61, "f1_score": 0.49}),
                curves_json=json.dumps({"precision_recall": {"precision": [0.4], "recall": [0.6]}, "roc": {"fpr": [0.1], "tpr": [0.8]}}),
                feature_importance_json="[]",
                training_records=8,
                validation_records=2,
                training_class_counts_json="{}",
                validation_class_counts_json="{}",
                created_at=utc_now(),
                completed_at=utc_now(),
                configuration_fingerprint="b" * 64,
                split_identifier="analytics-split",
                library_versions_json=json.dumps({"python": "test"}),
                artifact_checksums_json="{}",
                artifact_integrity_status="pending",
                lifecycle_metadata_json=json.dumps({"synthetic_fixture": True}),
            )
        )
        session.add(
            PredictionRecord(
                prediction_id="pred-analytics",
                model_reference_type="training_run",
                model_reference_id=run_id,
                model_version="analytics-1",
                predicted_class="pos",
                raw_failure_probability=0.8,
                failure_probability=0.8,
                applied_threshold=0.5,
                calibration_method="uncalibrated",
                risk_classification="high",
                prediction_timestamp=utc_now(),
                inference_duration_ms=1.0,
                warnings_json="[]",
                metadata_json="{}",
                artifact_checksums_json="{}",
            )
        )
        session.commit()
        session.close()
        yield {"client": client, "app": app, "run_id": run_id, "paths": paths}


def test_dashboard_empty_and_recorded_counts(analytics_environment: dict[str, Any]) -> None:
    response = analytics_environment["client"].get("/api/v1/analytics/dashboard")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["model_run_count"] == 1
    assert payload["experiment_count"] == 1
    assert payload["total_predictions"] == 1
    assert payload["positive_prediction_count"] == 1
    assert payload["current_promotion"] is None
    assert any(item["name"] == "official_test_metrics" and item["status"] == "unavailable" for item in payload["availability"])


def test_dashboard_empty_registry(analytics_environment: dict[str, Any]) -> None:
    session = analytics_environment["app"].state.session_factory()
    for table in (PredictionRecord, ExperimentRun, ModelTrainingRun, DatasetMetadata):
        session.execute(delete(table))
    session.commit()
    session.close()
    payload = analytics_environment["client"].get("/api/v1/analytics/dashboard").json()
    assert payload["model_run_count"] == 0
    assert payload["experiment_count"] == 0
    assert payload["total_predictions"] == 0
    assert payload["current_promotion"] is None


def test_dataset_analytics_reports_missing_source_without_reprocessing(analytics_environment: dict[str, Any]) -> None:
    response = analytics_environment["client"].get("/api/v1/analytics/datasets/dataset-analytics?page=1&page_size=2")
    assert response.status_code == 200
    payload = response.json()
    assert payload["source_available"] is False
    assert payload["profile_available"] is False
    assert payload["profile"] is None
    assert any(item["name"] == "source_data" and item["status"] == "blocked" for item in payload["availability"])


def test_model_comparison_filters_and_evaluation_scope(analytics_environment: dict[str, Any]) -> None:
    client: TestClient = analytics_environment["client"]
    comparison = client.get("/api/v1/analytics/models/comparison?model_name=random_forest&page_size=10")
    assert comparison.status_code == 200
    assert comparison.json()["total"] == 2
    assert {item["reference_type"] for item in comparison.json()["items"]} == {"training_run", "experiment"}
    assert all(item["precision_recall_curve"] is None for item in comparison.json()["items"] if item["reference_type"] == "experiment")
    official = client.get("/api/v1/analytics/models/comparison?evaluation_type=official_test")
    assert official.status_code == 200
    assert official.json()["items"] == []
    assert official.json()["availability"][0]["status"] == "unavailable"


def test_threshold_missing_artifacts_and_exports_are_safe(analytics_environment: dict[str, Any]) -> None:
    client: TestClient = analytics_environment["client"]
    thresholds = client.get(f"/api/v1/analytics/thresholds/{analytics_environment['run_id']}")
    assert thresholds.status_code == 200
    assert thresholds.json()["threshold_analysis"] is None
    assert thresholds.json()["availability"]
    json_export = client.get(f"/api/v1/exports/experiments/training_run/{analytics_environment['run_id']}.json")
    assert json_export.status_code == 200
    assert json_export.headers["content-type"].startswith("application/json")
    csv_export = client.get(f"/api/v1/exports/experiments/training_run/{analytics_environment['run_id']}.csv")
    assert csv_export.status_code == 200
    assert "configuration_fingerprint" in csv_export.text
    pdf_export = client.get(f"/api/v1/reports/experiments/training_run/{analytics_environment['run_id']}.pdf")
    assert pdf_export.status_code == 200
    assert pdf_export.content.startswith(b"%PDF")
    predictions = client.get("/api/v1/exports/predictions.csv?page_size=10")
    assert predictions.status_code == 200
    assert "prediction_id" in predictions.text
    unsafe = client.get("/api/v1/exports/experiments/training_run/..%2Fbad.json")
    assert unsafe.status_code in {400, 404}
