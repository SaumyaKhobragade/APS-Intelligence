"""Pydantic v2 contracts for production-oriented inference APIs."""

from datetime import datetime
import math
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, field_validator, model_validator


PredictionClass = Literal["pos", "neg"]
PredictionRisk = Literal["high", "low"]
ModelReferenceType = Literal["training_run", "experiment"]


class SensorRecord(BaseModel):
    """One sensor payload; feature names are checked against the selected artifact contract."""

    model_config = ConfigDict(extra="forbid")

    features: dict[str, StrictFloat | StrictInt | None] = Field(min_length=1, max_length=512)
    vehicle_identifier: str | None = Field(default=None, max_length=128)
    request_reference: str | None = Field(default=None, max_length=128)
    user_description: str | None = Field(default=None, max_length=500)

    @field_validator("features")
    @classmethod
    def validate_numeric_values(cls, value: dict[str, StrictFloat | StrictInt | None]) -> dict[str, StrictFloat | StrictInt | None]:
        for feature_name, feature_value in value.items():
            if feature_value is not None and not math.isfinite(float(feature_value)):
                raise ValueError(f"Sensor value for '{feature_name}' must be finite or null.")
        return value


class PredictionReference(BaseModel):
    """Exactly one trusted model reference is selected for an inference request."""

    model_config = ConfigDict(extra="forbid")

    model_run_id: str | None = Field(default=None, min_length=1, max_length=80)
    experiment_id: str | None = Field(default=None, min_length=1, max_length=80)
    decision_policy_id: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def validate_reference_choice(self) -> "PredictionReference":
        if self.model_run_id and self.experiment_id:
            raise ValueError("Specify either model_run_id or experiment_id, not both.")
        return self


class PredictionRequest(PredictionReference, SensorRecord):
    """Request contract for one prediction."""

    model_config = ConfigDict(extra="forbid")
    include_explanation: bool = False


class ModelSelection(BaseModel):
    """Explicit model selection used when registering a persisted policy."""

    model_config = ConfigDict(extra="forbid")

    model_run_id: str | None = Field(default=None, min_length=1, max_length=80)
    experiment_id: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode="after")
    def require_one_model(self) -> "ModelSelection":
        if bool(self.model_run_id) == bool(self.experiment_id):
            raise ValueError("Specify exactly one of model_run_id or experiment_id.")
        return self


class PolicyRegistrationRequest(ModelSelection):
    """Register one named policy from a trusted Phase 5 comparison artifact."""

    policy_name: str = Field(min_length=1, max_length=128)


class BatchPredictionRequest(PredictionReference):
    """Batch request with per-record validation performed without reloading the model."""

    model_config = ConfigDict(extra="forbid")
    records: list[dict[str, Any]] = Field(min_length=1, max_length=1000)
    include_explanation: bool = False


class FeatureContribution(BaseModel):
    feature_name: str
    importance: float
    importance_type: Literal["feature_importance", "absolute_coefficient"]


class PredictionExplanation(BaseModel):
    method: str
    top_features: list[FeatureContribution]
    warning: str


class PredictionResponse(BaseModel):
    prediction_id: str
    model_reference_type: ModelReferenceType
    model_reference_id: str
    model_version: str
    model_run_id: str | None = None
    experiment_id: str | None = None
    decision_policy_id: str | None = None
    decision_policy_version: str | None = None
    predicted_class: PredictionClass
    failure_probability: float = Field(ge=0, le=1)
    applied_threshold: float = Field(ge=0, le=1)
    calibration_method: str
    calibration_artifact_reference: str | None = None
    calibration_artifact_checksum: str | None = None
    model_configuration_fingerprint: str | None = None
    risk_classification: PredictionRisk
    prediction_timestamp: datetime
    inference_duration_ms: float = Field(ge=0)
    vehicle_identifier: str | None = None
    request_reference: str | None = None
    warnings: list[str] = Field(default_factory=list)
    explanation: PredictionExplanation | None = None
    probability_note: str = "This probability is a model estimate, not a guaranteed real-world failure probability."


class BatchRecordError(BaseModel):
    index: int = Field(ge=0)
    code: str
    message: str
    details: list[dict[str, Any]] = Field(default_factory=list)


class BatchPredictionItem(BaseModel):
    index: int = Field(ge=0)
    prediction: PredictionResponse | None = None
    error: BatchRecordError | None = None


class BatchPredictionResponse(BaseModel):
    batch_id: str
    model_reference_type: ModelReferenceType
    model_reference_id: str
    model_version: str
    decision_policy_id: str | None = None
    items: list[BatchPredictionItem]
    total_records: int = Field(ge=0)
    successful_count: int = Field(ge=0)
    failed_count: int = Field(ge=0)
    positive_count: int = Field(ge=0)
    negative_count: int = Field(ge=0)
    total_inference_duration_ms: float = Field(ge=0)
    average_inference_duration_ms: float = Field(ge=0)
    warnings: list[str] = Field(default_factory=list)


class DecisionPolicySummary(BaseModel):
    policy_id: str
    policy_name: str
    policy_version: str = "1"
    model_reference_type: ModelReferenceType
    model_reference_id: str
    model_version: str
    status: str
    threshold: float = Field(ge=0, le=1)
    calibration_method: str
    created_at: datetime


class DecisionPolicyListResponse(BaseModel):
    items: list[DecisionPolicySummary]
    total: int
    page: int
    page_size: int


class PredictionModelOption(BaseModel):
    model_reference_type: ModelReferenceType
    model_reference_id: str
    model_name: str
    model_version: str
    dataset_id: str
    status: str
    feature_count: int
    default_threshold: float = Field(ge=0, le=1)
    available_policy_count: int


class PredictionModelListResponse(BaseModel):
    items: list[PredictionModelOption]
    total: int
    page: int
    page_size: int


class FeatureSchemaResponse(BaseModel):
    model_reference_type: ModelReferenceType
    model_reference_id: str
    model_version: str
    feature_count: int
    feature_names: list[str]


class PredictionHistoryResponse(BaseModel):
    items: list[PredictionResponse]
    total: int
    page: int
    page_size: int
