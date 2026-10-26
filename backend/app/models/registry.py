"""Explicit model/policy promotion history for reversible defaults."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


class ModelPromotion(Base):
    """Auditable active/default model and decision-policy selection."""

    __tablename__ = "model_promotions"

    promotion_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    model_reference_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    model_reference_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    model_version: Mapped[str] = mapped_column(String(64), nullable=False)
    decision_policy_id: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    decision_policy_version: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    previous_promotion_id: Mapped[str | None] = mapped_column(String(80), nullable=True)
    genuine_evaluation_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    evaluation_evidence: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    promoted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    superseded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reverted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
