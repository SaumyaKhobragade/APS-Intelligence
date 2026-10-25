"""create comparative experiment registry

Revision ID: 20261025_0003
Revises: 20261025_0002
Create Date: 2026-10-26
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261025_0003"
down_revision: Union[str, None] = "20261025_0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "experiment_runs",
        sa.Column("experiment_id", sa.String(length=80), nullable=False),
        sa.Column("model_name", sa.String(length=64), nullable=False),
        sa.Column("model_version", sa.String(length=64), nullable=False),
        sa.Column("dataset_id", sa.String(length=80), nullable=False),
        sa.Column("dataset_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("imbalance_strategy", sa.String(length=32), nullable=False),
        sa.Column("preprocessing_strategy", sa.String(length=64), nullable=False),
        sa.Column("optimize_hyperparameters", sa.Boolean(), nullable=False),
        sa.Column("random_seed", sa.Integer(), nullable=False),
        sa.Column("validation_ratio", sa.Float(), nullable=False),
        sa.Column("threshold", sa.Float(), nullable=False),
        sa.Column("false_positive_cost", sa.Float(), nullable=False),
        sa.Column("false_negative_cost", sa.Float(), nullable=False),
        sa.Column("search_budget", sa.Integer(), nullable=False),
        sa.Column("cv_folds", sa.Integer(), nullable=False),
        sa.Column("artifact_directory", sa.String(length=1024), nullable=False),
        sa.Column("pipeline_artifact_path", sa.String(length=1024), nullable=False),
        sa.Column("preprocessor_artifact_path", sa.String(length=1024), nullable=False),
        sa.Column("metadata_artifact_path", sa.String(length=1024), nullable=False),
        sa.Column("split_metadata_path", sa.String(length=1024), nullable=False),
        sa.Column("curves_artifact_path", sa.String(length=1024), nullable=False),
        sa.Column("feature_importance_artifact_path", sa.String(length=1024), nullable=False),
        sa.Column("confusion_matrix_visualization_path", sa.String(length=1024), nullable=False),
        sa.Column("configuration_json", sa.Text(), nullable=False),
        sa.Column("best_parameters_json", sa.Text(), nullable=False),
        sa.Column("search_results_json", sa.Text(), nullable=False),
        sa.Column("metrics_json", sa.Text(), nullable=True),
        sa.Column("curves_json", sa.Text(), nullable=True),
        sa.Column("feature_importance_json", sa.Text(), nullable=False),
        sa.Column("training_records", sa.Integer(), nullable=False),
        sa.Column("validation_records", sa.Integer(), nullable=False),
        sa.Column("training_class_counts_json", sa.Text(), nullable=False),
        sa.Column("validation_class_counts_json", sa.Text(), nullable=False),
        sa.Column("training_duration_seconds", sa.Float(), nullable=True),
        sa.Column("inference_duration_seconds", sa.Float(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["dataset_id"], ["dataset_metadata.dataset_id"]),
        sa.PrimaryKeyConstraint("experiment_id"),
    )
    for name, column in (
        ("model_name", "model_name"),
        ("dataset_id", "dataset_id"),
        ("dataset_fingerprint", "dataset_fingerprint"),
        ("status", "status"),
        ("imbalance_strategy", "imbalance_strategy"),
        ("preprocessing_strategy", "preprocessing_strategy"),
    ):
        op.create_index(f"ix_experiment_runs_{name}", "experiment_runs", [column], unique=False)


def downgrade() -> None:
    for name in (
        "preprocessing_strategy",
        "imbalance_strategy",
        "status",
        "dataset_fingerprint",
        "dataset_id",
        "model_name",
    ):
        op.drop_index(f"ix_experiment_runs_{name}", table_name="experiment_runs")
    op.drop_table("experiment_runs")
