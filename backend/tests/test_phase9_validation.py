"""Focused Phase 9 leakage and reproducibility checks."""

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold

from scripts.phase9_validation import (
    SEED,
    build_pipeline,
    imbalance_settings,
    metric_dict,
)


def small_frame() -> pd.DataFrame:
    values = list(range(24))
    return pd.DataFrame(
        {
            "a": [float(value) if value != 2 else np.nan for value in values],
            "b": [float(value + 1) if value != 3 else np.nan for value in values],
            "class": ["pos" if value % 4 == 0 else "neg" for value in values],
        }
    )


def test_phase9_class_weight_is_resolved_from_the_supplied_fitting_frame() -> None:
    frame = small_frame()
    settings = imbalance_settings(frame, "class_weight")
    assert settings.positive_weight == 3.0
    assert settings.scale_pos_weight == 3.0


def test_phase9_smote_pipeline_places_sampler_after_preprocessor() -> None:
    frame = small_frame()
    pipeline = build_pipeline(
        "random_forest",
        "smote",
        "median",
        {"n_estimators": 10, "n_jobs": 1, "max_features": "sqrt"},
        frame,
    )
    assert list(pipeline.named_steps) == ["preprocessor", "sampler", "model"]
    pipeline.fit(frame[["a", "b"]], frame["class"].map({"neg": 0, "pos": 1}).to_numpy())
    assert dict(pipeline.named_steps["sampler"].sampling_strategy_) == {1: 12}


def test_phase9_stratified_cv_folds_are_reproducible() -> None:
    y = np.array([0] * 18 + [1] * 6)
    splitter = StratifiedKFold(n_splits=3, shuffle=True, random_state=SEED)
    first = list(splitter.split(np.zeros((len(y), 1)), y))
    second = list(splitter.split(np.zeros((len(y), 1)), y))
    assert all(np.array_equal(a, c) and np.array_equal(b, d) for (a, b), (c, d) in zip(first, second))
    assert all(set(a).isdisjoint(set(b)) for a, b in first)


def test_phase9_cost_metric_uses_explicit_illustrative_weights() -> None:
    metrics = metric_dict(np.array([0, 0, 1, 1]), np.array([0.1, 0.8, 0.2, 0.9]), 0.5)
    assert metrics["false_positive"] == 1
    assert metrics["false_negative"] == 1
    assert metrics["estimated_business_cost"] == 11.0
