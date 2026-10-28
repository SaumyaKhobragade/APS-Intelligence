"""Typed read-only contracts for persisted historical ML evidence."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


EvidenceScope = Literal[
    "historical_training",
    "cross_validation",
    "validation",
    "official_test",
    "internal_selection",
]
EvidenceStatus = Literal["available", "unavailable", "blocked", "failed"]


class HistoricalAvailability(BaseModel):
    """Availability or integrity status for one evidence component."""

    name: str
    status: EvidenceStatus
    message: str


class HistoricalArtifact(BaseModel):
    """A trusted, metadata-only reference to a persisted artifact."""

    logical_name: str
    relative_path: str
    exists: bool
    readable: bool
    size_bytes: int | None = None
    stored_checksum: str | None = None
    actual_checksum: str | None = None
    checksum_status: Literal["verified", "mismatch", "missing", "not_recorded", "unavailable"]
    message: str | None = None


class HistoricalConfusionMatrix(BaseModel):
    true_negative: int
    false_positive: int
    false_negative: int
    true_positive: int


class HistoricalMetric(BaseModel):
    """Metrics for one explicitly labelled evaluation scope."""

    scope: EvidenceScope
    label: str
    threshold: float | None = None
    pr_auc: float | None = None
    roc_auc: float | None = None
    precision: float | None = None
    recall: float | None = None
    f1_score: float | None = None
    specificity: float | None = None
    balanced_accuracy: float | None = None
    accuracy: float | None = None
    false_positive_cost: float | None = None
    false_negative_cost: float | None = None
    estimated_business_cost: float | None = None
    business_cost_note: str | None = None
    confusion_matrix: HistoricalConfusionMatrix | None = None
    source_reference: str


class HistoricalCrossValidation(BaseModel):
    """Cross-validation/search evidence kept separate from validation metrics."""

    pr_auc_mean: float | None = None
    pr_auc_std: float | None = None
    folds: int | None = None
    search_budget: int | None = None
    source_reference: str


class HistoricalRunSummary(BaseModel):
    reference_type: Literal["training_run", "experiment"]
    reference_id: str
    phase: Literal["phase3", "phase4", "phase9"]
    model_name: str
    model_version: str
    imbalance_strategy: str | None = None
    preprocessing_strategy: str | None = None
    dataset_id: str
    dataset_fingerprint: str | None = None
    status: str
    lifecycle_status: str | None = None
    threshold: float | None = None
    created_at: datetime | None = None
    completed_at: datetime | None = None
    primary_metric: float | None = None
    validation_metrics: HistoricalMetric | None = None
    cross_validation: HistoricalCrossValidation | None = None
    artifact_integrity_status: str
    artifact_available: bool
    source_database: str
    candidate_label: str | None = None
    curves: dict[str, Any] | list[Any] | None = None
    training_duration_seconds: float | None = None
    inference_duration_seconds: float | None = None


class HistoricalRunDetail(HistoricalRunSummary):
    configuration: dict[str, Any] = Field(default_factory=dict)
    hyperparameters: dict[str, Any] = Field(default_factory=dict)
    search_results: list[dict[str, Any]] = Field(default_factory=list)
    feature_importance: list[dict[str, Any]] = Field(default_factory=list)
    metrics: list[HistoricalMetric] = Field(default_factory=list)
    artifacts: list[HistoricalArtifact] = Field(default_factory=list)
    availability: list[HistoricalAvailability] = Field(default_factory=list)
    provenance: list[str] = Field(default_factory=list)
    error_message: str | None = None


class HistoricalEvidenceOverview(BaseModel):
    evidence_version: str
    training_runs: list[HistoricalRunSummary]
    experiments: list[HistoricalRunSummary]
    validation_comparison: list[HistoricalRunSummary]
    candidate_reference_id: str | None = None
    candidate_lifecycle_status: str | None = None
    candidate_label: str | None = None
    availability: list[HistoricalAvailability] = Field(default_factory=list)


class HistoricalRunListResponse(BaseModel):
    items: list[HistoricalRunSummary]
    total: int
    page: int
    page_size: int
    availability: list[HistoricalAvailability] = Field(default_factory=list)


class HistoricalValidationComparisonResponse(BaseModel):
    evidence_version: str
    normalization_version: str
    items: list[HistoricalRunSummary]
    total: int
    page: int
    page_size: int
    evaluation_scope: Literal["validation"] = "validation"
    availability: list[HistoricalAvailability] = Field(default_factory=list)


class HistoricalValidationResponse(BaseModel):
    evidence_version: str
    normalization_version: str
    reference: HistoricalRunSummary
    metrics: list[HistoricalMetric]
    cross_validation: HistoricalCrossValidation | None = None
    dataset_and_split: dict[str, Any] | None = None
    curves: dict[str, Any] | list[Any] | None = None
    feature_importance: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: list[HistoricalArtifact] = Field(default_factory=list)
    availability: list[HistoricalAvailability] = Field(default_factory=list)
    provenance: list[str] = Field(default_factory=list)


class HistoricalThresholdPoint(BaseModel):
    threshold: float
    precision: float | None = None
    recall: float | None = None
    f1_score: float | None = None
    specificity: float | None = None
    false_positive: int | None = None
    false_negative: int | None = None
    true_positive: int | None = None
    true_negative: int | None = None
    business_cost: float | None = None
    source_reference: str
    scope: Literal["validation", "internal_selection"] | None = None
    scope_label: str | None = None


class HistoricalThresholdResponse(BaseModel):
    evidence_version: str
    reference_id: str
    model_name: str
    model_version: str
    calibration_method: str
    frozen_threshold: float
    selection_objective: str
    selection_scope: str
    validation: HistoricalMetric | None = None
    threshold_points: list[HistoricalThresholdPoint] = Field(default_factory=list)
    internal_points: list[HistoricalThresholdPoint] = Field(default_factory=list)
    calibration_metrics: dict[str, float | None] = Field(default_factory=dict)
    artifacts: list[HistoricalArtifact] = Field(default_factory=list)
    availability: list[HistoricalAvailability] = Field(default_factory=list)
    provenance: list[str] = Field(default_factory=list)


class HistoricalCalibrationResponse(BaseModel):
    evidence_version: str
    reference_id: str
    model_name: str
    model_version: str
    selected_method: str
    evaluation_scope: str
    metrics: dict[str, float | None] = Field(default_factory=dict)
    reliability_curve: list[dict[str, Any]] = Field(default_factory=list)
    artifacts: list[HistoricalArtifact] = Field(default_factory=list)
    availability: list[HistoricalAvailability] = Field(default_factory=list)
    provenance: list[str] = Field(default_factory=list)


class OfficialTestConfidenceInterval(BaseModel):
    lower: float
    upper: float


class OfficialTestEvidenceResponse(BaseModel):
    """Persisted Phase 10 official-test evidence kept out of validation rankings."""

    evidence_version: str
    evaluation_id: str
    candidate_id: str
    candidate_label: str
    evaluation_scope: Literal["official_test"] = "official_test"
    model_name: str
    imbalance_strategy: str
    calibration_method: str
    frozen_threshold: float
    metrics: HistoricalMetric
    confidence_intervals: dict[str, OfficialTestConfidenceInterval] = Field(default_factory=dict)
    confidence_interval_method: str | None = None
    confidence_interval_replicates: int | None = None
    calibration_metrics: dict[str, float | None] = Field(default_factory=dict)
    reliability_curve: list[dict[str, Any]] = Field(default_factory=list)
    precision_recall_curve: dict[str, list[float]] = Field(default_factory=dict)
    roc_curve: dict[str, list[float]] = Field(default_factory=dict)
    integrity_flags: dict[str, bool] = Field(default_factory=dict)
    artifacts: list[HistoricalArtifact] = Field(default_factory=list)
    availability: list[HistoricalAvailability] = Field(default_factory=list)
    provenance: list[str] = Field(default_factory=list)
