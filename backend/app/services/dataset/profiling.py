"""Actual dataset quality and feature profiling calculations."""

from datetime import datetime, timezone
from typing import Any, cast

import numpy as np
import pandas as pd

from app.schemas.datasets import (
    ClassDistributionResponse,
    DataQualityResponse,
    DatasetProfileResponse,
    DatasetSummary,
    FeatureCorrelation,
    FeatureDetailResponse,
    FeaturePageResponse,
    FeatureSummary,
    MissingValueSummary,
    MissingValuesResponse,
)
from app.services.dataset.ingestion import IngestedDataset


EXCESSIVE_MISSINGNESS_THRESHOLD = 0.5


def _numeric_series(frame: pd.DataFrame, feature_name: str) -> pd.Series:
    """Return a numeric Series with a stable type for pandas and type checkers."""

    return cast(pd.Series, pd.to_numeric(frame[feature_name], errors="coerce"))


def _finite_float(value: Any) -> float | None:
    if value is None or bool(pd.isna(value)) or not np.isfinite(float(value)):
        return None
    return float(value)


def feature_summary(frame: pd.DataFrame, feature_name: str) -> FeatureSummary:
    numeric = _numeric_series(frame, feature_name)
    missing_count = int(pd.isna(numeric).sum())
    non_missing_count = int(pd.notna(numeric).sum())
    record_count = len(frame)
    unique_count = int(numeric.nunique(dropna=True))
    variance = _finite_float(numeric.var(ddof=0))
    return FeatureSummary(
        feature_name=feature_name,
        data_type="numerical" if pd.api.types.is_numeric_dtype(numeric) else "categorical",
        missing_count=missing_count,
        missing_percentage=(missing_count / record_count * 100) if record_count else 0.0,
        non_missing_count=non_missing_count,
        unique_value_count=unique_count,
        minimum=_finite_float(numeric.min()),
        maximum=_finite_float(numeric.max()),
        mean=_finite_float(numeric.mean()),
        median=_finite_float(numeric.median()),
        standard_deviation=_finite_float(numeric.std(ddof=1)),
        variance=variance,
        first_quartile=_finite_float(numeric.quantile(0.25)),
        third_quartile=_finite_float(numeric.quantile(0.75)),
        is_constant=unique_count <= 1,
        is_all_missing=non_missing_count == 0,
        has_excessive_missingness=(missing_count / record_count >= EXCESSIVE_MISSINGNESS_THRESHOLD) if record_count else False,
    )


def build_missing_values(frame: pd.DataFrame, feature_columns: list[str]) -> MissingValuesResponse:
    items: list[MissingValueSummary] = []
    total_missing = 0
    for feature_name in feature_columns:
        missing_mask = cast(pd.Series, pd.isna(frame[feature_name]))
        missing_count = int(missing_mask.sum())
        total_missing += missing_count
        percentage = missing_count / len(frame) * 100 if len(frame) else 0.0
        status = "excessive" if percentage >= EXCESSIVE_MISSINGNESS_THRESHOLD * 100 else "present" if missing_count else "none"
        items.append(MissingValueSummary(feature_name=feature_name, missing_count=missing_count, missing_percentage=percentage, non_missing_count=len(frame) - missing_count, status=status))
    return MissingValuesResponse(
        items=items,
        total_missing_values=total_missing,
        overall_missing_percentage=(total_missing / (len(frame) * len(feature_columns)) * 100) if frame.shape[0] and feature_columns else 0.0,
        features_with_missing_values=sum(item.missing_count > 0 for item in items),
        features_without_missing_values=sum(item.missing_count == 0 for item in items),
        features_with_excessive_missingness=sum(item.status == "excessive" for item in items),
    )


def build_class_distribution(frame: pd.DataFrame, target_column: str) -> ClassDistributionResponse:
    counts = frame[target_column].value_counts(dropna=False).to_dict()
    normalized_counts = {str(key): int(value) for key, value in counts.items()}
    total = len(frame)
    percentages = {key: (value / total * 100 if total else 0.0) for key, value in normalized_counts.items()}
    normal = normalized_counts.get("neg", 0)
    failure = normalized_counts.get("pos", 0)
    ratio = f"{normal / failure:.2f}:1 normal-to-failure" if failure else "undefined / no positive failures"
    return ClassDistributionResponse(
        target_column=target_column,
        total_records=total,
        class_counts=normalized_counts,
        class_percentages=percentages,
        normal_records=normal,
        failure_records=failure,
        normal_percentage=percentages.get("neg", 0.0),
        failure_percentage=percentages.get("pos", 0.0),
        imbalance_ratio=ratio,
        unexpected_labels=sorted(set(normalized_counts) - {"neg", "pos"}),
    )


def build_quality(frame: pd.DataFrame, target_column: str, feature_columns: list[str], dataset_id: str) -> DataQualityResponse:
    duplicate_columns = pd.Index(frame.columns)[pd.Index(frame.columns).duplicated()].unique().tolist()
    constant_features: list[str] = []
    zero_variance_features: list[str] = []
    all_missing_features: list[str] = []
    infinite_counts: dict[str, int] = {}
    invalid_counts: dict[str, int] = {}
    total_missing = 0
    for feature_name in feature_columns:
        numeric = _numeric_series(frame, feature_name)
        missing_count = int(pd.isna(numeric).sum())
        total_missing += missing_count
        if int(numeric.nunique(dropna=True)) <= 1:
            constant_features.append(feature_name)
        if int(pd.notna(numeric).sum()) and float(cast(Any, numeric.var(ddof=0))) == 0:
            zero_variance_features.append(feature_name)
        if int(pd.notna(numeric).sum()) == 0:
            all_missing_features.append(feature_name)
        infinite_count = int(np.isinf(numeric.to_numpy(dtype=float, na_value=np.nan)).sum())
        if infinite_count:
            infinite_counts[feature_name] = infinite_count
        invalid_count = int((pd.notna(frame[feature_name]) & pd.isna(numeric)).sum())
        if invalid_count:
            invalid_counts[feature_name] = invalid_count
    target_values = cast(pd.Series, frame[target_column].astype("string"))
    unexpected_targets = sorted(set(target_values.dropna().unique()) - {"neg", "pos"})
    return DataQualityResponse(
        dataset_id=dataset_id,
        duplicate_row_count=int(frame.duplicated().sum()),
        duplicate_column_names=[str(column) for column in duplicate_columns],
        constant_features=constant_features,
        zero_variance_features=zero_variance_features,
        all_missing_features=all_missing_features,
        infinite_value_counts=infinite_counts,
        invalid_value_counts=invalid_counts,
        unexpected_target_labels=unexpected_targets,
        total_missing_values=total_missing,
        overall_missing_percentage=(total_missing / (len(frame) * len(feature_columns)) * 100) if len(frame) and feature_columns else 0.0,
        excessive_missingness_threshold=EXCESSIVE_MISSINGNESS_THRESHOLD * 100,
        generated_at=datetime.now(timezone.utc),
    )


def profile_dataset(ingested: IngestedDataset, dataset_summary: DatasetSummary) -> DatasetProfileResponse:
    frame = ingested.frame
    summaries = [feature_summary(frame, feature_name) for feature_name in ingested.feature_columns]
    feature_types = {summary.feature_name: summary.data_type for summary in summaries}
    missing = build_missing_values(frame, ingested.feature_columns)
    quality = build_quality(frame, ingested.target_column, ingested.feature_columns, dataset_summary.dataset_id)
    class_distribution = build_class_distribution(frame, ingested.target_column)
    return DatasetProfileResponse(
        dataset=dataset_summary,
        target_column=ingested.target_column,
        feature_columns=ingested.feature_columns,
        numerical_feature_count=sum(value == "numerical" for value in feature_types.values()),
        categorical_feature_count=sum(value == "categorical" for value in feature_types.values()),
        feature_data_types=feature_types,
        profile=FeaturePageResponse(items=summaries, total=len(summaries), page=1, page_size=len(summaries)),
        missing_values=missing,
        class_distribution=class_distribution,
        quality=quality,
        generated_at=datetime.now(timezone.utc),
    )


def feature_detail(frame: pd.DataFrame, feature_name: str, summary: FeatureSummary, feature_columns: list[str]) -> FeatureDetailResponse:
    correlations: list[FeatureCorrelation] = []
    target = _numeric_series(frame, feature_name)
    for candidate in feature_columns:
        if candidate == feature_name:
            continue
        candidate_values = _numeric_series(frame, candidate)
        if int(target.nunique(dropna=True)) < 2 or int(candidate_values.nunique(dropna=True)) < 2:
            continue
        correlation = target.corr(candidate_values, method="pearson")
        if pd.notna(correlation) and np.isfinite(float(correlation)):
            correlations.append(FeatureCorrelation(feature_name=candidate, correlation=float(correlation)))
    correlations.sort(key=lambda item: abs(item.correlation), reverse=True)
    return FeatureDetailResponse(**summary.model_dump(), top_correlations=correlations[:10])
