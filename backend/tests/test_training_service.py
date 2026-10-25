"""Synthetic end-to-end tests for training orchestration and artifact persistence."""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.database.base import Base
from app.main import create_app
from app.services.model_training.artifacts import load_joblib


def training_csv(rows: int = 30) -> str:
    values = ["class,a,b,c"]
    for index in range(rows):
        label = "pos" if index % 5 == 0 else "neg"
        values.append(f"{label},{index},{index % 3},{'' if index % 7 == 0 else index * 0.5}")
    return "\n".join(values) + "\n"


@pytest.fixture
def training_client(test_settings: Settings) -> Iterator[TestClient]:
    test_settings.expected_feature_count = 3
    test_settings.raw_dataset_dir.mkdir(parents=True, exist_ok=True)
    (test_settings.raw_dataset_dir / test_settings.training_dataset_filename).write_text(training_csv(), encoding="utf-8")
    # The test file deliberately differs from training, but is never needed by
    # the training path and remains an isolated configured source.
    (test_settings.raw_dataset_dir / test_settings.official_test_dataset_filename).write_text(training_csv().replace(",0.5", ",99.5"), encoding="utf-8")
    application = create_app(test_settings)
    with TestClient(application) as client:
        Base.metadata.create_all(application.state.engine)
        yield client


def wait_for_completion(client: TestClient, run_id: str) -> dict[str, object]:
    for _ in range(100):
        response = client.get(f"/api/v1/models/runs/{run_id}/status")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in {"completed", "failed"}:
            return payload
    pytest.fail("Training run did not complete within the test polling window")
    return {}


def test_training_api_persists_run_metrics_and_artifacts(training_client: TestClient) -> None:
    datasets = training_client.get("/api/v1/datasets").json()["items"]
    training_dataset = next(item for item in datasets if item["dataset_type"] == "training")
    request = {
        "dataset_id": training_dataset["dataset_id"],
        "model_name": "logistic_regression",
        "preprocessing_strategy": "median",
        "validation_ratio": 0.2,
        "random_seed": 13,
        "threshold": 0.5,
        "false_positive_cost": 2.0,
        "false_negative_cost": 8.0,
        "class_imbalance": {"mode": "balanced"},
        "hyperparameters": {"max_iter": 200},
    }
    response = training_client.post("/api/v1/models/train", json=request)
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]
    status = wait_for_completion(training_client, run_id)
    assert status["status"] == "completed", status

    detail = training_client.get(f"/api/v1/models/runs/{run_id}")
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["metrics"]["primary_metric"] == "pr_auc"
    assert payload["metrics"]["confusion_matrix"]["matrix"]
    assert payload["class_imbalance_configuration"]["resampling"] == "none"
    assert "official APS test dataset" in payload["test_isolation_note"]
    assert Path(payload["artifacts"]["model_artifact_path"]).is_file()
    assert Path(payload["artifacts"]["preprocessor_artifact_path"]).is_file()
    assert Path(payload["artifacts"]["metadata_artifact_path"]).is_file()
    model = load_joblib(Path(payload["artifacts"]["model_artifact_path"]))
    preprocessor = load_joblib(Path(payload["artifacts"]["preprocessor_artifact_path"]))
    assert model.predict_proba(preprocessor.transform(pd.DataFrame({"a": [2], "b": [1], "c": [0.5]}))).shape == (1, 2)
    assert training_client.get(f"/api/v1/models/runs/{run_id}/metrics").status_code == 200
    runs = training_client.get("/api/v1/models/runs?model_name=logistic_regression&page=1&page_size=10")
    assert runs.status_code == 200
    assert runs.json()["total"] == 1


def test_training_api_rejects_official_test_dataset(training_client: TestClient) -> None:
    testing_dataset = next(item for item in training_client.get("/api/v1/datasets").json()["items"] if item["dataset_type"] == "testing")
    response = training_client.post(
        "/api/v1/models/train",
        json={"dataset_id": testing_dataset["dataset_id"], "model_name": "random_forest", "hyperparameters": {"n_estimators": 10, "n_jobs": 1}},
    )
    assert response.status_code == 400
    assert "isolated" in response.json()["error"]["message"]


def test_model_catalog_and_versions_are_available(training_client: TestClient) -> None:
    catalog = training_client.get("/api/v1/models")
    assert catalog.status_code == 200
    assert {item["model_name"] for item in catalog.json()["items"]} == {"logistic_regression", "random_forest", "xgboost", "catboost"}
    versions = training_client.get("/api/v1/models/versions/xgboost")
    assert versions.status_code == 200
    assert versions.json()["versions"]


def test_training_request_validation_and_missing_run_errors(training_client: TestClient) -> None:
    invalid = training_client.post(
        "/api/v1/models/train",
        json={
            "dataset_id": "training-does-not-exist",
            "model_name": "logistic_regression",
            "threshold": 1.5,
        },
    )
    assert invalid.status_code == 422
    assert training_client.get("/api/v1/models/runs/run-missing/status").status_code == 404

    invalid_imbalance = training_client.post(
        "/api/v1/models/train",
        json={
            "dataset_id": "training-does-not-exist",
            "model_name": "logistic_regression",
            "class_imbalance": {"mode": "balanced", "scale_pos_weight": 2.0},
        },
    )
    assert invalid_imbalance.status_code == 422


@pytest.mark.parametrize(
    ("model_name", "hyperparameters"),
    [
        ("logistic_regression", {"max_iter": 200}),
        ("random_forest", {"n_estimators": 10, "n_jobs": 1}),
        ("xgboost", {"n_estimators": 10, "max_depth": 2, "n_jobs": 1}),
        ("catboost", {"iterations": 10, "depth": 3, "thread_count": 1}),
    ],
)
def test_all_model_families_complete_a_synthetic_training_run(
    training_client: TestClient,
    model_name: str,
    hyperparameters: dict[str, object],
) -> None:
    datasets = training_client.get("/api/v1/datasets").json()["items"]
    training_dataset = next(item for item in datasets if item["dataset_type"] == "training")
    response = training_client.post(
        "/api/v1/models/train",
        json={
            "dataset_id": training_dataset["dataset_id"],
            "model_name": model_name,
            "validation_ratio": 0.2,
            "random_seed": 29,
            "hyperparameters": hyperparameters,
        },
    )
    assert response.status_code == 202, response.text
    run_id = response.json()["run_id"]
    status = wait_for_completion(training_client, run_id)
    assert status["status"] == "completed", status
    metrics = training_client.get(f"/api/v1/models/runs/{run_id}/metrics")
    assert metrics.status_code == 200
    assert metrics.json()["primary_metric"] == "pr_auc"
