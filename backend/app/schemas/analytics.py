"""Frontend-facing Phase 8 analytics and export contracts."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.datasets import DatasetProfileResponse, DatasetSummary, FeaturePageResponse, SplitsResponse
from app.schemas.phase5 import CalibrationComparisonResponse, DecisionPolicyComparisonResponse, ThresholdAnalysisResponse
from app.schemas.registry import PromotionSummary


MetricScope = Literal["validation", "official_test", "synthetic", "production"]
AvailabilityStatus = Literal["available", "unavailable", "blocked"]


class AvailabilityNote(BaseModel):
    name: str
    status: AvailabilityStatus
    message: str


class DashboardValidationMetric(BaseModel):
    reference_type: Literal["training_run", "experiment"]
    reference_id: str
    model_name: str
    model_version: str
    dataset_id: str
    split_identifier: str | None = None
    scope: MetricScope = "validation"
    pr_auc: float | None = None
    roc_auc: float | None = None
    precision: float | None = None
    recall: float | None = None
    f1_score: float | None = None
    estimated_business_cost: float | None = None
    generated_at: datetime


class RecentExperimentActivity(BaseModel):
    experiment_id: str
    model_name: str
    model_version: str
    status: str
    lifecycle_status: str
    dataset_id: str
    configuration_fingerprint: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    pr_auc: float | None = None


class RecentPredictionActivity(BaseModel):
    prediction_id: str
    model_reference_type: str
    model_reference_id: str
    model_version: str
    predicted_class: str
    failure_probability: float
    prediction_timestamp: datetime


class DashboardResponse(BaseModel):
    generated_at: datetime
    datasets: list[DatasetSummary]
    model_run_count: int
    experiment_count: int
    model_counts_by_lifecycle: dict[str, int]
    current_promotion: PromotionSummary | None = None
    total_predictions: int
    positive_prediction_count: int
    negative_prediction_count: int
    recent_experiments: list[RecentExperimentActivity]
    recent_predictions: list[RecentPredictionActivity]
    latest_validation_metrics: list[DashboardValidationMetric]
    artifact_integrity_counts: dict[str, int]
    reproducibility_status: dict[str, int]
    availability: list[AvailabilityNote]


class DatasetAnalyticsResponse(BaseModel):
    dataset: DatasetSummary
    source_available: bool
    profile_available: bool
    profile: DatasetProfileResponse | None = None
    feature_page: FeaturePageResponse | None = None
    splits: SplitsResponse | None = None
    availability: list[AvailabilityNote]


class ModelComparisonItem(BaseModel):
    reference_type: Literal["training_run", "experiment"]
    reference_id: str
    model_name: str
    model_version: str
    dataset_id: str
    dataset_fingerprint: str
    evaluation_scope: MetricScope
    evaluation_split: str | None = None
    imbalance_strategy: str | None = None
    preprocessing_strategy: str | None = None
    hyperparameters: dict[str, Any] = Field(default_factory=dict)
    threshold: float | None = None
    pr_auc: float | None = None
    roc_auc: float | None = None
    precision: float | None = None
    recall: float | None = None
    f1_score: float | None = None
    confusion_matrix: dict[str, Any] | None = None
    false_positive_cost: float | None = None
    false_negative_cost: float | None = None
    estimated_business_cost: float | None = None
    training_duration_seconds: float | None = None
    inference_duration_seconds: float | None = None
    precision_recall_curve: dict[str, list[float]] | None = None
    roc_curve: dict[str, list[float]] | None = None
    feature_importance: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime


class ModelComparisonResponse(BaseModel):
    available_model_families: list[str]
    items: list[ModelComparisonItem]
    total: int
    page: int
    page_size: int
    filters: dict[str, Any]
    availability: list[AvailabilityNote]


class ThresholdAnalyticsResponse(BaseModel):
    reference_type: Literal["training_run", "experiment"]
    reference_id: str
    threshold_analysis: ThresholdAnalysisResponse | None = None
    calibration: CalibrationComparisonResponse | None = None
    decision_policies: DecisionPolicyComparisonResponse | None = None
    availability: list[AvailabilityNote]


class ThresholdAnalyticsListItem(BaseModel):
    reference_type: Literal["training_run", "experiment"]
    reference_id: str
    model_name: str
    model_version: str
    threshold_available: bool
    calibration_available: bool
    decision_policy_available: bool


class ThresholdAnalyticsListResponse(BaseModel):
    items: list[ThresholdAnalyticsListItem]
    total: int
    page: int
    page_size: int
