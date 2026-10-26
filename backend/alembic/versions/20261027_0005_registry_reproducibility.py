"""add lifecycle, lineage, checksums and promotion history

Revision ID: 20261027_0005
Revises: 20261026_0004
Create Date: 2026-10-27
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261027_0005"
down_revision: Union[str, None] = "20261026_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_columns(table: str, columns: list[sa.Column]) -> None:
    for column in columns:
        op.add_column(table, column)


def upgrade() -> None:
    _add_columns(
        "model_training_runs",
        [
            sa.Column("registry_status", sa.String(length=32), nullable=True),
            sa.Column("configuration_fingerprint", sa.String(length=64), nullable=True),
            sa.Column("split_identifier", sa.String(length=128), nullable=True),
            sa.Column("library_versions_json", sa.Text(), nullable=True),
            sa.Column("artifact_checksums_json", sa.Text(), nullable=True),
            sa.Column("artifact_integrity_status", sa.String(length=32), nullable=True),
            sa.Column("lifecycle_metadata_json", sa.Text(), nullable=True),
            sa.Column("archived_at", sa.DateTime(), nullable=True),
        ],
    )
    _add_columns(
        "experiment_runs",
        [
            sa.Column("registry_status", sa.String(length=32), nullable=True),
            sa.Column("configuration_fingerprint", sa.String(length=64), nullable=True),
            sa.Column("split_identifier", sa.String(length=128), nullable=True),
            sa.Column("library_versions_json", sa.Text(), nullable=True),
            sa.Column("artifact_checksums_json", sa.Text(), nullable=True),
            sa.Column("artifact_integrity_status", sa.String(length=32), nullable=True),
            sa.Column("lifecycle_metadata_json", sa.Text(), nullable=True),
            sa.Column("archived_at", sa.DateTime(), nullable=True),
            sa.Column("started_at", sa.DateTime(), nullable=True),
        ],
    )
    _add_columns(
        "decision_policies",
        [
            sa.Column("policy_version", sa.String(length=64), nullable=True),
            sa.Column("calibration_artifact_checksum", sa.String(length=64), nullable=True),
            sa.Column("artifact_integrity_status", sa.String(length=32), nullable=True),
        ],
    )
    _add_columns(
        "predictions",
        [
            sa.Column("decision_policy_version", sa.String(length=64), nullable=True),
            sa.Column("calibration_artifact_reference", sa.String(length=1024), nullable=True),
            sa.Column("calibration_artifact_checksum", sa.String(length=64), nullable=True),
            sa.Column("model_configuration_fingerprint", sa.String(length=64), nullable=True),
            sa.Column("artifact_checksums_json", sa.Text(), nullable=True),
        ],
    )
    op.create_table(
        "model_promotions",
        sa.Column("promotion_id", sa.String(length=80), nullable=False),
        sa.Column("model_reference_type", sa.String(length=32), nullable=False),
        sa.Column("model_reference_id", sa.String(length=80), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("decision_policy_id", sa.String(length=80), nullable=False),
        sa.Column("decision_policy_version", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("previous_promotion_id", sa.String(length=80), nullable=True),
        sa.Column("genuine_evaluation_confirmed", sa.Boolean(), nullable=False),
        sa.Column("evaluation_evidence", sa.Text(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("promoted_at", sa.DateTime(), nullable=False),
        sa.Column("superseded_at", sa.DateTime(), nullable=True),
        sa.Column("reverted_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("promotion_id"),
    )
    for name, column in (
        ("model_reference_type", "model_reference_type"),
        ("model_reference_id", "model_reference_id"),
        ("decision_policy_id", "decision_policy_id"),
        ("status", "status"),
    ):
        op.create_index(f"ix_model_promotions_{name}", "model_promotions", [column], unique=False)
    for table, column in (
        ("model_training_runs", "registry_status"),
        ("model_training_runs", "configuration_fingerprint"),
        ("model_training_runs", "split_identifier"),
        ("experiment_runs", "registry_status"),
        ("experiment_runs", "configuration_fingerprint"),
        ("experiment_runs", "split_identifier"),
        ("predictions", "model_configuration_fingerprint"),
    ):
        op.create_index(f"ix_{table}_{column}", table, [column], unique=False)

    bind = op.get_bind()
    for table, defaults in (
        ("model_training_runs", {"registry_status": "registered", "library_versions_json": "{}", "artifact_checksums_json": "{}", "artifact_integrity_status": "pending", "lifecycle_metadata_json": "{}"}),
        ("experiment_runs", {"registry_status": "registered", "library_versions_json": "{}", "artifact_checksums_json": "{}", "artifact_integrity_status": "pending", "lifecycle_metadata_json": "{}"}),
        ("decision_policies", {"policy_version": "1", "artifact_integrity_status": "pending"}),
        ("predictions", {"artifact_checksums_json": "{}"}),
    ):
        for column, value in defaults.items():
            bind.execute(sa.text(f"UPDATE {table} SET {column} = :value WHERE {column} IS NULL"), {"value": value})
    bind.execute(sa.text("UPDATE model_training_runs SET registry_status = CASE WHEN status = 'completed' THEN 'evaluated' WHEN status = 'failed' THEN 'failed' ELSE registry_status END"))
    bind.execute(sa.text("UPDATE experiment_runs SET registry_status = CASE WHEN status = 'completed' THEN 'evaluated' WHEN status = 'failed' THEN 'failed' ELSE registry_status END"))
    for table, columns in (
        ("model_training_runs", ["registry_status", "library_versions_json", "artifact_checksums_json", "artifact_integrity_status", "lifecycle_metadata_json"]),
        ("experiment_runs", ["registry_status", "library_versions_json", "artifact_checksums_json", "artifact_integrity_status", "lifecycle_metadata_json"]),
        ("decision_policies", ["policy_version", "artifact_integrity_status"]),
        ("predictions", ["artifact_checksums_json"]),
    ):
        with op.batch_alter_table(table) as batch:
            for column in columns:
                batch.alter_column(column, nullable=False)


def downgrade() -> None:
    for name in (
        "configuration_fingerprint",
        "registry_status",
        "split_identifier",
    ):
        op.drop_index(f"ix_model_training_runs_{name}", table_name="model_training_runs")
        op.drop_index(f"ix_experiment_runs_{name}", table_name="experiment_runs")
    op.drop_index("ix_predictions_model_configuration_fingerprint", table_name="predictions")
    for name, column in (
        ("model_reference_type", "model_reference_type"),
        ("model_reference_id", "model_reference_id"),
        ("decision_policy_id", "decision_policy_id"),
        ("status", "status"),
    ):
        op.drop_index(f"ix_model_promotions_{name}", table_name="model_promotions")
    op.drop_table("model_promotions")
    for table, columns in (
        ("predictions", ["artifact_checksums_json", "model_configuration_fingerprint", "calibration_artifact_checksum", "calibration_artifact_reference", "decision_policy_version"]),
        ("decision_policies", ["artifact_integrity_status", "calibration_artifact_checksum", "policy_version"]),
        ("experiment_runs", ["started_at", "archived_at", "lifecycle_metadata_json", "artifact_integrity_status", "artifact_checksums_json", "library_versions_json", "split_identifier", "configuration_fingerprint", "registry_status"]),
        ("model_training_runs", ["archived_at", "lifecycle_metadata_json", "artifact_integrity_status", "artifact_checksums_json", "library_versions_json", "split_identifier", "configuration_fingerprint", "registry_status"]),
    ):
        for column in columns:
            op.drop_column(table, column)
