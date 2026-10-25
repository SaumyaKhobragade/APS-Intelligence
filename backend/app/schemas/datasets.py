"""Pydantic contracts for dataset engineering endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


DatasetKind = Literal["training", "testing", "custom"]
DatasetStatus = Literal["ready", "profiled", "preprocessed", "error"]
PreprocessingStrategy = Literal["median", "mean", "constant", "missingness_indicators", "native"]
ModelKind = Literal["logistic_regression", "random_forest", "xgboost", "catboost"]


class DatasetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dataset_id: str
    dataset_name: str
    dataset_type: DatasetKind
    source_file_name: str
    fingerprint: str
    file_size_bytes: int
    record_count: int
    feature_count: int
    target_column: str | None
    status: DatasetStatus
    imported_at: datetime


class DatasetListResponse(BaseModel):
    items: list[DatasetSummary]
    total: int
    page: int
    page_size: int


class FeatureSummary(BaseModel):
    feature_name: str
    data_type: str
    missing_count: int
    missing_percentage: float
    non_missing_count: int
    unique_value_count: int
    minimum: float | None = None
    maximum: float | None = None
    mean: float | None = None
    median: float | None = None
    standard_deviation: float | None = None
    variance: float | None = None
    first_quartile: float | None = None
    third_quartile: float | None = None
    is_constant: bool
    is_all_missing: bool
    has_excessive_missingness: bool


class FeaturePageResponse(BaseModel):
    items: list[FeatureSummary]
    total: int
    page: int
    page_size: int
    search: str | None = None


class FeatureCorrelation(BaseModel):
    feature_name: str
    correlation: float


class FeatureDetailResponse(FeatureSummary):
    top_correlations: list[FeatureCorrelation]


class MissingValueSummary(BaseModel):
    feature_name: str
    missing_count: int
    missing_percentage: float
    non_missing_count: int
    status: Literal["none", "present", "excessive"]


class MissingValuesResponse(BaseModel):
    items: list[MissingValueSummary]
    total_missing_values: int
    overall_missing_percentage: float
    features_with_missing_values: int
    features_without_missing_values: int
    features_with_excessive_missingness: int


class ClassDistributionResponse(BaseModel):
    target_column: str
    total_records: int
    class_counts: dict[str, int]
    class_percentages: dict[str, float]
    normal_records: int
    failure_records: int
    normal_percentage: float
    failure_percentage: float
    imbalance_ratio: str
    unexpected_labels: list[str]


class DataQualityResponse(BaseModel):
    dataset_id: str
    duplicate_row_count: int
    duplicate_column_names: list[str]
    constant_features: list[str]
    zero_variance_features: list[str]
    all_missing_features: list[str]
    infinite_value_counts: dict[str, int]
    invalid_value_counts: dict[str, int]
    unexpected_target_labels: list[str]
    total_missing_values: int
    overall_missing_percentage: float
    excessive_missingness_threshold: float
    generated_at: datetime


class DatasetProfileResponse(BaseModel):
    dataset: DatasetSummary
    target_column: str
    feature_columns: list[str]
    numerical_feature_count: int
    categorical_feature_count: int
    feature_data_types: dict[str, str]
    profile: FeaturePageResponse
    missing_values: MissingValuesResponse
    class_distribution: ClassDistributionResponse
    quality: DataQualityResponse
    generated_at: datetime


class DatasetImportResponse(BaseModel):
    dataset: DatasetSummary
    message: str


class PreprocessingRequest(BaseModel):
    strategy: PreprocessingStrategy = "median"
    model_kind: ModelKind = "logistic_regression"
    constant_value: float = 0.0
    add_missingness_indicators: bool = False
    validation_ratio: float = Field(default=0.2, gt=0, lt=0.5)
    random_seed: int = Field(default=42, ge=0, le=2_147_483_647)
    output_format: Literal["parquet", "csv"] = "parquet"


class SplitSummary(BaseModel):
    split_name: Literal["training", "validation", "test"]
    record_count: int
    class_counts: dict[str, int]
    class_percentages: dict[str, float]
    fingerprint: str
    source_dataset_id: str


class SplitsResponse(BaseModel):
    dataset_id: str
    validation_ratio: float
    random_seed: int
    test_isolation_note: str
    splits: list[SplitSummary]


class PreprocessingRunResponse(BaseModel):
    run_id: str
    dataset_id: str
    strategy: PreprocessingStrategy
    model_kind: ModelKind
    validation_ratio: float
    random_seed: int
    status: Literal["completed", "failed"]
    feature_count_before: int
    feature_count_after: int
    train_records: int
    validation_records: int
    artifact_directory: str
    split_metadata_path: str
    leakage_prevention: str
    message: str


class PreprocessingStatusResponse(BaseModel):
    dataset_id: str
    runs: list[PreprocessingRunResponse]
