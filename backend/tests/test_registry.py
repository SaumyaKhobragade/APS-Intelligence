"""Phase 7 registry, lineage, checksum and reproducibility tests.

The fixtures are explicitly synthetic metadata only. They are never promoted
as production-approved APS models.
"""

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
import pytest

from app.core.config import Settings
from app.database.base import Base
from app.main import create_app
from app.models.dataset import DatasetMetadata
from app.models.prediction import DecisionPolicy, PredictionRecord
from app.models.registry import ModelPromotion
from app.models.training import ModelTrainingRun
from app.services.model_training.artifacts import training_artifact_paths
from app.services.registry import ModelRegistryService
from app.services.reproducibility import configuration_fingerprint


def now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@pytest.fixture
def registry_environment(tmp_path: Path) -> dict[str, Any]:
    settings = Settings(
        environment="test",
        persistent_storage_dir=tmp_path / "data",
        database_url=f"sqlite:///{tmp_path / 'registry.db'}",
        dataset_storage_dir=tmp_path / "datasets",
        model_artifact_dir=tmp_path / "artifacts" / "models",
        report_storage_dir=tmp_path / "artifacts" / "reports",
        expected_feature_count=3,
        allowed_cors_origins=[],
        log_level="WARNING",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        Base.metadata.create_all(app.state.engine)
        session = app.state.session_factory()
        dataset = DatasetMetadata(
            dataset_id="dataset-registry",
            dataset_name="Synthetic registry fixture",
            dataset_type="training",
            source_file_name="missing-synthetic.csv",
            source_path=str(tmp_path / "missing-synthetic.csv"),
            fingerprint="dataset-fingerprint",
            file_size_bytes=10,
            record_count=10,
            feature_count=3,
            target_column="class",
            status="ready",
            imported_at=now(),
        )
        session.add(dataset)
        run_id = "run-registry-fixture"
        paths = training_artifact_paths(settings.model_artifact_dir, run_id)
        paths.directory.mkdir(parents=True, exist_ok=True)
        paths.model.write_bytes(b"synthetic-model")
        paths.preprocessor.write_bytes(b"synthetic-preprocessor")
        paths.metadata.write_text(json.dumps({"synthetic": True}), encoding="utf-8")
        paths.split_metadata.write_text(json.dumps({"split": "synthetic"}), encoding="utf-8")
        run = ModelTrainingRun(
            run_id=run_id,
            model_name="logistic_regression",
            model_version="synthetic-registry-1",
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
            hyperparameters_json=json.dumps({"C": 1.0}),
            class_imbalance_configuration_json=json.dumps({"mode": "balanced"}),
            feature_names_before_json=json.dumps(["a", "b", "c"]),
            feature_names_after_json=json.dumps(["a", "b", "c"]),
            training_records=8,
            validation_records=2,
            metrics_json=json.dumps({"pr_auc": 0.5}),
            created_at=now(),
            completed_at=now(),
            configuration_fingerprint=configuration_fingerprint({"dataset": dataset.fingerprint, "model": "synthetic-registry-1"}),
            split_identifier="synthetic-split",
            library_versions_json=json.dumps({"python": "recorded"}),
            artifact_checksums_json="{}",
            artifact_integrity_status="pending",
            lifecycle_metadata_json=json.dumps({"synthetic_fixture": True}),
        )
        session.add(run)
        session.add(
            DecisionPolicy(
                policy_id="policy-registry-fixture",
                policy_name="synthetic-policy",
                policy_version="1",
                model_reference_type="training_run",
                model_reference_id=run_id,
                model_version=run.model_version,
                status="active",
                threshold=0.5,
                calibration_method="uncalibrated",
                false_positive_cost=1.0,
                false_negative_cost=10.0,
                risk_configuration_json="{}",
                metadata_json="{}",
                artifact_integrity_status="verified",
                created_at=now(),
            )
        )
        session.add(
            PredictionRecord(
                prediction_id="pred-registry-fixture",
                model_reference_type="training_run",
                model_reference_id=run_id,
                model_version=run.model_version,
                decision_policy_id="policy-registry-fixture",
                decision_policy_version="1",
                predicted_class="neg",
                raw_failure_probability=0.1,
                failure_probability=0.1,
                applied_threshold=0.5,
                calibration_method="uncalibrated",
                risk_classification="low",
                calibration_artifact_reference=None,
                calibration_artifact_checksum=None,
                model_configuration_fingerprint=run.configuration_fingerprint,
                artifact_checksums_json="{}",
                prediction_timestamp=now(),
                inference_duration_ms=1.0,
                warnings_json="[]",
                metadata_json="{}",
            )
        )
        session.commit()
        session.close()
        yield {"client": client, "app": app, "settings": settings, "run_id": run_id, "paths": paths}


def test_registry_listing_lineage_and_version_history(registry_environment: dict[str, Any]) -> None:
    client: TestClient = registry_environment["client"]
    listing = client.get("/api/v1/models/registry?page=1&page_size=10")
    assert listing.status_code == 200, listing.text
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["prediction_count"] == 1
    detail = client.get(f"/api/v1/models/registry/training_run/{registry_environment['run_id']}")
    assert detail.status_code == 200
    assert detail.json()["configuration_fingerprint"]
    assert "artifact_directory" not in detail.text
    lineage = client.get(f"/api/v1/models/registry/training_run/{registry_environment['run_id']}/lineage")
    assert lineage.status_code == 200
    assert lineage.json()["dataset"]["fingerprint"] == "dataset-fingerprint"
    assert lineage.json()["prediction_count"] == 1
    versions = client.get("/api/v1/models/registry/versions/logistic_regression")
    assert versions.status_code == 200
    assert versions.json()["total"] == 1


def test_artifact_inventory_checksum_and_modification_detection(registry_environment: dict[str, Any]) -> None:
    client: TestClient = registry_environment["client"]
    path = f"/api/v1/models/registry/training_run/{registry_environment['run_id']}/artifacts"
    with registry_environment["app"].state.session_factory() as session:
        ModelRegistryService(registry_environment["settings"], session).persist_artifact_verification(
            "training_run", registry_environment["run_id"]
        )
    verified = client.get(path)
    assert verified.status_code == 200
    assert verified.json()["all_verified"] is True
    registry_environment["paths"].model.write_bytes(b"modified-model")
    modified = client.get(path)
    assert modified.status_code == 200
    assert modified.json()["all_verified"] is False
    assert any(item["status"] == "mismatch" for item in modified.json()["items"])


def test_artifact_verification_get_is_read_only(registry_environment: dict[str, Any]) -> None:
    application = registry_environment["app"]
    run_id = registry_environment["run_id"]
    before_session = application.state.session_factory()
    before = before_session.get(ModelTrainingRun, run_id)
    assert before is not None
    before_state = (before.artifact_checksums_json, before.artifact_integrity_status)
    before_session.close()

    response = registry_environment["client"].get(f"/api/v1/models/registry/training_run/{run_id}/artifacts")
    assert response.status_code == 200, response.text

    after_session = application.state.session_factory()
    after = after_session.get(ModelTrainingRun, run_id)
    assert after is not None
    assert (after.artifact_checksums_json, after.artifact_integrity_status) == before_state
    after_session.close()


def test_reproducibility_reports_missing_source_and_dependency_mismatch(registry_environment: dict[str, Any]) -> None:
    response = registry_environment["client"].get(
        f"/api/v1/models/registry/training_run/{registry_environment['run_id']}/reproducibility"
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["reproducible"] is False
    assert payload["source_data_available"] is False
    assert "source_data" in payload["missing_prerequisites"]
    assert "python" in payload["dependency_mismatches"]
    assert payload["test_dataset_loaded"] is False


def test_lifecycle_rejects_invalid_and_synthetic_promotion(registry_environment: dict[str, Any]) -> None:
    client: TestClient = registry_environment["client"]
    base = f"/api/v1/models/registry/training_run/{registry_environment['run_id']}"
    invalid = client.post(f"{base}/lifecycle", json={"target_status": "trained"})
    assert invalid.status_code == 400
    eligible = client.post(
        f"{base}/lifecycle",
        json={
            "target_status": "eligible",
            "genuine_aps_evaluation_completed": True,
            "evaluation_evidence": "synthetic fixture must not be promoted",
        },
    )
    assert eligible.status_code == 200
    promotion = client.post(
        f"{base}/promote",
        json={
            "decision_policy_id": "policy-registry-fixture",
            "confirm_genuine_aps_evaluation": True,
            "evaluation_evidence": "synthetic fixture",
        },
    )
    assert promotion.status_code == 400
    assert "synthetic" in promotion.json()["error"]["message"].lower()


def test_promotion_history_is_reversible_without_promoting_a_fixture(registry_environment: dict[str, Any]) -> None:
    app = registry_environment["app"]
    session = app.state.session_factory()
    previous = ModelPromotion(
        promotion_id="promotion-previous",
        model_reference_type="training_run",
        model_reference_id=registry_environment["run_id"],
        model_version="synthetic-registry-0",
        decision_policy_id="policy-registry-fixture",
        decision_policy_version="1",
        status="superseded",
        genuine_evaluation_confirmed=True,
        evaluation_evidence="historical audit record",
        promoted_at=now(),
        superseded_at=now(),
    )
    current = ModelPromotion(
        promotion_id="promotion-current",
        model_reference_type="training_run",
        model_reference_id=registry_environment["run_id"],
        model_version="synthetic-registry-1",
        decision_policy_id="policy-registry-fixture",
        decision_policy_version="1",
        status="active",
        previous_promotion_id=previous.promotion_id,
        genuine_evaluation_confirmed=True,
        evaluation_evidence="historical audit record",
        promoted_at=now(),
    )
    session.add_all([previous, current])
    session.commit()
    session.close()
    response = registry_environment["client"].post("/api/v1/models/promotions/promotion-current/revert")
    assert response.status_code == 200
    assert response.json()["status"] == "reverted"
    session = app.state.session_factory()
    assert session.get(ModelPromotion, "promotion-previous").status == "active"
    session.close()


def test_configuration_fingerprint_is_stable_and_sensitive_to_meaningful_changes() -> None:
    base = {"model": "random_forest", "seed": 42, "features": ["a", "b"]}
    reordered = {"features": ["a", "b"], "seed": 42, "model": "random_forest"}
    changed = {**base, "seed": 43}
    assert configuration_fingerprint(base) == configuration_fingerprint(reordered)
    assert configuration_fingerprint(base) != configuration_fingerprint(changed)
