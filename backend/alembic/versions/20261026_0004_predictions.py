"""create decision policy and prediction registries.

The upgrade is intentionally idempotent because some local SQLite databases
contain these registries while their ``alembic_version`` row still records
the preceding revision.  The normal migration chain can therefore repair
that drift without recreating tables or indexes.

Revision ID: 20261026_0004
Revises: 20261025_0003
Create Date: 2026-10-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261026_0004"
down_revision: Union[str, None] = "20261025_0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if "decision_policies" not in set(sa.inspect(bind).get_table_names()):
        op.create_table(
            "decision_policies",
            sa.Column("policy_id", sa.String(length=80), nullable=False),
            sa.Column("policy_name", sa.String(length=128), nullable=False),
            sa.Column("model_reference_type", sa.String(length=32), nullable=False),
            sa.Column("model_reference_id", sa.String(length=80), nullable=False),
            sa.Column("model_version", sa.String(length=64), nullable=False),
            sa.Column("status", sa.String(length=32), nullable=False),
            sa.Column("threshold", sa.Float(), nullable=False),
            sa.Column("calibration_method", sa.String(length=64), nullable=False),
            sa.Column("calibration_artifact_path", sa.String(length=1024), nullable=True),
            sa.Column("false_positive_cost", sa.Float(), nullable=False),
            sa.Column("false_negative_cost", sa.Float(), nullable=False),
            sa.Column("risk_configuration_json", sa.Text(), nullable=False),
            sa.Column("metadata_json", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint("policy_id"),
        )
    for name, column in (
        ("ix_decision_policies_model_reference_type", "model_reference_type"),
        ("ix_decision_policies_model_reference_id", "model_reference_id"),
        ("ix_decision_policies_status", "status"),
        ("ix_decision_policies_policy_name", "policy_name"),
    ):
        if name not in {item["name"] for item in sa.inspect(bind).get_indexes("decision_policies")}:
            op.create_index(name, "decision_policies", [column], unique=False)

    if "predictions" not in set(sa.inspect(bind).get_table_names()):
        op.create_table(
            "predictions",
            sa.Column("prediction_id", sa.String(length=80), nullable=False),
            sa.Column("batch_id", sa.String(length=80), nullable=True),
            sa.Column("batch_index", sa.Integer(), nullable=True),
            sa.Column("model_reference_type", sa.String(length=32), nullable=False),
            sa.Column("model_reference_id", sa.String(length=80), nullable=False),
            sa.Column("model_version", sa.String(length=64), nullable=False),
            sa.Column("decision_policy_id", sa.String(length=80), nullable=True),
            sa.Column("predicted_class", sa.String(length=8), nullable=False),
            sa.Column("raw_failure_probability", sa.Float(), nullable=False),
            sa.Column("failure_probability", sa.Float(), nullable=False),
            sa.Column("applied_threshold", sa.Float(), nullable=False),
            sa.Column("calibration_method", sa.String(length=64), nullable=False),
            sa.Column("risk_classification", sa.String(length=32), nullable=False),
            sa.Column("vehicle_identifier", sa.String(length=128), nullable=True),
            sa.Column("request_reference", sa.String(length=128), nullable=True),
            sa.Column("user_description", sa.String(length=500), nullable=True),
            sa.Column("prediction_timestamp", sa.DateTime(), nullable=False),
            sa.Column("inference_duration_ms", sa.Float(), nullable=False),
            sa.Column("explanation_method", sa.String(length=128), nullable=True),
            sa.Column("warnings_json", sa.Text(), nullable=False),
            sa.Column("metadata_json", sa.Text(), nullable=False),
            sa.PrimaryKeyConstraint("prediction_id"),
        )
    for name, column in (
        ("batch_id", "batch_id"),
        ("model_reference_type", "model_reference_type"),
        ("model_reference_id", "model_reference_id"),
        ("decision_policy_id", "decision_policy_id"),
        ("predicted_class", "predicted_class"),
        ("vehicle_identifier", "vehicle_identifier"),
        ("request_reference", "request_reference"),
        ("prediction_timestamp", "prediction_timestamp"),
    ):
        index_name = f"ix_predictions_{name}"
        if index_name not in {item["name"] for item in sa.inspect(bind).get_indexes("predictions")}:
            op.create_index(index_name, "predictions", [column], unique=False)


def downgrade() -> None:
    for name in (
        "prediction_timestamp",
        "request_reference",
        "vehicle_identifier",
        "predicted_class",
        "decision_policy_id",
        "model_reference_id",
        "model_reference_type",
        "batch_id",
    ):
        op.drop_index(f"ix_predictions_{name}", table_name="predictions")
    op.drop_table("predictions")
    op.drop_index("ix_decision_policies_status", table_name="decision_policies")
    op.drop_index("ix_decision_policies_policy_name", table_name="decision_policies")
    op.drop_index("ix_decision_policies_model_reference_id", table_name="decision_policies")
    op.drop_index("ix_decision_policies_model_reference_type", table_name="decision_policies")
    op.drop_table("decision_policies")
