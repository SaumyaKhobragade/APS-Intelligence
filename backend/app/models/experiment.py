"""Database metadata model for Phase 4 comparative experiments."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ExperimentRun(Base):
    """Registry row for one immutable comparative experiment execution."""

    __tablename__ = "experiment_runs"

    experiment_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("dataset_metadata.dataset_id"), nullable=False, index=True)
    dataset_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    registry_status: Mapped[str] = mapped_column(String(32), nullable=False, default="registered", index=True)
    imbalance_strategy: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    preprocessing_strategy: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    optimize_hyperparameters: Mapped[bool] = mapped_column(nullable=False, default=False)
    random_seed: Mapped[int] = mapped_column(Integer, nullable=False)
    validation_ratio: Mapped[float] = mapped_column(Float, nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    false_positive_cost: Mapped[float] = mapped_column(Float, nullable=False)
    false_negative_cost: Mapped[float] = mapped_column(Float, nullable=False)
    search_budget: Mapped[int] = mapped_column(Integer, nullable=False)
    cv_folds: Mapped[int] = mapped_column(Integer, nullable=False)
    artifact_directory: Mapped[str] = mapped_column(String(1024), nullable=False)
    pipeline_artifact_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    preprocessor_artifact_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    metadata_artifact_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    split_metadata_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    curves_artifact_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    feature_importance_artifact_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    confusion_matrix_visualization_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    configuration_json: Mapped[str] = mapped_column(Text, nullable=False)
    best_parameters_json: Mapped[str] = mapped_column(Text, nullable=False)
    search_results_json: Mapped[str] = mapped_column(Text, nullable=False)
    metrics_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    curves_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    feature_importance_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    training_records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    validation_records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    training_class_counts_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    validation_class_counts_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    training_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    inference_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    configuration_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    split_identifier: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    library_versions_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    artifact_checksums_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    artifact_integrity_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    lifecycle_metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
