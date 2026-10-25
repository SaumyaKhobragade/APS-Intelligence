"""Synthetic end-to-end tests for training orchestration and artifact persistence."""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.database.base import Base
from app.main import create_app


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
    assert training_client.get(f"/api/v1/models/runs/{run_id}/metrics").status_code == 200


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
