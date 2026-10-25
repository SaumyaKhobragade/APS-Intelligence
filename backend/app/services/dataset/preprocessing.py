"""Serializable, model-aware preprocessing pipelines."""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app.core.exceptions import InvalidRequestError


Strategy = Literal["median", "mean", "constant", "missingness_indicators", "native"]
ModelKind = Literal["logistic_regression", "random_forest", "xgboost", "catboost"]


@dataclass(frozen=True)
class FittedPreprocessor:
    pipeline: Pipeline
    feature_names_before: list[str]
    feature_names_after: list[str]


def build_preprocessing_pipeline(
    feature_names: list[str],
    *,
    strategy: Strategy,
    model_kind: ModelKind,
    constant_value: float = 0.0,
    add_missingness_indicators: bool = False,
) -> Pipeline:
    if strategy == "native" and model_kind not in {"xgboost", "catboost"}:
        raise InvalidRequestError("Native missing-value handling is reserved for XGBoost and CatBoost configurations.")
    steps: list[tuple[str, object]] = []
    if strategy != "native":
        imputer_strategy = "constant" if strategy == "constant" else "median" if strategy == "missingness_indicators" else strategy
        imputer_kwargs: dict[str, object] = {"strategy": imputer_strategy, "keep_empty_features": True}
        if strategy == "constant":
            imputer_kwargs["fill_value"] = constant_value
        if strategy == "missingness_indicators" or add_missingness_indicators:
            imputer_kwargs["add_indicator"] = True
        steps.append(("imputer", SimpleImputer(**imputer_kwargs)))
    if model_kind == "logistic_regression":
        steps.append(("scaler", StandardScaler()))
    if strategy == "native":
        transformer: object = ColumnTransformer(
            transformers=[("numeric", "passthrough", feature_names)],
            remainder="drop",
            verbose_feature_names_out=False,
        )
    else:
        transformer = ColumnTransformer(
            transformers=[("numeric", Pipeline(steps=steps), feature_names)],
            remainder="drop",
            verbose_feature_names_out=False,
        )
    return Pipeline(steps=[("features", transformer)])


def fit_preprocessing_pipeline(
    training_frame: pd.DataFrame,
    feature_names: list[str],
    *,
    strategy: Strategy,
    model_kind: ModelKind,
    constant_value: float = 0.0,
    add_missingness_indicators: bool = False,
) -> FittedPreprocessor:
    pipeline = build_preprocessing_pipeline(
        feature_names,
        strategy=strategy,
        model_kind=model_kind,
        constant_value=constant_value,
        add_missingness_indicators=add_missingness_indicators,
    )
    pipeline.fit(training_frame[feature_names])
    transformed_names = [str(name) for name in pipeline.named_steps["features"].get_feature_names_out()]
    return FittedPreprocessor(pipeline, feature_names, transformed_names)


def save_preprocessor(fitted: FittedPreprocessor, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(fitted.pipeline, path)
    return path
