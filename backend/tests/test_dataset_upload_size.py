"""Tests for dataset upload size limits, streaming enforcement, and cleanup."""

from collections.abc import Iterator
from pathlib import Path
from unittest.mock import patch

import pytest
import starlette.datastructures
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.database.base import Base
from app.models.dataset import DatasetMetadata
from app.main import create_app
from app.services.dataset.service import DatasetService

VALID_SMALL_CSV = """class,sensor_a,sensor_b,sensor_c
neg,1,2,0
pos,2,3,0
neg,4,5,0
pos,6,7,0
"""

INVALID_HEADER_CSV = """id,val_a,val_b,val_c
1,2,3,4
5,6,7,8
"""


@pytest.fixture
def upload_client(test_settings: Settings) -> Iterator[TestClient]:
    test_settings.expected_feature_count = 3
    test_settings.raw_dataset_dir.mkdir(parents=True, exist_ok=True)
    test_settings.max_dataset_upload_bytes = 52_428_800  # Default 50 MiB

    application = create_app(test_settings)
    with TestClient(application, raise_server_exceptions=False) as client:
        Base.metadata.create_all(application.state.engine)
        with application.state.session_factory() as session:
            DatasetService(test_settings, session).sync_configured_datasets(include_testing=False)
        yield client


def test_default_upload_limit_configuration(upload_client: TestClient) -> None:
    settings = upload_client.app.state.settings
    assert settings.max_dataset_upload_bytes == 52_428_800


def test_upload_within_size_limit_succeeds(upload_client: TestClient) -> None:
    settings = upload_client.app.state.settings
    response = upload_client.post(
        "/api/v1/datasets/import",
        files={"file": ("valid_small.csv", VALID_SMALL_CSV.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 201, response.text
    data = response.json()
    assert data["dataset"]["dataset_type"] == "custom"
    saved_source_name = data["dataset"]["source_file_name"]

    matching_files = list(settings.raw_dataset_dir.glob(f"*{saved_source_name}"))
    assert len(matching_files) == 1
    assert matching_files[0].exists()

    # Database record must exist
    with upload_client.app.state.session_factory() as session:
        record = session.query(DatasetMetadata).filter_by(source_file_name=saved_source_name).first()
        assert record is not None
        assert record.dataset_type == "custom"


def test_upload_exceeding_limit_returns_413_and_cleans_up_disk(upload_client: TestClient) -> None:
    settings = upload_client.app.state.settings
    # Set limit low for testing (e.g., 300 bytes)
    settings.max_dataset_upload_bytes = 300

    oversized_data = VALID_SMALL_CSV * 20  # ~1.5 KB > 300 bytes
    target_filename = "oversized_dataset.csv"

    response = upload_client.post(
        "/api/v1/datasets/import",
        files={"file": (target_filename, oversized_data.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 413, response.text
    body = response.json()
    assert body["error"]["code"] == "payload_too_large"
    assert "50 MiB" in body["error"]["message"] or "300 bytes" in body["error"]["message"]

    # Ensure no file matching target_filename was left on disk
    leftover_files = list(settings.raw_dataset_dir.glob(f"*{target_filename}"))
    assert leftover_files == [], "Partially streamed file must be deleted upon exceeding size limit"

    # Ensure no database record was persisted
    with upload_client.app.state.session_factory() as session:
        record = session.query(DatasetMetadata).filter(DatasetMetadata.source_file_name.like(f"%{target_filename}%")).first()
        assert record is None, "No metadata record should be persisted for rejected upload"


def test_upload_boundary_exact_limit(upload_client: TestClient) -> None:
    settings = upload_client.app.state.settings
    content = VALID_SMALL_CSV.encode("utf-8")
    exact_size = len(content)

    # 1. Exactly at limit: succeeds
    settings.max_dataset_upload_bytes = exact_size
    response = upload_client.post(
        "/api/v1/datasets/import",
        files={"file": ("at_limit.csv", content, "text/csv")},
    )
    assert response.status_code == 201, response.text
    saved_source_name = response.json()["dataset"]["source_file_name"]
    matching = list(settings.raw_dataset_dir.glob(f"*{saved_source_name}"))
    assert len(matching) == 1

    # 2. Limit minus 1 (content exceeds by 1 byte): rejected with 413
    settings.max_dataset_upload_bytes = exact_size - 1
    response = upload_client.post(
        "/api/v1/datasets/import",
        files={"file": ("over_limit_by_one.csv", content, "text/csv")},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"
    leftover = list(settings.raw_dataset_dir.glob("*over_limit_by_one.csv"))
    assert leftover == []


def test_upload_rejects_unsafe_and_non_csv_filenames(upload_client: TestClient) -> None:
    # Directory traversal
    resp = upload_client.post(
        "/api/v1/datasets/import",
        files={"file": ("../traversal.csv", VALID_SMALL_CSV.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 400

    # Non-csv extension
    resp = upload_client.post(
        "/api/v1/datasets/import",
        files={"file": ("data.txt", VALID_SMALL_CSV.encode("utf-8"), "text/plain")},
    )
    assert resp.status_code == 400


def test_upload_cleans_up_on_streaming_error(upload_client: TestClient) -> None:
    settings = upload_client.app.state.settings
    target_filename = "stream_abort.csv"

    call_count = 0

    async def faulty_read(self, size: int = -1) -> bytes:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return b"class,sensor_a,sensor_b,sensor_c\n"
        raise ConnectionResetError("Client aborted connection")

    with patch.object(starlette.datastructures.UploadFile, "read", faulty_read):
        resp = upload_client.post(
            "/api/v1/datasets/import",
            files={"file": (target_filename, b"dummy content", "text/csv")},
        )
        assert resp.status_code == 500

    # Confirm destination file was cleaned up
    leftovers = list(settings.raw_dataset_dir.glob(f"*{target_filename}"))
    assert leftovers == [], "Destination file must be removed when streaming aborts"


def test_upload_cleans_up_temporary_file_on_registration_failure(upload_client: TestClient) -> None:
    settings = upload_client.app.state.settings
    target_filename = "invalid_schema.csv"

    response = upload_client.post(
        "/api/v1/datasets/import",
        files={"file": (target_filename, INVALID_HEADER_CSV.encode("utf-8"), "text/csv")},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "dataset_validation_error"

    # Temporary file written to disk must be unlinked when registration validation fails
    leftover_files = list(settings.raw_dataset_dir.glob(f"*{target_filename}"))
    assert leftover_files == [], "Temporary file must be deleted if registration validation fails"

    # Ensure no database record was created
    with upload_client.app.state.session_factory() as session:
        record = session.query(DatasetMetadata).filter(DatasetMetadata.source_file_name.like(f"%{target_filename}%")).first()
        assert record is None, "No metadata record should exist for failed registration"


def test_upload_file_resource_closed_on_lifecycle_outcomes(upload_client: TestClient) -> None:
    close_call_count = 0
    original_close = starlette.datastructures.UploadFile.close

    async def tracked_close(self):
        nonlocal close_call_count
        close_call_count += 1
        return await original_close(self)

    with patch.object(starlette.datastructures.UploadFile, "close", tracked_close):
        # 1. Success case
        resp = upload_client.post(
            "/api/v1/datasets/import",
            files={"file": ("close_test_success.csv", VALID_SMALL_CSV.encode("utf-8"), "text/csv")},
        )
        assert resp.status_code == 201
        assert close_call_count >= 1
        count_after_1 = close_call_count

        # 2. Oversized payload (413) case
        upload_client.app.state.settings.max_dataset_upload_bytes = 10
        resp = upload_client.post(
            "/api/v1/datasets/import",
            files={"file": ("close_test_oversize.csv", VALID_SMALL_CSV.encode("utf-8"), "text/csv")},
        )
        assert resp.status_code == 413
        assert close_call_count > count_after_1
        count_after_2 = close_call_count

        # 3. Registration error (400) case
        upload_client.app.state.settings.max_dataset_upload_bytes = 52_428_800
        resp = upload_client.post(
            "/api/v1/datasets/import",
            files={"file": ("close_test_invalid.csv", INVALID_HEADER_CSV.encode("utf-8"), "text/csv")},
        )
        assert resp.status_code == 400
        assert close_call_count > count_after_2


def test_upload_immutable_aps_reference_files_guard(upload_client: TestClient) -> None:
    settings = upload_client.app.state.settings
    # Attempting to import as 'training' or 'testing' must be rejected
    resp = upload_client.post(
        "/api/v1/datasets/import?dataset_type=training",
        files={"file": ("training_overwrite.csv", VALID_SMALL_CSV.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 400
    assert "immutable" in resp.json()["error"]["message"]

    leftovers = list(settings.raw_dataset_dir.glob("*training_overwrite.csv"))
    assert leftovers == []
