"""Pydantic contracts for Phase 4 experimentation and comparison APIs."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.models import (
    ClassImbalanceRequest,
    ConfusionMatrixResponse,
    EvaluationMetricsResponse,
    ModelName,
)
from app.schemas.datasets import PreprocessingStrategy


ImbalanceStrategy = Literal["original", "class_weight", "smote"]
ExperimentStatus = Literal["queued", "running", "completed", "failed"]


class ExperimentRequest(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=80)
    model_name: ModelName
    imbalance_strategy: ImbalanceStrategy = "original"
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
    optimize_hyperparameters: bool = False
    search_budget: int = Field(default=4, ge=1, le=50)
    cv_folds: int = Field(default=3, ge=2, le=5)
    search_n_jobs: int = Field(default=1, ge=1, le=32)
    smote_k_neighbors: int = Field(default=5, ge=1, le=20)

    @model_validator(mode="after")
    def validate_compatibility(self) -> "ExperimentRequest":
        if self.preprocessing_strategy == "native" and self.model_name not in {"xgboost", "catboost"}:
            raise ValueError("Native preprocessing is only supported for xgboost and catboost")
        if self.imbalance_strategy == "smote" and self.preprocessing_strategy == "native":
            raise ValueError("SMOTE requires an imputed preprocessing strategy; native missing-value handling is incompatible")
        if self.imbalance_strategy != "class_weight" and self.class_imbalance.scale_pos_weight is not None:
            raise ValueError("scale_pos_weight is only meaningful for the class_weight strategy with xgboost")
        if self.class_imbalance.scale_pos_weight is not None and self.model_name != "xgboost":
            raise ValueError("scale_pos_weight is only supported for xgboost")
        return self


class ExperimentBatchRequest(BaseModel):
    dataset_id: str = Field(min_length=1, max_length=80)
    model_names: list[ModelName] = Field(min_length=1, max_length=4)
    imbalance_strategies: list[ImbalanceStrategy] = Field(default_factory=lambda: ["original"])
    preprocessing_strategy: PreprocessingStrategy = "median"
    constant_value: float = 0.0
    add_missingness_indicators: bool = False
    validation_ratio: float = Field(default=0.2, gt=0, lt=0.5)
    random_seed: int = Field(default=42, ge=0, le=2_147_483_647)
    threshold: float | None = Field(default=None, ge=0, le=1)
    false_positive_cost: float | None = Field(default=None, ge=0)
    false_negative_cost: float | None = Field(default=None, ge=0)
    class_imbalance: ClassImbalanceRequest = Field(default_factory=ClassImbalanceRequest)
    hyperparameters_by_model: dict[ModelName, dict[str, Any]] = Field(default_factory=dict)
    optimize_hyperparameters: bool = False
    search_budget: int = Field(default=4, ge=1, le=50)
    cv_folds: int = Field(default=3, ge=2, le=5)
    search_n_jobs: int = Field(default=1, ge=1, le=32)
    smote_k_neighbors: int = Field(default=5, ge=1, le=20)

    @model_validator(mode="after")
    def validate_size(self) -> "ExperimentBatchRequest":
        combinations = len(set(self.model_names)) * len(set(self.imbalance_strategies))
        if combinations > 16:
            raise ValueError("A comparative batch may contain at most 16 model/imbalance combinations")
        if self.preprocessing_strategy == "native" and any(name not in {"xgboost", "catboost"} for name in self.model_names):
            raise ValueError("Native preprocessing is only supported for xgboost and catboost")
        if "smote" in self.imbalance_strategies and self.preprocessing_strategy == "native":
            raise ValueError("SMOTE requires an imputed preprocessing strategy; native missing-value handling is incompatible")
        return self


class CurveDataResponse(BaseModel):
    precision_recall: dict[str, list[float]]
    roc: dict[str, list[float]]


class FeatureImportanceItem(BaseModel):
    feature_name: str
    importance: float
    importance_type: Literal["feature_importance", "absolute_coefficient"]


class ExperimentArtifactMetadata(BaseModel):
    artifact_directory: str
    pipeline_artifact_path: str
    preprocessor_artifact_path: str
    metadata_artifact_path: str
    split_metadata_path: str
    curves_artifact_path: str
    feature_importance_artifact_path: str
    confusion_matrix_visualization_path: str


class ExperimentRunSummary(BaseModel):
    experiment_id: str
    model_name: ModelName
    model_version: str
    dataset_id: str
    dataset_fingerprint: str
    status: ExperimentStatus
    imbalance_strategy: ImbalanceStrategy
    preprocessing_strategy: PreprocessingStrategy
    optimize_hyperparameters: bool
    random_seed: int
    validation_ratio: float
    primary_metric: float | None = None
    training_duration_seconds: float | None = None
    inference_duration_seconds: float | None = None
    created_at: datetime
    completed_at: datetime | None = None


class ExperimentRunDetailResponse(ExperimentRunSummary):
    configuration: dict[str, Any]
    best_parameters: dict[str, Any]
    search_results: list[dict[str, Any]]
    metrics: EvaluationMetricsResponse | None = None
    confusion_matrix: ConfusionMatrixResponse | None = None
    curves: CurveDataResponse | None = None
    feature_importance: list[FeatureImportanceItem]
    artifacts: ExperimentArtifactMetadata
    training_records: int
    validation_records: int
    training_class_counts: dict[str, int]
    validation_class_counts: dict[str, int]
    validation_distribution_preserved: bool
    test_isolation_note: str
    error_message: str | None = None


class ExperimentListResponse(BaseModel):
    items: list[ExperimentRunSummary]
    total: int
    page: int
    page_size: int


class ExperimentBatchResponse(BaseModel):
    experiment_ids: list[str]
    message: str


class ExperimentCompareRequest(BaseModel):
    experiment_ids: list[str] = Field(min_length=1, max_length=50)


class ExperimentComparisonResponse(BaseModel):
    experiment_ids: list[str]
    primary_metric: Literal["pr_auc"] = "pr_auc"
    rows: list[ExperimentRunSummary]
    metric_rows: list[dict[str, Any]]


class ExperimentConfigurationResponse(BaseModel):
    experiment_id: str
    configuration: dict[str, Any]
    best_parameters: dict[str, Any]
    search_results: list[dict[str, Any]]
