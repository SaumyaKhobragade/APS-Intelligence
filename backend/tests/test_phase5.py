"""Phase 5 threshold, calibration, leakage and API contract tests."""

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.database.base import Base
from app.main import create_app
from app.schemas.phase5 import ThresholdOptimizationRequest
from app.services.probability_calibration import fit_calibration_methods
from app.services.threshold_optimization import evaluate_threshold_point, optimize_thresholds


def test_threshold_metrics_and_cost_are_consistent() -> None:
    point = evaluate_threshold_point(
        [0, 0, 1, 1],
        [0.1, 0.8, 0.4, 0.9],
        0.5,
        false_positive_cost=2.0,
        false_negative_cost=5.0,
    )

    assert point.true_negative == 1
    assert point.false_positive == 1
    assert point.false_negative == 1
    assert point.true_positive == 1
    assert point.business_cost == 7.0
    assert point.average_business_cost == 1.75
    assert point.specificity == 0.5
    assert point.false_positive_rate == 0.5
    assert point.false_negative_rate == 0.5


def test_threshold_objectives_and_cost_tie_breaking() -> None:
    y_true = [0, 0, 1, 1]
    probabilities = [0.1, 0.4, 0.6, 0.9]
    minimum_cost_request = ThresholdOptimizationRequest(
        threshold_min=0.4,
        threshold_max=0.6,
        threshold_candidates=3,
        objective="minimum_cost",
        false_positive_cost=1.0,
        false_negative_cost=10.0,
    )
    _, selected = optimize_thresholds(y_true, probabilities, minimum_cost_request, false_positive_cost=1.0, false_negative_cost=10.0)
    assert selected.threshold == 0.5
    assert selected.business_cost == 0.0

    f1_request = minimum_cost_request.model_copy(update={"objective": "maximum_f1"})
    _, f1_selected = optimize_thresholds(y_true, probabilities, f1_request, false_positive_cost=1.0, false_negative_cost=10.0)
    assert f1_selected.threshold == 0.5
    assert f1_selected.f1_score == 1.0

    recall_request = ThresholdOptimizationRequest(
        threshold_min=0.1,
        threshold_max=0.9,
        threshold_candidates=9,
        objective="minimum_recall",
        required_recall=1.0,
    )
    _, recall_selected = optimize_thresholds(y_true, probabilities, recall_request, false_positive_cost=1.0, false_negative_cost=10.0)
    assert recall_selected.threshold == 0.1
    assert recall_selected.recall == 1.0

    precision_request = recall_request.model_copy(update={"objective": "maximum_precision", "required_recall": 0.5})
    _, precision_selected = optimize_thresholds(y_true, probabilities, precision_request, false_positive_cost=1.0, false_negative_cost=10.0)
    assert precision_selected.precision == 1.0
    assert precision_selected.recall >= 0.5

    tie_request = ThresholdOptimizationRequest(
        threshold_min=0.5,
        threshold_max=0.6,
        threshold_candidates=2,
        objective="minimum_cost",
    )
    _, tie_selected = optimize_thresholds([0, 1], [0.4, 0.7], tie_request, false_positive_cost=1.0, false_negative_cost=10.0)
    assert tie_selected.threshold == 0.5


def test_threshold_request_rejects_invalid_grid_and_constraints() -> None:
    with pytest.raises(ValueError):
        ThresholdOptimizationRequest(threshold_min=0.8, threshold_max=0.2)
    with pytest.raises(ValueError):
        ThresholdOptimizationRequest(threshold_candidates=5, threshold_step=0.1)
    with pytest.raises(ValueError):
        ThresholdOptimizationRequest(objective="minimum_recall")
    with pytest.raises(ValueError):
        ThresholdOptimizationRequest(objective="maximum_f1", required_recall=0.8)


def test_calibration_methods_are_training_only_and_serializable() -> None:
    from sklearn.datasets import make_classification
    from sklearn.linear_model import LogisticRegression
    import joblib

    features, labels = make_classification(n_samples=240, n_features=4, weights=[0.8, 0.2], random_state=4)
    estimator = LogisticRegression(max_iter=500).fit(features[:192], labels[:192])
    fits = fit_calibration_methods(
        estimator,
        features[:192],
        labels[:192],
        features[192:],
        labels[192:],
        methods=["uncalibrated", "sigmoid", "isotonic"],
        calibration_ratio=0.25,
        random_seed=42,
        minimum_calibration_records=10,
        minimum_calibration_positives=2,
        minimum_calibration_negatives=2,
        reliability_bins=5,
    )

    assert {fit.result.method for fit in fits} == {"uncalibrated", "sigmoid", "isotonic"}
    assert all(np.all((fit.probabilities >= 0) & (fit.probabilities <= 1)) for fit in fits)
    assert all(fit.result.validation_records == 48 for fit in fits)
    assert all(fit.result.calibration_records == 48 for fit in fits if fit.result.method != "uncalibrated")
    for fit in fits:
        if fit.calibrator is not None:
            path = Path("calibrator-test.joblib")
            joblib.dump(fit.calibrator, path)
            loaded = joblib.load(path)
            assert np.all((loaded.predict_proba(features[192:])[:, 1] >= 0) & (loaded.predict_proba(features[192:])[:, 1] <= 1))
            path.unlink()


def test_calibration_fitting_receives_only_internal_training_records(monkeypatch: pytest.MonkeyPatch) -> None:
    from sklearn.datasets import make_classification
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import train_test_split
    import app.services.probability_calibration as calibration_module

    features, labels = make_classification(n_samples=220, n_features=4, weights=[0.8, 0.2], random_state=7)
    training_x, validation_x, training_y, validation_y = train_test_split(
        features,
        labels,
        test_size=40,
        random_state=11,
        stratify=labels,
    )
    estimator = LogisticRegression(max_iter=500).fit(training_x, training_y)
    captured: dict[str, Any] = {}
    original_calibrator = calibration_module.CalibratedClassifierCV

    class SpyCalibrator:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.inner = original_calibrator(*args, **kwargs)

        def fit(self, calibration_x: Any, calibration_y: Any) -> "SpyCalibrator":
            captured["records"] = len(calibration_y)
            captured["labels"] = np.asarray(calibration_y).copy()
            self.inner.fit(calibration_x, calibration_y)
            return self

        def predict_proba(self, values: Any) -> Any:
            return self.inner.predict_proba(values)

    monkeypatch.setattr(calibration_module, "CalibratedClassifierCV", SpyCalibrator)
    fit_calibration_methods(
        estimator,
        training_x,
        training_y,
        validation_x,
        validation_y,
        methods=["sigmoid"],
        calibration_ratio=0.25,
        random_seed=42,
        minimum_calibration_records=2,
        minimum_calibration_positives=1,
        minimum_calibration_negatives=1,
        reliability_bins=5,
    )
    _, _, _, expected_y = train_test_split(
        training_x,
        training_y,
        test_size=0.25,
        random_state=42,
        stratify=training_y,
    )
    assert captured["records"] == len(expected_y)
    assert np.array_equal(np.sort(captured["labels"]), np.sort(expected_y))
    assert captured["records"] != len(validation_y)


def test_isotonic_insufficient_training_calibration_sample_is_reported() -> None:
    from sklearn.linear_model import LogisticRegression

    features = np.arange(40, dtype=float).reshape(20, 2)
    labels = np.array([0, 1] * 10)
    estimator = LogisticRegression(max_iter=500).fit(features, labels)
    fits = fit_calibration_methods(
        estimator,
        features,
        labels,
        features[:4],
        labels[:4],
        methods=["isotonic"],
        calibration_ratio=0.2,
        random_seed=42,
        minimum_calibration_records=100,
        minimum_calibration_positives=5,
        minimum_calibration_negatives=5,
        reliability_bins=4,
    )
    assert fits[0].result.status == "insufficient_sample"
    assert "skipped" in (fits[0].result.reason or "")


def phase5_csv(rows: int = 240) -> str:
    values = ["class,a,b,c"]
    for index in range(rows):
        label = "pos" if index % 6 == 0 else "neg"
        values.append(f"{label},{index / 10},{index % 5},{'' if index % 11 == 0 else index * 0.2}")
    return "\n".join(values) + "\n"


@pytest.fixture
def phase5_client(test_settings: Settings) -> Iterator[TestClient]:
    test_settings.expected_feature_count = 3
    test_settings.raw_dataset_dir.mkdir(parents=True, exist_ok=True)
    (test_settings.raw_dataset_dir / test_settings.training_dataset_filename).write_text(phase5_csv(), encoding="utf-8")
    (test_settings.raw_dataset_dir / test_settings.official_test_dataset_filename).write_text(phase5_csv().replace(",0.2", ",100.2"), encoding="utf-8")
    application = create_app(test_settings)
    with TestClient(application) as client:
        Base.metadata.create_all(application.state.engine)
        yield client


def _training_dataset_id(client: TestClient) -> str:
    return next(item["dataset_id"] for item in client.get("/api/v1/datasets").json()["items"] if item["dataset_type"] == "training")


def _completed_experiment(client: TestClient) -> str:
    response = client.post(
        "/api/v1/experiments",
        json={
            "dataset_id": _training_dataset_id(client),
            "model_name": "random_forest",
            "imbalance_strategy": "original",
            "hyperparameters": {"n_estimators": 10, "n_jobs": 1},
        },
    )
    assert response.status_code == 202, response.text
    return response.json()["experiment_id"]


def test_phase5_apis_generate_retrieve_and_compare_policies(phase5_client: TestClient, test_settings: Settings) -> None:
    experiment_id = _completed_experiment(phase5_client)
    threshold = phase5_client.post(
        f"/api/v1/thresholds/{experiment_id}/analyze",
        json={"threshold_min": 0.1, "threshold_max": 0.9, "threshold_step": 0.1, "objective": "minimum_cost"},
    )
    assert threshold.status_code == 200, threshold.text
    threshold_payload = threshold.json()
    assert threshold_payload["selected"]["objective"] == "minimum_cost"
    assert threshold_payload["selected"]["total_records"] == 48
    assert len(threshold_payload["candidates"]) == 9
    assert (test_settings.report_storage_dir / "phase5" / experiment_id / "thresholds.json").is_file()
    assert phase5_client.get(f"/api/v1/thresholds/{experiment_id}").status_code == 200
    assert len(phase5_client.get(f"/api/v1/thresholds/{experiment_id}/curve").json()) == 9

    policy_compare = phase5_client.post(
        f"/api/v1/thresholds/{experiment_id}/compare",
        json={"thresholds": [0.25, 0.5, 0.75]},
    )
    assert policy_compare.status_code == 200, policy_compare.text
    assert len(policy_compare.json()["rows"]) == 3

    calibration = phase5_client.post(
        f"/api/v1/calibration/{experiment_id}/compare",
        json={
            "methods": ["uncalibrated", "sigmoid", "isotonic"],
            "calibration_ratio": 0.25,
            "minimum_calibration_records": 10,
            "minimum_calibration_positives": 5,
            "minimum_calibration_negatives": 5,
        },
    )
    assert calibration.status_code == 200, calibration.text
    methods = {item["method"]: item for item in calibration.json()["methods"]}
    assert set(methods) == {"uncalibrated", "sigmoid", "isotonic"}
    assert methods["uncalibrated"]["status"] == "completed"
    assert all(0 <= methods["uncalibrated"][key] <= 1 for key in ("brier_score", "expected_calibration_error"))
    assert phase5_client.get(f"/api/v1/calibration/{experiment_id}/metrics").status_code == 200
    assert phase5_client.get(f"/api/v1/calibration/{experiment_id}/reliability").status_code == 200

    policies = phase5_client.post(
        f"/api/v1/decision-policies/{experiment_id}/compare",
        json={
            "calibration_methods": ["uncalibrated", "sigmoid", "isotonic"],
            "threshold_min": 0.0,
            "threshold_max": 0.9,
            "threshold_step": 0.1,
            "calibration_ratio": 0.25,
            "minimum_calibration_records": 10,
            "minimum_calibration_positives": 5,
            "minimum_calibration_negatives": 5,
            "include_recall_constrained": True,
            "required_recall": 0.5,
        },
    )
    assert policies.status_code == 200, policies.text
    names = {row["policy_name"] for row in policies.json()["rows"]}
    assert "uncalibrated_default_0.5" in names
    assert "uncalibrated_cost_optimal" in names
    assert any("recall_at_least" in name for name in names)
    assert phase5_client.get(f"/api/v1/decision-policies/{experiment_id}").status_code == 200


def test_phase5_rejects_unknown_and_missing_artifacts_and_never_loads_official_test(monkeypatch: pytest.MonkeyPatch, phase5_client: TestClient, test_settings: Settings) -> None:
    experiment_id = _completed_experiment(phase5_client)
    assert phase5_client.get("/api/v1/thresholds/exp-does-not-exist").status_code == 404

    from app.services.dataset.service import DatasetService

    original_read_path = DatasetService._read_path

    def reject_testing(self: DatasetService, path: Path, dataset_type: str) -> Any:
        assert dataset_type != "testing", "Phase 5 attempted to load the official test dataset"
        return original_read_path(self, path, dataset_type)  # type: ignore[arg-type]

    monkeypatch.setattr(DatasetService, "_read_path", reject_testing)
    response = phase5_client.post(
        f"/api/v1/thresholds/{experiment_id}/analyze",
        json={"threshold_min": 0.1, "threshold_max": 0.9, "threshold_candidates": 5},
    )
    assert response.status_code == 200, response.text

    pipeline_path = test_settings.model_artifact_dir / "experiments" / experiment_id / "pipeline.joblib"
    pipeline_path.unlink()
    missing = phase5_client.post(
        f"/api/v1/thresholds/{experiment_id}/analyze",
        json={"threshold_min": 0.1, "threshold_max": 0.9, "threshold_candidates": 5},
    )
    assert missing.status_code == 400
    assert "missing" in missing.json()["error"]["message"].lower()


def test_phase5_api_validates_invalid_costs_and_recall_constraints(phase5_client: TestClient) -> None:
    experiment_id = _completed_experiment(phase5_client)
    invalid_cost = phase5_client.post(
        f"/api/v1/thresholds/{experiment_id}/analyze",
        json={"false_positive_cost": -1.0},
    )
    assert invalid_cost.status_code == 422
    invalid_recall = phase5_client.post(
        f"/api/v1/decision-policies/{experiment_id}/compare",
        json={"include_recall_constrained": True},
    )
    assert invalid_recall.status_code == 422
