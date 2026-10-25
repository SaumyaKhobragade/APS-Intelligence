"""Pydantic contracts for Phase 5 threshold, calibration and policy APIs."""

from math import isfinite
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator, model_validator


CalibrationMethod = Literal["uncalibrated", "sigmoid", "isotonic"]
CalibrationStatus = Literal["completed", "insufficient_sample", "failed"]
ThresholdObjective = Literal["minimum_cost", "maximum_f1", "minimum_recall", "maximum_precision"]
ThresholdTieBreaker = Literal["higher_recall_then_lower_threshold", "lower_threshold"]
ReferenceType = Literal["experiment", "training_run"]


class ThresholdOptimizationRequest(BaseModel):
    """Bounded validation threshold grid and objective configuration."""

    threshold_min: float = Field(default=0.0, ge=0.0, le=1.0)
    threshold_max: float = Field(default=1.0, ge=0.0, le=1.0)
    threshold_step: float | None = Field(default=None, gt=0.0, le=1.0)
    threshold_candidates: int | None = Field(default=None, ge=2, le=10_001)
    objective: ThresholdObjective = "minimum_cost"
    required_recall: float | None = Field(default=None, ge=0.0, le=1.0)
    false_positive_cost: float | None = Field(default=None, ge=0.0)
    false_negative_cost: float | None = Field(default=None, ge=0.0)
    default_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    tie_breaker: ThresholdTieBreaker = "higher_recall_then_lower_threshold"

    @model_validator(mode="after")
    def validate_grid_and_objective(self) -> "ThresholdOptimizationRequest":
        if not all(isfinite(value) for value in (self.threshold_min, self.threshold_max, self.default_threshold)):
            raise ValueError("Threshold bounds and default_threshold must be finite")
        for cost in (self.false_positive_cost, self.false_negative_cost):
            if cost is not None and not isfinite(cost):
                raise ValueError("Business costs must be finite")
        if self.threshold_min >= self.threshold_max:
            raise ValueError("threshold_min must be smaller than threshold_max")
        if self.threshold_step is None and self.threshold_candidates is None:
            self.threshold_step = 0.01
        if self.threshold_step is not None and self.threshold_candidates is not None:
            raise ValueError("Provide only one of threshold_step or threshold_candidates")
        if self.objective in {"minimum_recall", "maximum_precision"} and self.required_recall is None:
            raise ValueError(f"required_recall is required for the {self.objective} objective")
        if self.objective in {"minimum_cost", "maximum_f1"} and self.required_recall is not None:
            raise ValueError(f"required_recall is only valid for recall-constrained objectives, not {self.objective}")
        return self


class ThresholdPolicyCompareRequest(BaseModel):
    """Explicit threshold policies to evaluate against one probability source."""

    thresholds: list[float] = Field(min_length=1, max_length=100)
    calibration_method: CalibrationMethod = "uncalibrated"
    false_positive_cost: float | None = Field(default=None, ge=0.0)
    false_negative_cost: float | None = Field(default=None, ge=0.0)

    @field_validator("thresholds")
    @classmethod
    def validate_thresholds(cls, values: list[float]) -> list[float]:
        if any(not isfinite(value) or not 0.0 <= value <= 1.0 for value in values):
            raise ValueError("Every threshold must be a finite value between 0 and 1")
        return values

    @model_validator(mode="after")
    def validate_costs(self) -> "ThresholdPolicyCompareRequest":
        for cost in (self.false_positive_cost, self.false_negative_cost):
            if cost is not None and not isfinite(cost):
                raise ValueError("Business costs must be finite")
        return self


class CalibrationComparisonRequest(BaseModel):
    """Training-only calibration configuration."""

    methods: list[CalibrationMethod] = Field(
        default_factory=lambda: ["uncalibrated", "sigmoid", "isotonic"],
        min_length=1,
        max_length=3,
    )
    calibration_ratio: float = Field(default=0.2, gt=0.0, le=0.5)
    random_seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    minimum_calibration_records: int = Field(default=20, ge=2, le=100_000)
    minimum_calibration_positives: int = Field(default=5, ge=1, le=100_000)
    minimum_calibration_negatives: int = Field(default=5, ge=1, le=100_000)
    reliability_bins: int = Field(default=10, ge=2, le=50)

    @model_validator(mode="after")
    def deduplicate_methods(self) -> "CalibrationComparisonRequest":
        self.methods = list(dict.fromkeys(self.methods))
        return self


class DecisionPolicyComparisonRequest(BaseModel):
    """Configuration for standardized calibrated/thresholded policy comparison."""

    calibration_methods: list[CalibrationMethod] = Field(
        default_factory=lambda: ["uncalibrated", "sigmoid", "isotonic"],
        min_length=1,
        max_length=3,
    )
    threshold_min: float = Field(default=0.0, ge=0.0, le=1.0)
    threshold_max: float = Field(default=1.0, ge=0.0, le=1.0)
    threshold_step: float | None = Field(default=None, gt=0.0, le=1.0)
    threshold_candidates: int | None = Field(default=None, ge=2, le=10_001)
    false_positive_cost: float | None = Field(default=None, ge=0.0)
    false_negative_cost: float | None = Field(default=None, ge=0.0)
    required_recall: float | None = Field(default=None, ge=0.0, le=1.0)
    calibration_ratio: float = Field(default=0.2, gt=0.0, le=0.5)
    random_seed: int | None = Field(default=None, ge=0, le=2_147_483_647)
    minimum_calibration_records: int = Field(default=20, ge=2, le=100_000)
    minimum_calibration_positives: int = Field(default=5, ge=1, le=100_000)
    minimum_calibration_negatives: int = Field(default=5, ge=1, le=100_000)
    reliability_bins: int = Field(default=10, ge=2, le=50)
    include_recall_constrained: bool = False

    @model_validator(mode="after")
    def validate_grid(self) -> "DecisionPolicyComparisonRequest":
        if self.threshold_min >= self.threshold_max:
            raise ValueError("threshold_min must be smaller than threshold_max")
        if self.threshold_step is None and self.threshold_candidates is None:
            self.threshold_step = 0.01
        if self.threshold_step is not None and self.threshold_candidates is not None:
            raise ValueError("Provide only one of threshold_step or threshold_candidates")
        if self.include_recall_constrained and self.required_recall is None:
            raise ValueError("required_recall is required when include_recall_constrained is true")
        self.calibration_methods = list(dict.fromkeys(self.calibration_methods))
        return self


class ThresholdPoint(BaseModel):
    threshold: float
    precision: float
    recall: float
    f1_score: float
    specificity: float
    false_positive_rate: float
    false_negative_rate: float
    true_negative: int
    false_positive: int
    false_negative: int
    true_positive: int
    predicted_positive_count: int
    total_records: int
    pr_auc: float | None
    roc_auc: float | None
    business_cost: float
    average_business_cost: float


class ThresholdSelectedResult(ThresholdPoint):
    objective: ThresholdObjective
    objective_parameters: dict[str, Any]
    tie_breaker: ThresholdTieBreaker


class Phase5ArtifactReferences(BaseModel):
    """Logical artifact names; local filesystem paths are intentionally hidden."""

    directory_key: str
    thresholds: str | None = None
    calibration: str | None = None
    decision_policies: str | None = None
    visualizations: dict[str, str] = Field(default_factory=dict)


class Phase5Reference(BaseModel):
    reference_id: str
    reference_type: ReferenceType
    model_name: str
    model_version: str
    imbalance_strategy: str | None = None
    preprocessing_strategy: str | None = None
    dataset_id: str
    dataset_fingerprint: str
    validation_ratio: float
    random_seed: int
    validation_records: int
    split_identifier: str


class ThresholdAnalysisResponse(BaseModel):
    reference: Phase5Reference
    default_threshold: ThresholdPoint
    selected: ThresholdSelectedResult
    candidates: list[ThresholdPoint]
    objective: ThresholdObjective
    objective_parameters: dict[str, Any]
    false_positive_cost: float
    false_negative_cost: float
    configuration: dict[str, Any] = Field(default_factory=dict)
    validation_selection_note: str
    artifacts: Phase5ArtifactReferences


class ThresholdPolicyComparisonResponse(BaseModel):
    reference: Phase5Reference
    calibration_method: CalibrationMethod
    false_positive_cost: float
    false_negative_cost: float
    configuration: dict[str, Any] = Field(default_factory=dict)
    rows: list[ThresholdPoint]
    artifacts: Phase5ArtifactReferences


class ReliabilityPoint(BaseModel):
    bin_lower: float
    bin_upper: float
    bin_label: str
    predicted_probability: float
    observed_failure_rate: float
    sample_count: int


class CalibrationMethodResult(BaseModel):
    method: CalibrationMethod
    status: CalibrationStatus
    calibration_records: int
    calibration_positive_records: int
    calibration_negative_records: int
    validation_records: int
    pr_auc: float | None
    roc_auc: float | None
    brier_score: float | None
    log_loss: float | None
    expected_calibration_error: float | None
    reliability_curve: list[ReliabilityPoint]
    artifact_reference: str | None = None
    reason: str | None = None


class CalibrationComparisonResponse(BaseModel):
    reference: Phase5Reference
    methods: list[CalibrationMethodResult]
    calibration_fit_scope: str
    validation_evaluation_scope: str
    ranking_metric_note: str
    configuration: dict[str, Any] = Field(default_factory=dict)
    artifacts: Phase5ArtifactReferences


class DecisionPolicyRow(BaseModel):
    policy_name: str
    calibration_method: CalibrationMethod
    threshold_source: Literal["default", "cost_optimal", "recall_constrained"]
    decision_threshold: float
    pr_auc: float | None
    roc_auc: float | None
    precision: float
    recall: float
    f1_score: float
    specificity: float
    true_negative: int
    false_positive: int
    false_negative: int
    true_positive: int
    total_business_cost: float
    average_business_cost: float
    brier_score: float | None
    log_loss: float | None
    calibration_status: CalibrationStatus
    note: str | None = None


class DecisionPolicyComparisonResponse(BaseModel):
    reference: Phase5Reference
    false_positive_cost: float
    false_negative_cost: float
    configuration: dict[str, Any] = Field(default_factory=dict)
    rows: list[DecisionPolicyRow]
    included_policies: list[str]
    validation_selection_note: str
    artifacts: Phase5ArtifactReferences


class CalibrationMetricsResponse(BaseModel):
    reference: Phase5Reference
    methods: list[CalibrationMethodResult]
