"""create dataset metadata and preprocessing run tables

Revision ID: 20261025_0001
Revises:
Create Date: 2026-10-25
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20261025_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "dataset_metadata",
        sa.Column("dataset_id", sa.String(length=80), nullable=False),
        sa.Column("dataset_name", sa.String(length=255), nullable=False),
        sa.Column("dataset_type", sa.String(length=32), nullable=False),
        sa.Column("source_file_name", sa.String(length=255), nullable=False),
        sa.Column("source_path", sa.String(length=1024), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("record_count", sa.Integer(), nullable=False),
        sa.Column("feature_count", sa.Integer(), nullable=False),
        sa.Column("target_column", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("metadata_path", sa.String(length=1024), nullable=True),
        sa.Column("profile_path", sa.String(length=1024), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("dataset_id"),
        sa.UniqueConstraint("fingerprint"),
    )
    op.create_index("ix_dataset_metadata_fingerprint", "dataset_metadata", ["fingerprint"], unique=True)
    op.create_index("ix_dataset_metadata_dataset_id", "dataset_metadata", ["dataset_id"], unique=False)
    op.create_table(
        "preprocessing_runs",
        sa.Column("run_id", sa.String(length=80), nullable=False),
        sa.Column("dataset_id", sa.String(length=80), nullable=False),
        sa.Column("strategy", sa.String(length=64), nullable=False),
        sa.Column("model_kind", sa.String(length=64), nullable=False),
        sa.Column("validation_ratio", sa.Float(), nullable=False),
        sa.Column("random_seed", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("artifact_directory", sa.String(length=1024), nullable=False),
        sa.Column("split_metadata_path", sa.String(length=1024), nullable=False),
        sa.Column("configuration_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["dataset_id"], ["dataset_metadata.dataset_id"]),
        sa.PrimaryKeyConstraint("run_id"),
    )
    op.create_index("ix_preprocessing_runs_dataset_id", "preprocessing_runs", ["dataset_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_preprocessing_runs_dataset_id", table_name="preprocessing_runs")
    op.drop_table("preprocessing_runs")
    op.drop_index("ix_dataset_metadata_dataset_id", table_name="dataset_metadata")
    op.drop_index("ix_dataset_metadata_fingerprint", table_name="dataset_metadata")
    op.drop_table("dataset_metadata")
