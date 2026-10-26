"""Synthetic Phase 6 inference, persistence and integrity tests.

These tests deliberately use a tiny deterministic estimator and three-feature
contract. They validate the inference infrastructure without claiming APS
results or requiring the ignored production artifacts.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sklearn.isotonic import IsotonicRegression

from app.core.config import Settings
from app.core.exceptions import ArtifactCompatibilityError
from app.database.base import Base
from app.main import create_app
from app.models.dataset import DatasetMetadata
from app.models.prediction import DecisionPolicy
from app.models.training import ModelTrainingRun
from app.schemas.phase5 import DecisionPolicyRow, Phase5ArtifactReferences, Phase5Reference, DecisionPolicyComparisonResponse
from app.schemas.predictions import PredictionReference, PredictionRequest, SensorRecord
from app.services.model_training.artifacts import phase5_artifact_paths, training_artifact_paths
from app.services.prediction.inference import InferenceService


FEATURES = ["sensor_a", "sensor_b", "sensor_c"]


class IdentityPreprocessor:
    """Pickle-safe synthetic preprocessor used only by these tests."""

    def __init__(self, feature_names: list[str]) -> None:
        self.feature_names = feature_names

    def transform(self, frame: Any) -> np.ndarray:
        return np.asarray(frame[self.feature_names], dtype=float)

    def get_feature_names_out(self, input_features: Any = None) -> np.ndarray:
        return np.asarray(self.feature_names, dtype=object)


class SyntheticEstimator:
    """Deterministic binary estimator with a real sklearn-like interface."""

    classes_ = np.array([0, 1])
    n_features_in_ = 3
    feature_importances_ = np.array([0.8, 0.15, 0.05])

    def predict_proba(self, values: Any) -> np.ndarray:
        values = np.asarray(values, dtype=float)
        probabilities = np.where(values[:, 0] > 0, 0.8, 0.2)
        return np.column_stack((1.0 - probabilities, probabilities))


@pytest.fixture
def prediction_environment(tmp_path: Path) -> dict[str, Any]:
    settings = Settings(
        environment="test",
        persistent_storage_dir=tmp_path / "data",
        database_url=f"sqlite:///{tmp_path / 'predictions.db'}",
        dataset_storage_dir=tmp_path / "datasets",
        model_artifact_dir=tmp_path / "artifacts" / "models",
        report_storage_dir=tmp_path / "artifacts" / "reports",
        expected_feature_count=3,
        prediction_batch_max_size=3,
        allowed_cors_origins=[],
        log_level="WARNING",
    )
    application = create_app(settings)
    with TestClient(application) as client:
        Base.metadata.create_all(application.state.engine)
        run_id = "run-synthetic-phase6"
        paths = training_artifact_paths(settings.model_artifact_dir, run_id)
        paths.directory.mkdir(parents=True, exist_ok=True)
        preprocessor = IdentityPreprocessor(FEATURES)
        model = SyntheticEstimator()
        joblib.dump(model, paths.model)
        joblib.dump(preprocessor, paths.preprocessor)
        paths.metadata.write_text(
            json.dumps(
                {
                    "run_id": run_id,
                    "model_name": "logistic_regression",
                    "model_version": "synthetic-1",
                    "dataset_id": "dataset-synthetic",
                    "dataset_fingerprint": "synthetic-fingerprint",
                    "preprocessing_configuration": {
                        "feature_names_before": FEATURES,
                        "feature_names_after": FEATURES,
                    },
                }
            ),
            encoding="utf-8",
        )
        session = application.state.session_factory()
        session.add(
            DatasetMetadata(
                dataset_id="dataset-synthetic",
                dataset_name="Synthetic Phase 6 fixture",
                dataset_type="training",
                source_file_name="synthetic.csv",
                source_path="synthetic.csv",
                fingerprint="synthetic-fingerprint",
                file_size_bytes=1,
                record_count=6,
                feature_count=3,
                target_column="class",
                status="ready",
                imported_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
        )
        session.add(
            ModelTrainingRun(
                run_id=run_id,
                model_name="logistic_regression",
                model_version="synthetic-1",
                dataset_id="dataset-synthetic",
                dataset_fingerprint="synthetic-fingerprint",
                status="completed",
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
                preprocessing_configuration_json=json.dumps({"feature_names_before": FEATURES, "feature_names_after": FEATURES}),
                hyperparameters_json="{}",
                class_imbalance_configuration_json="{}",
                feature_names_before_json=json.dumps(FEATURES),
                feature_names_after_json=json.dumps(FEATURES),
                training_records=5,
                validation_records=1,
                created_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
        )
        session.commit()
        session.close()
        yield {"app": application, "client": client, "settings": settings, "run_id": run_id, "paths": paths}


def add_policy(environment: dict[str, Any], *, policy_id: str, threshold: float, method: str = "uncalibrated", path: str | None = None, metadata: dict[str, Any] | None = None, model_reference_id: str | None = None) -> None:
    session = environment["app"].state.session_factory()
    session.add(
        DecisionPolicy(
            policy_id=policy_id,
            policy_name=policy_id,
            model_reference_type="training_run",
            model_reference_id=model_reference_id or environment["run_id"],
            model_version="synthetic-1",
            status="active",
            threshold=threshold,
            calibration_method=method,
            calibration_artifact_path=path,
            false_positive_cost=1.0,
            false_negative_cost=10.0,
            risk_configuration_json=json.dumps({"high": "predicted_class == 'pos'", "low": "predicted_class == 'neg'"}),
            metadata_json=json.dumps(metadata or {}),
            created_at=datetime.now(timezone.utc).replace(tzinfo=None),
        )
    )
    session.commit()
    session.close()


def payload(environment: dict[str, Any], values: dict[str, Any] | None = None, **extra: Any) -> dict[str, Any]:
    return {
        "model_run_id": environment["run_id"],
        "features": values or {"sensor_a": 1.0, "sensor_b": 0.0, "sensor_c": 0.0},
        **extra,
    }


def test_sensor_schema_rejects_non_numeric_non_finite_and_extra_fields() -> None:
    with pytest.raises(ValidationError):
        SensorRecord(features={"sensor_a": "1.0", "sensor_b": 0.0, "sensor_c": 0.0})
    with pytest.raises(ValidationError):
        SensorRecord(features={"sensor_a": float("nan"), "sensor_b": 0.0, "sensor_c": 0.0})
    with pytest.raises(ValidationError):
        SensorRecord(features={"sensor_a": float("inf"), "sensor_b": 0.0, "sensor_c": 0.0})
    with pytest.raises(ValidationError):
        PredictionRequest(model_run_id="run", features={"sensor_a": 1.0}, unexpected=True)  # type: ignore[call-arg]


def test_model_reference_is_required_without_an_explicit_default(prediction_environment: dict[str, Any]) -> None:
    response = prediction_environment["client"].post(
        "/api/v1/predictions",
        json={"features": {"sensor_a": 1.0, "sensor_b": 0.0, "sensor_c": 0.0}},
    )
    assert response.status_code == 400
    assert "model_run_id" in response.json()["error"]["message"]


def test_single_prediction_preserves_contract_applies_threshold_and_persists(prediction_environment: dict[str, Any]) -> None:
    client: TestClient = prediction_environment["client"]
    positive = client.post("/api/v1/predictions", json=payload(prediction_environment, vehicle_identifier="truck-1", request_reference="req-1"))
    assert positive.status_code == 201, positive.text
    result = positive.json()
    assert result["predicted_class"] == "pos"
    assert result["failure_probability"] == 0.8
    assert result["applied_threshold"] == 0.5
    assert result["risk_classification"] == "high"
    assert result["model_run_id"] == prediction_environment["run_id"]
    assert result["vehicle_identifier"] == "truck-1"
    assert result["inference_duration_ms"] >= 0
    assert client.get(f"/api/v1/predictions/{result['prediction_id']}").status_code == 200

    negative = client.post("/api/v1/predictions", json=payload(prediction_environment, {"sensor_a": -1.0, "sensor_b": 0.0, "sensor_c": 0.0}))
    assert negative.status_code == 201
    assert negative.json()["predicted_class"] == "neg"
    assert client.get("/api/v1/predictions?predicted_class=pos&vehicle_identifier=truck-1").json()["total"] == 1


def test_feature_names_order_missing_and_unexpected_are_checked(prediction_environment: dict[str, Any]) -> None:
    client: TestClient = prediction_environment["client"]
    reversed_features = {"sensor_c": 0.0, "sensor_a": 1.0, "sensor_b": 0.0}
    ordered = client.post("/api/v1/predictions", json=payload(prediction_environment))
    reordered = client.post("/api/v1/predictions", json=payload(prediction_environment, reversed_features))
    assert ordered.status_code == reordered.status_code == 201
    assert ordered.json()["failure_probability"] == reordered.json()["failure_probability"]

    missing = client.post("/api/v1/predictions", json=payload(prediction_environment, {"sensor_a": 1.0, "sensor_b": 0.0}))
    assert missing.status_code == 400
    assert "sensor_c" in missing.json()["error"]["details"]["missing_features"]
    unexpected = client.post("/api/v1/predictions", json=payload(prediction_environment, {"sensor_a": 1.0, "sensor_b": 0.0, "sensor_c": 0.0, "other": 1.0}))
    assert unexpected.status_code == 400
    assert "other" in unexpected.json()["error"]["details"]["unexpected_features"]
    invalid = client.post("/api/v1/predictions", json=payload(prediction_environment, {"sensor_a": {}, "sensor_b": 0.0, "sensor_c": 0.0}))
    assert invalid.status_code == 422


def test_missing_sensor_value_is_forwarded_as_nan_when_artifact_supports_it(prediction_environment: dict[str, Any]) -> None:
    response = prediction_environment["client"].post(
        "/api/v1/predictions",
        json=payload(prediction_environment, {"sensor_a": None, "sensor_b": 0.0, "sensor_c": 0.0}),
    )
    assert response.status_code == 201, response.text
    assert 0 <= response.json()["failure_probability"] <= 1


def test_non_default_threshold_calibration_and_policy_compatibility(prediction_environment: dict[str, Any]) -> None:
    environment = prediction_environment
    paths = environment["paths"]
    add_policy(environment, policy_id="policy-high-threshold", threshold=0.9)
    response = environment["client"].post(
        "/api/v1/predictions",
        json=payload(environment, decision_policy_id="policy-high-threshold"),
    )
    assert response.status_code == 201
    assert response.json()["predicted_class"] == "neg"
    assert response.json()["applied_threshold"] == 0.9

    calibrator_path = paths.directory.parent.parent / "policies" / "policy-calibrated" / "calibrator.joblib"
    calibrator_path.parent.mkdir(parents=True, exist_ok=True)
    calibrator = IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit([0.2, 0.8], [0.1, 0.6])
    joblib.dump(calibrator, calibrator_path)
    add_policy(
        environment,
        policy_id="policy-calibrated",
        threshold=0.5,
        method="isotonic",
        path=str(calibrator_path),
        metadata={"calibration_input": "probability"},
    )
    calibrated = environment["client"].post(
        "/api/v1/predictions",
        json=payload(environment, decision_policy_id="policy-calibrated"),
    )
    assert calibrated.status_code == 201, calibrated.text
    assert calibrated.json()["calibration_method"] == "isotonic"
    assert calibrated.json()["failure_probability"] == pytest.approx(0.6)

    bad_calibrator_path = paths.directory.parent.parent / "policies" / "policy-bad-calibrator" / "calibrator.joblib"
    bad_calibrator_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(object(), bad_calibrator_path)
    add_policy(
        environment,
        policy_id="policy-bad-calibrator",
        threshold=0.5,
        method="isotonic",
        path=str(bad_calibrator_path),
    )
    bad_calibrator = environment["client"].post(
        "/api/v1/predictions",
        json=payload(environment, decision_policy_id="policy-bad-calibrator"),
    )
    assert bad_calibrator.status_code == 409

    add_policy(environment, policy_id="policy-other-model", threshold=0.5, model_reference_id="run-other")
    incompatible = environment["client"].post(
        "/api/v1/predictions",
        json=payload(environment, decision_policy_id="policy-other-model"),
    )
    assert incompatible.status_code == 409


def test_batch_preserves_order_reports_invalid_records_and_bounds_size(prediction_environment: dict[str, Any]) -> None:
    environment = prediction_environment
    records = [
        {"features": {"sensor_a": 1.0, "sensor_b": 0.0, "sensor_c": 0.0}, "request_reference": "first"},
        {"features": {"sensor_a": 1.0, "sensor_b": 0.0}},
        {"features": {"sensor_a": -1.0, "sensor_b": 0.0, "sensor_c": 0.0}, "request_reference": "third"},
    ]
    response = environment["client"].post(
        "/api/v1/predictions/batch",
        json={"model_run_id": environment["run_id"], "records": records},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert [item["index"] for item in result["items"]] == [0, 1, 2]
    assert result["successful_count"] == 2
    assert result["failed_count"] == 1
    assert result["positive_count"] == 1
    assert result["negative_count"] == 1
    assert result["items"][1]["error"]["code"] == "invalid_request"
    assert result["total_inference_duration_ms"] >= 0
    assert result["average_inference_duration_ms"] >= 0

    oversized = environment["client"].post(
        "/api/v1/predictions/batch",
        json={"model_run_id": environment["run_id"], "records": records + [records[0]]},
    )
    assert oversized.status_code == 413


def test_history_filter_pagination_and_unknown_id(prediction_environment: dict[str, Any]) -> None:
    environment = prediction_environment
    client: TestClient = environment["client"]
    for index in range(3):
        response = client.post(
            "/api/v1/predictions",
            json=payload(environment, {"sensor_a": 1.0 if index != 1 else -1.0, "sensor_b": 0.0, "sensor_c": 0.0}, vehicle_identifier=f"truck-{index}"),
        )
        assert response.status_code == 201
    page = client.get("/api/v1/predictions?page=1&page_size=2")
    assert page.status_code == 200
    assert page.json()["total"] == 3
    assert len(page.json()["items"]) == 2
    assert client.get("/api/v1/predictions?vehicle_identifier=truck-1&predicted_class=neg").json()["total"] == 1
    unknown = client.get("/api/v1/predictions/pred-does-not-exist")
    assert unknown.status_code == 404
    assert "traceback" not in unknown.text.lower()


def test_model_cache_invalidates_and_arbitrary_registry_paths_are_rejected(prediction_environment: dict[str, Any]) -> None:
    environment = prediction_environment
    session = environment["app"].state.session_factory()
    service = InferenceService(environment["settings"], session, environment["app"].state.inference_cache)
    reference = PredictionReference(model_run_id=environment["run_id"])
    first = service.resolve_model(reference)
    second = service.resolve_model(reference)
    assert first is second
    assert environment["app"].state.inference_cache.sizes() == (1, 0)
    environment["app"].state.inference_cache.invalidate_model("training_run", environment["run_id"])
    assert service.resolve_model(reference) is not first

    run = session.get(ModelTrainingRun, environment["run_id"])
    assert run is not None
    run.model_artifact_path = str(environment["settings"].model_artifact_dir / "outside.joblib")
    session.commit()
    with pytest.raises(ArtifactCompatibilityError):
        service.resolve_model(reference)
    session.close()


def test_incompatible_preprocessor_metadata_is_rejected(prediction_environment: dict[str, Any]) -> None:
    environment = prediction_environment
    metadata = json.loads(environment["paths"].metadata.read_text(encoding="utf-8"))
    metadata["preprocessing_configuration"]["feature_names_after"] = FEATURES[:2]
    environment["paths"].metadata.write_text(json.dumps(metadata), encoding="utf-8")
    response = environment["client"].post("/api/v1/predictions", json=payload(environment))
    assert response.status_code == 409
    assert "feature" in response.json()["error"]["message"].lower()


def test_policy_registration_uses_trusted_phase5_artifact_and_exposes_metadata(prediction_environment: dict[str, Any]) -> None:
    environment = prediction_environment
    paths = phase5_artifact_paths(environment["settings"].report_storage_dir, environment["run_id"])
    reference = Phase5Reference(
        reference_id=environment["run_id"],
        reference_type="training_run",
        model_name="logistic_regression",
        model_version="synthetic-1",
        dataset_id="dataset-synthetic",
        dataset_fingerprint="synthetic-fingerprint",
        validation_ratio=0.2,
        random_seed=42,
        validation_records=1,
        split_identifier="synthetic",
    )
    row = DecisionPolicyRow(
        policy_name="uncalibrated_cost_optimal",
        calibration_method="uncalibrated",
        threshold_source="cost_optimal",
        decision_threshold=0.9,
        pr_auc=0.8,
        roc_auc=0.9,
        precision=0.8,
        recall=0.8,
        f1_score=0.8,
        specificity=0.8,
        true_negative=8,
        false_positive=2,
        false_negative=2,
        true_positive=8,
        total_business_cost=4.0,
        average_business_cost=0.2,
        brier_score=0.1,
        log_loss=0.2,
        calibration_status="completed",
    )
    comparison = DecisionPolicyComparisonResponse(
        reference=reference,
        false_positive_cost=1.0,
        false_negative_cost=10.0,
        configuration={},
        rows=[row],
        included_policies=[row.policy_name],
        validation_selection_note="synthetic fixture",
        artifacts=Phase5ArtifactReferences(directory_key=f"phase5/{environment['run_id']}"),
    )
    paths.directory.mkdir(parents=True, exist_ok=True)
    paths.decision_policies.write_text(json.dumps(comparison.model_dump(mode="json")), encoding="utf-8")
    response = environment["client"].post(
        "/api/v1/predictions/policies",
        json={"model_run_id": environment["run_id"], "policy_name": row.policy_name},
    )
    assert response.status_code == 201, response.text
    assert response.json()["policy_name"] == row.policy_name
    listed = environment["client"].get("/api/v1/predictions/policies").json()
    assert listed["total"] == 1
    assert listed["items"][0]["policy_name"] == row.policy_name


def test_missing_and_corrupt_artifacts_fail_safely(prediction_environment: dict[str, Any]) -> None:
    environment = prediction_environment
    environment["paths"].model.unlink()
    missing = environment["client"].post("/api/v1/predictions", json=payload(environment))
    assert missing.status_code == 503
    assert "joblib" not in missing.text.lower()

    environment["paths"].model.write_bytes(b"not-a-joblib")
    corrupt = environment["client"].post("/api/v1/predictions", json=payload(environment))
    assert corrupt.status_code == 503
    assert "traceback" not in corrupt.text.lower()
