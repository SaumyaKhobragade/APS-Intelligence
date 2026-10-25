"""create model training registry

Revision ID: 20261025_0002
Revises: 20261025_0001
Create Date: 2026-10-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261025_0002"
down_revision: Union[str, None] = "20261025_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "model_training_runs",
        sa.Column("run_id", sa.String(length=80), nullable=False),
        sa.Column("model_name", sa.String(length=64), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=80), nullable=False),
        sa.Column("dataset_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("random_seed", sa.Integer(), nullable=False),
        sa.Column("validation_ratio", sa.Float(), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("false_positive_cost", sa.Float(), nullable=False),
        sa.Column("false_negative_cost", sa.Float(), nullable=False),
        sa.Column("artifact_directory", sa.String(length=1024), nullable=False),
        sa.Column("model_artifact_path", sa.String(length=1024), nullable=False),
        sa.Column("preprocessor_artifact_path", sa.String(length=1024), nullable=False),
        sa.Column("metadata_artifact_path", sa.String(length=1024), nullable=False),
        sa.Column("split_metadata_path", sa.String(length=1024), nullable=False),
        sa.Column("preprocessing_configuration_json", sa.Text(), nullable=False),
        sa.Column("hyperparameters_json", sa.Text(), nullable=False),
        sa.Column("class_imbalance_configuration_json", sa.Text(), nullable=False),
        sa.Column("feature_names_before_json", sa.Text(), nullable=False),
        sa.Column("feature_names_after_json", sa.Text(), nullable=False),
        sa.Column("training_records", sa.Integer(), nullable=False),
        sa.Column("validation_records", sa.Integer(), nullable=False),
        sa.Column("metrics_json", sa.Text(), nullable=True),
        sa.Column("confusion_matrix_json", sa.Text(), nullable=True),
        sa.Column("training_duration_seconds", sa.Float(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["dataset_id"], ["dataset_metadata.dataset_id"]),
        sa.PrimaryKeyConstraint("run_id"),
    )
    op.create_index("ix_model_training_runs_model_name", "model_training_runs", ["model_name"], unique=False)
    op.create_index("ix_model_training_runs_dataset_id", "model_training_runs", ["dataset_id"], unique=False)
    op.create_index("ix_model_training_runs_dataset_fingerprint", "model_training_runs", ["dataset_fingerprint"], unique=False)
    op.create_index("ix_model_training_runs_status", "model_training_runs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_model_training_runs_status", table_name="model_training_runs")
    op.drop_index("ix_model_training_runs_dataset_fingerprint", table_name="model_training_runs")
    op.drop_index("ix_model_training_runs_dataset_id", table_name="model_training_runs")
    op.drop_index("ix_model_training_runs_model_name", table_name="model_training_runs")
    op.drop_table("model_training_runs")
