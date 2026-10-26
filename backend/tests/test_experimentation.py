"""Synthetic Phase 4 experimentation and comparison tests."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
import pandas as pd
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.database.base import Base
from app.main import create_app
from app.services.experimentation.service import ExperimentService
from app.schemas.experiments import ExperimentRequest


def synthetic_csv(rows: int = 60) -> str:
    values = ["class,a,b,c"]
    for index in range(rows):
        label = "pos" if index % 6 == 0 else "neg"
        values.append(f"{label},{index / 10},{index % 5},{'' if index % 11 == 0 else index * 0.2}")
    return "\n".join(values) + "\n"


@pytest.fixture
def experiment_client(test_settings: Settings) -> Iterator[TestClient]:
    test_settings.expected_feature_count = 3
    test_settings.raw_dataset_dir.mkdir(parents=True, exist_ok=True)
    (test_settings.raw_dataset_dir / test_settings.training_dataset_filename).write_text(synthetic_csv(), encoding="utf-8")
    (test_settings.raw_dataset_dir / test_settings.official_test_dataset_filename).write_text(synthetic_csv().replace(",0.2", ",100.2"), encoding="utf-8")
    application = create_app(test_settings)
    with TestClient(application) as client:
        Base.metadata.create_all(application.state.engine)
        yield client


def training_dataset_id(client: TestClient) -> str:
    datasets = client.get("/api/v1/datasets").json()["items"]
    return next(item["dataset_id"] for item in datasets if item["dataset_type"] == "training")


def complete_experiment(client: TestClient, payload: dict[str, Any]) -> dict[str, Any]:
    response = client.post("/api/v1/experiments", json=payload)
    assert response.status_code == 202, response.text
    experiment_id = response.json()["experiment_id"]
    detail = client.get(f"/api/v1/experiments/{experiment_id}")
    assert detail.status_code == 200
    result = detail.json()
    assert result["experiment_id"] == experiment_id
    return result


def test_smote_is_training_only_and_validation_distribution_is_preserved(experiment_client: TestClient) -> None:
    result = complete_experiment(
        experiment_client,
        {
            "dataset_id": training_dataset_id(experiment_client),
            "model_name": "random_forest",
            "imbalance_strategy": "smote",
            "preprocessing_strategy": "median",
            "random_seed": 17,
            "hyperparameters": {"n_estimators": 10, "n_jobs": 1},
        },
    )

    assert result["status"] == "completed", result
    assert result["validation_distribution_preserved"] is True
    assert result["validation_class_counts"] == {"neg": 10, "pos": 2}
    assert result["configuration"]["imbalance_strategy"] == "smote"
    assert result["configuration"]["resampling_scope"] == "training split only"
    assert "official APS test dataset" in result["test_isolation_note"]
    assert Path(result["artifacts"]["pipeline_artifact_path"]).is_file()
    assert Path(result["artifacts"]["curves_artifact_path"]).is_file()
    assert Path(result["artifacts"]["feature_importance_artifact_path"]).is_file()
    assert result["curves"]["precision_recall"]["precision"]
    assert result["feature_importance"]


def test_hyperparameter_search_uses_pr_auc_and_records_results(experiment_client: TestClient) -> None:
    result = complete_experiment(
        experiment_client,
        {
            "dataset_id": training_dataset_id(experiment_client),
            "model_name": "logistic_regression",
            "imbalance_strategy": "class_weight",
            "preprocessing_strategy": "mean",
            "optimize_hyperparameters": True,
            "search_budget": 2,
            "cv_folds": 2,
            "search_n_jobs": 1,
            "random_seed": 21,
            "hyperparameters": {"max_iter": 200},
        },
    )

    assert result["status"] == "completed", result
    assert result["metrics"]["primary_metric"] == "pr_auc"
    assert len(result["search_results"]) == 2
    assert result["configuration"]["cv_scope"] == "training split only"
    assert result["configuration"]["fit_scope"] == "training split only"


def test_catboost_hyperparameter_search_uses_manual_clone_safe_path(experiment_client: TestClient) -> None:
    result = complete_experiment(
        experiment_client,
        {
            "dataset_id": training_dataset_id(experiment_client),
            "model_name": "catboost",
            "imbalance_strategy": "class_weight",
            "preprocessing_strategy": "native",
            "optimize_hyperparameters": True,
            "search_budget": 1,
            "cv_folds": 2,
            "search_n_jobs": 1,
            "random_seed": 31,
            "hyperparameters": {"iterations": 10, "depth": 3, "thread_count": 1},
        },
    )

    assert result["status"] == "completed", result
    assert result["search_results"][0]["rank"] == 1
    assert result["metrics"]["pr_auc"] is not None


def test_comparison_and_experiment_subresources_work(experiment_client: TestClient) -> None:
    first = complete_experiment(
        experiment_client,
        {
            "dataset_id": training_dataset_id(experiment_client),
            "model_name": "logistic_regression",
            "imbalance_strategy": "original",
            "hyperparameters": {"max_iter": 150},
        },
    )
    second = complete_experiment(
        experiment_client,
        {
            "dataset_id": training_dataset_id(experiment_client),
            "model_name": "random_forest",
            "imbalance_strategy": "class_weight",
            "hyperparameters": {"n_estimators": 10, "n_jobs": 1},
        },
    )
    comparison = experiment_client.post(
        "/api/v1/experiments/compare",
        json={"experiment_ids": [first["experiment_id"], second["experiment_id"]]},
    )
    assert comparison.status_code == 200
    assert comparison.json()["primary_metric"] == "pr_auc"
    assert len(comparison.json()["metric_rows"]) == 2
    first_detail = experiment_client.get(f"/api/v1/experiments/{first['experiment_id']}").json()
    second_detail = experiment_client.get(f"/api/v1/experiments/{second['experiment_id']}").json()
    assert first_detail["artifacts"]["artifact_directory"] != second_detail["artifacts"]["artifact_directory"]
    assert experiment_client.get(f"/api/v1/experiments/{first['experiment_id']}/curves").status_code == 200
    assert experiment_client.get(f"/api/v1/experiments/{first['experiment_id']}/feature-importance").status_code == 200
    assert experiment_client.get(f"/api/v1/experiments/{first['experiment_id']}/configuration").status_code == 200
    assert experiment_client.get("/api/v1/experiments?page=1&page_size=10").json()["total"] == 2


def test_batch_and_compatibility_validation(experiment_client: TestClient) -> None:
    batch = experiment_client.post(
        "/api/v1/experiments/batch",
        json={
            "dataset_id": training_dataset_id(experiment_client),
            "model_names": ["logistic_regression", "random_forest"],
            "imbalance_strategies": ["original"],
            "hyperparameters_by_model": {
                "logistic_regression": {"max_iter": 100},
                "random_forest": {"n_estimators": 10, "n_jobs": 1},
            },
        },
    )
    assert batch.status_code == 202, batch.text
    assert len(batch.json()["experiment_ids"]) == 2

    invalid = experiment_client.post(
        "/api/v1/experiments",
        json={
            "dataset_id": training_dataset_id(experiment_client),
            "model_name": "xgboost",
            "imbalance_strategy": "smote",
            "preprocessing_strategy": "native",
        },
    )
    assert invalid.status_code == 422


def test_experiment_rejects_official_test_dataset(experiment_client: TestClient) -> None:
    testing_id = next(item["dataset_id"] for item in experiment_client.get("/api/v1/datasets").json()["items"] if item["dataset_type"] == "testing")
    response = experiment_client.post(
        "/api/v1/experiments",
        json={"dataset_id": testing_id, "model_name": "random_forest", "hyperparameters": {"n_estimators": 10, "n_jobs": 1}},
    )
    assert response.status_code == 400
    assert "isolated" in response.json()["error"]["message"]


def test_xgboost_class_weight_can_be_resolved_from_a_training_fold() -> None:
    frame = synthetic_csv(rows=60)
    values = [line.split(",") for line in frame.splitlines()[1:]]
    training_frame = pd.DataFrame(values, columns=["class", "a", "b", "c"])
    training_frame["a"] = training_frame["a"].astype(float)
    training_frame["b"] = training_frame["b"].astype(float)
    training_frame["c"] = pd.to_numeric(training_frame["c"], errors="coerce")
    request = ExperimentRequest(
        dataset_id="training-fold",
        model_name="xgboost",
        imbalance_strategy="class_weight",
        preprocessing_strategy="native",
    )
    service = ExperimentService(None, None)  # type: ignore[arg-type]
    fold_frame = training_frame.iloc[:30].copy()
    fold_frame["class"] = ["pos"] * 5 + ["neg"] * 25
    pipeline = service._build_pipeline(request, ["a", "b", "c"], fold_frame, "class")
    assert pipeline.named_steps["model"].scale_pos_weight == 5.0
