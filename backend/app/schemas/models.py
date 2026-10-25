"""Pydantic contracts for Phase 3 model training and registry APIs."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.datasets import PreprocessingStrategy


ModelName = Literal["logistic_regression", "random_forest", "xgboost", "catboost"]
TrainingStatus = Literal["queued", "running", "completed", "failed"]
ClassWeightMode = Literal["none", "balanced", "custom"]


class ClassImbalanceRequest(BaseModel):
    """Explicit imbalance policy; no resampling is represented or applied."""

    mode: ClassWeightMode = "balanced"
    negative_weight: float = Field(default=1.0, gt=0)
    positive_weight: float = Field(default=1.0, gt=0)
    scale_pos_weight: float | None = Field(default=None, gt=0)


class TrainingRequest(BaseModel):
    """Request for one reproducible training run."""

    dataset_id: str = Field(min_length=1, max_length=80)
    model_name: ModelName
    preprocessing_strategy: PreprocessingStrategy = "median"
    constant_value: float = 0.0
    add_missingness_indicators: bool = False
    validation_ratio: float = Field(default=0.2, gt=0, lt=0.5)
    random_seed: int = Field(default=42, ge=0, le=2_147_483_647)
    threshold: float | None = Field(default=None, ge=0, le=1)
    false_positive_cost: float | None = Field(default=None, ge=0)
    false_negative_cost: float | None = Field(default=None, ge=0)
    class_imbalance: ClassImbalanceRequest = Field(default_factory=ClassImbalanceRequest)
    hyperparameters: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_model_specific_options(self) -> "TrainingRequest":
        if self.preprocessing_strategy == "native" and self.model_name not in {"xgboost", "catboost"}:
            raise ValueError("Native preprocessing is only supported for xgboost and catboost")
        if self.class_imbalance.scale_pos_weight is not None and self.model_name != "xgboost":
            raise ValueError("scale_pos_weight is only supported for xgboost")
        return self


class ConfusionMatrixResponse(BaseModel):
    true_negative: int
    false_positive: int
    false_negative: int
    true_positive: int
    matrix: list[list[int]]


class EvaluationMetricsResponse(BaseModel):
    primary_metric: Literal["pr_auc"] = "pr_auc"
    threshold: float
    pr_auc: float | None
    roc_auc: float | None
    precision: float
    recall: float
    f1_score: float
    confusion_matrix: ConfusionMatrixResponse
    false_positive_cost: float
    false_negative_cost: float
    estimated_business_cost: float
    business_cost_note: str
    positive_label: str = "pos"


class ModelArtifactMetadata(BaseModel):
    model_artifact_path: str
    preprocessor_artifact_path: str
    metadata_artifact_path: str
    split_metadata_path: str
    artifact_directory: str


class TrainingRunSummary(BaseModel):
    run_id: str
    model_name: ModelName
    model_version: str
    dataset_id: str
    dataset_fingerprint: str
    status: TrainingStatus
    random_seed: int
    validation_ratio: float
    threshold: float
    primary_metric: float | None = None
    training_duration_seconds: float | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TrainingRunDetailResponse(TrainingRunSummary):
    preprocessing_configuration: dict[str, Any]
    hyperparameters: dict[str, Any]
    class_imbalance_configuration: dict[str, Any]
    metrics: EvaluationMetricsResponse | None = None
    artifacts: ModelArtifactMetadata
    feature_names_before: list[str]
    feature_names_after: list[str]
    training_records: int
    validation_records: int
    test_isolation_note: str
    error_message: str | None = None


class TrainingRunListResponse(BaseModel):
    items: list[TrainingRunSummary]
    total: int
    page: int
    page_size: int


class TrainingStatusResponse(BaseModel):
    run_id: str
    status: TrainingStatus
    message: str
    started_at: datetime | None = None
    completed_at: datetime | None = None
    training_duration_seconds: float | None = None


class ModelCatalogItem(BaseModel):
    model_name: ModelName
    display_name: str
    trainer_version: str
    available_versions: list[str]
    completed_run_count: int


class ModelCatalogResponse(BaseModel):
    items: list[ModelCatalogItem]


class ModelVersionsResponse(BaseModel):
    model_name: ModelName
    versions: list[str]
