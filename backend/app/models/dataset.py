"""Database metadata models for datasets and preprocessing runs."""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class DatasetMetadata(Base):
    """Metadata pointer to a filesystem-backed dataset artifact."""

    __tablename__ = "dataset_metadata"

    dataset_id: Mapped[str] = mapped_column(String(80), primary_key=True, index=True)
    dataset_name: Mapped[str] = mapped_column(String(255), nullable=False)
    dataset_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    source_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    record_count: Mapped[int] = mapped_column(Integer, nullable=False)
    feature_count: Mapped[int] = mapped_column(Integer, nullable=False)
    target_column: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ready")
    metadata_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    profile_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )


class PreprocessingRun(Base):
    """Reproducible preprocessing configuration and artifact pointers."""

    __tablename__ = "preprocessing_runs"

    run_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("dataset_metadata.dataset_id"), nullable=False, index=True)
    strategy: Mapped[str] = mapped_column(String(64), nullable=False)
    model_kind: Mapped[str] = mapped_column(String(64), nullable=False)
    validation_ratio: Mapped[float] = mapped_column(Float, nullable=False)
    random_seed: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    artifact_directory: Mapped[str] = mapped_column(String(1024), nullable=False)
    split_metadata_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    configuration_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc).replace(tzinfo=None),
    )
