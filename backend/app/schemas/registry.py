"""Phase 7 model registry, lineage, promotion and reproducibility contracts."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


RegistryReferenceType = Literal["training_run", "experiment"]
RegistryLifecycleStatus = Literal["registered", "trained", "evaluated", "eligible", "approved", "archived", "failed"]
PromotionStatus = Literal["active", "superseded", "reverted"]


class RegistryLifecycleRequest(BaseModel):
    target_status: RegistryLifecycleStatus
    note: str | None = Field(default=None, max_length=500)
    genuine_aps_evaluation_completed: bool = False
    evaluation_evidence: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_evidence(self) -> "RegistryLifecycleRequest":
        if self.target_status == "eligible" and self.genuine_aps_evaluation_completed and not self.evaluation_evidence:
            raise ValueError("evaluation_evidence is required when genuine APS evaluation is confirmed")
        if self.target_status == "approved":
            raise ValueError("approved status is assigned only by explicit promotion")
        return self


class PromotionRequest(BaseModel):
    decision_policy_id: str = Field(min_length=1, max_length=80)
    confirm_genuine_aps_evaluation: bool = False
    evaluation_evidence: str = Field(min_length=1, max_length=1000)
    note: str | None = Field(default=None, max_length=500)


class ArtifactInventoryItem(BaseModel):
    logical_name: str
    available: bool
    stored_checksum: str | None = None
    actual_checksum: str | None = None
    status: Literal["verified", "checksum_missing", "mismatch", "missing"]
    size_bytes: int | None = None


class ArtifactInventoryResponse(BaseModel):
    model_reference_type: RegistryReferenceType
    model_reference_id: str
    model_version: str
    artifact_integrity_status: str
    items: list[ArtifactInventoryItem]
    all_available: bool
    all_verified: bool


class RegistryModelSummary(BaseModel):
    model_reference_type: RegistryReferenceType
    model_reference_id: str
    model_name: str
    model_version: str
    execution_status: str
    lifecycle_status: RegistryLifecycleStatus
    dataset_id: str
    dataset_fingerprint: str
    configuration_fingerprint: str | None = None
    split_identifier: str | None = None
    primary_metric: float | None = None
    artifact_integrity_status: str
    created_at: datetime
    completed_at: datetime | None = None
    archived_at: datetime | None = None
    policy_count: int = 0
    prediction_count: int = 0


class RegistryListResponse(BaseModel):
    items: list[RegistryModelSummary]
    total: int
    page: int
    page_size: int


class RegistryDetailResponse(RegistryModelSummary):
    preprocessing_configuration: dict[str, Any]
    hyperparameters: dict[str, Any]
    imbalance_configuration: dict[str, Any]
    feature_names_before: list[str]
    feature_names_after: list[str]
    library_versions: dict[str, str]
    artifact_checksums: dict[str, str]
    associated_training_run_ids: list[str]
    decision_policy_ids: list[str]
    validation_metrics: dict[str, Any] | None = None
    failure_reason: str | None = None
    lifecycle_metadata: dict[str, Any]


class ModelLineageResponse(BaseModel):
    model: RegistryModelSummary
    dataset: dict[str, Any]
    split: dict[str, Any]
    preprocessing: dict[str, Any]
    configuration: dict[str, Any]
    artifact_references: list[str]
    decision_policies: list[dict[str, Any]]
    prediction_count: int


class ReproducibilityCheck(BaseModel):
    name: str
    status: Literal["passed", "blocked", "mismatch", "unavailable"]
    message: str


class ReproducibilityResponse(BaseModel):
    model_reference_type: RegistryReferenceType
    model_reference_id: str
    configuration_fingerprint: str | None
    reproducible: bool
    source_data_available: bool
    checks: list[ReproducibilityCheck]
    missing_prerequisites: list[str]
    dependency_mismatches: dict[str, dict[str, str]]
    test_dataset_loaded: bool = False


class PromotionSummary(BaseModel):
    promotion_id: str
    model_reference_type: RegistryReferenceType
    model_reference_id: str
    model_version: str
    decision_policy_id: str
    decision_policy_version: str
    status: PromotionStatus
    previous_promotion_id: str | None = None
    genuine_evaluation_confirmed: bool
    evaluation_evidence: str
    note: str | None = None
    promoted_at: datetime
    superseded_at: datetime | None = None
    reverted_at: datetime | None = None


class PromotionListResponse(BaseModel):
    items: list[PromotionSummary]
    total: int
    page: int
    page_size: int


class ModelVersionHistoryResponse(BaseModel):
    model_name: str
    items: list[RegistryModelSummary]
    total: int
    page: int
    page_size: int
