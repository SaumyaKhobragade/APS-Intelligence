"""Database metadata model for filesystem-backed model training runs."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ModelTrainingRun(Base):
    """Registry row for one reproducible model training execution."""

    __tablename__ = "model_training_runs"

    run_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("dataset_metadata.dataset_id"), nullable=False, index=True)
    dataset_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    registry_status: Mapped[str] = mapped_column(String(32), nullable=False, default="registered", index=True)
    random_seed: Mapped[int] = mapped_column(Integer, nullable=False)
    validation_ratio: Mapped[float] = mapped_column(Float, nullable=False)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    false_positive_cost: Mapped[float] = mapped_column(Float, nullable=False)
    false_negative_cost: Mapped[float] = mapped_column(Float, nullable=False)
    artifact_directory: Mapped[str] = mapped_column(String(1024), nullable=False)
    model_artifact_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    preprocessor_artifact_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    metadata_artifact_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    split_metadata_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    preprocessing_configuration_json: Mapped[str] = mapped_column(Text, nullable=False)
    hyperparameters_json: Mapped[str] = mapped_column(Text, nullable=False)
    class_imbalance_configuration_json: Mapped[str] = mapped_column(Text, nullable=False)
    feature_names_before_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    feature_names_after_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    training_records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    validation_records: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    metrics_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    confusion_matrix_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    training_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    configuration_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    split_identifier: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    library_versions_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    artifact_checksums_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    artifact_integrity_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    lifecycle_metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
