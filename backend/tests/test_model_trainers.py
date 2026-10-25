"""Tests for the Phase 3 model trainer interface and model-specific configs."""

import numpy as np
import pandas as pd
import pytest
from sklearn.metrics import average_precision_score

from app.services.model_training.trainers.base import ImbalanceSettings
from app.services.model_training.trainers.registry import get_trainer, list_trainers


def imbalanced_frame() -> tuple[pd.DataFrame, np.ndarray]:
    rng = np.random.default_rng(23)
    features = rng.normal(size=(30, 4))
    labels = np.array([0] * 24 + [1] * 6)
    features[labels == 1, 0] += 1.5
    return pd.DataFrame(features, columns=["a", "b", "c", "d"]), labels


def test_registry_exposes_all_four_model_families() -> None:
    assert [item["name"] for item in list_trainers()] == ["catboost", "logistic_regression", "random_forest", "xgboost"]


@pytest.mark.parametrize("model_name", ["logistic_regression", "random_forest", "xgboost", "catboost"])
def test_each_trainer_builds_and_fits_with_resolved_imbalance(model_name: str) -> None:
    features, labels = imbalanced_frame()
    trainer = get_trainer(model_name)
    raw_config: dict[str, object] = {}
    if model_name == "random_forest":
        raw_config = {"n_estimators": 10, "n_jobs": 1}
    elif model_name == "xgboost":
        raw_config = {"n_estimators": 10, "n_jobs": 1, "max_depth": 2}
    elif model_name == "catboost":
        raw_config = {"iterations": 10, "thread_count": 1, "depth": 3}
    config = trainer.validate_hyperparameters(raw_config)
    estimator = trainer.build_estimator(
        config,
        imbalance=ImbalanceSettings(mode="balanced", positive_weight=4.0, scale_pos_weight=4.0),
        random_seed=19,
    )
    estimator.fit(features, labels)
    probabilities = estimator.predict_proba(features)[:, 1]
    assert probabilities.shape == (30,)
    assert 0.0 <= average_precision_score(labels, probabilities) <= 1.0


def test_trainer_hyperparameters_reject_unknown_values() -> None:
    trainer = get_trainer("random_forest")
    with pytest.raises(ValueError):
        trainer.validate_hyperparameters({"not_a_parameter": 1})
