"""Database metadata models for decision policies and persisted predictions."""

from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class DecisionPolicy(Base):
    """A threshold/calibration policy explicitly bound to one model reference."""

    __tablename__ = "decision_policies"

    policy_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    policy_name: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    policy_version: Mapped[str] = mapped_column(String(64), nullable=False, default="1")
    model_reference_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    model_reference_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    calibration_method: Mapped[str] = mapped_column(String(64), nullable=False, default="uncalibrated")
    calibration_artifact_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    calibration_artifact_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    artifact_integrity_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    false_positive_cost: Mapped[float] = mapped_column(Float, nullable=False)
    false_negative_cost: Mapped[float] = mapped_column(Float, nullable=False)
    risk_configuration_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class PredictionRecord(Base):
    """Persisted prediction metadata without retaining the sensor payload."""

    __tablename__ = "predictions"

    prediction_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    batch_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    batch_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model_reference_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    model_reference_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    decision_policy_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    decision_policy_version: Mapped[str | None] = mapped_column(String(64), nullable=True)
    predicted_class: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    raw_failure_probability: Mapped[float] = mapped_column(Float, nullable=False)
    failure_probability: Mapped[float] = mapped_column(Float, nullable=False)
    applied_threshold: Mapped[float] = mapped_column(Float, nullable=False)
    calibration_method: Mapped[str] = mapped_column(String(64), nullable=False)
    calibration_artifact_reference: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    calibration_artifact_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    model_configuration_fingerprint: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    artifact_checksums_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    risk_classification: Mapped[str] = mapped_column(String(32), nullable=False)
    vehicle_identifier: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    request_reference: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    user_description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    prediction_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    inference_duration_ms: Mapped[float] = mapped_column(Float, nullable=False)
    explanation_method: Mapped[str | None] = mapped_column(String(128), nullable=True)
    warnings_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
