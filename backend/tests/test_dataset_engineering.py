"""Synthetic dataset-engineering tests independent of production APS files."""

from collections.abc import Iterator
from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.exceptions import InvalidRequestError
from app.database.base import Base
from app.main import create_app
from app.services.dataset.ingestion import (
    DatasetValidationError,
    read_dataset,
    validate_compatible_schemas,
    validate_dataset_filename,
)
from app.services.dataset.service import DatasetService
from app.services.dataset.preprocessing import fit_preprocessing_pipeline
from app.services.dataset.profiling import (
    build_class_distribution,
    build_missing_values,
    build_quality,
    feature_summary,
)
from app.services.dataset.splitting import prepare_training_validation_splits


SYNTHETIC_CSV = """class,sensor_a,sensor_b,sensor_c
neg,1,?,0
pos,2,3,0
neg,1,?,0
pos,4,5,0
neg,5,6,0
pos,6,7,0
neg,7,8,0
pos,8,9,0
"""


def write_dataset(path: Path, content: str = SYNTHETIC_CSV) -> Path:
    path.write_text(content, encoding="utf-8")
    return path


def test_ingestion_handles_missing_values_and_rejects_invalid_schema(tmp_path: Path) -> None:
    source = write_dataset(tmp_path / "training.csv")
    ingested = read_dataset(source, dataset_type="training", expected_feature_count=3)

    assert ingested.feature_columns == ["sensor_a", "sensor_b", "sensor_c"]
    assert ingested.frame["sensor_b"].isna().sum() == 2
    assert ingested.info.header_line_number == 1
    assert len(ingested.info.fingerprint) == 64

    with pytest.raises(DatasetValidationError, match="Could not find a CSV header"):
        read_dataset(write_dataset(tmp_path / "no-target.csv", "sensor_a,sensor_b\n1,2\n"), dataset_type="custom")
    with pytest.raises(DatasetValidationError, match="Duplicate column"):
        read_dataset(write_dataset(tmp_path / "duplicate.csv", "class,sensor_a,sensor_a\nneg,1,2\n"), dataset_type="custom")
    with pytest.raises(DatasetValidationError, match="Non-numeric"):
        read_dataset(write_dataset(tmp_path / "invalid.csv", "class,sensor_a\nneg,not-a-number\n"), dataset_type="custom")
    with pytest.raises(DatasetValidationError, match="Unexpected target labels"):
        read_dataset(write_dataset(tmp_path / "label.csv", "class,sensor_a\nunknown,1\n"), dataset_type="custom")


def test_ingestion_preserves_schema_compatibility_and_filename_guard(tmp_path: Path) -> None:
    training = read_dataset(write_dataset(tmp_path / "training.csv"), dataset_type="training", expected_feature_count=3)
    testing = read_dataset(write_dataset(tmp_path / "testing.csv"), dataset_type="testing", expected_feature_count=3)
    validate_compatible_schemas(training, testing)

    assert validate_dataset_filename("sensor-data.csv") == "sensor-data.csv"
    with pytest.raises(DatasetValidationError):
        validate_dataset_filename("../sensor-data.csv")
    with pytest.raises(DatasetValidationError):
        validate_dataset_filename("sensor-data.txt")


def test_profile_reports_actual_quality_and_class_distribution(tmp_path: Path) -> None:
    ingested = read_dataset(write_dataset(tmp_path / "training.csv"), dataset_type="training", expected_feature_count=3)
    summary = feature_summary(ingested.frame, "sensor_c")
    missing = build_missing_values(ingested.frame, ingested.feature_columns)
    quality = build_quality(ingested.frame, ingested.target_column, ingested.feature_columns, "synthetic")
    distribution = build_class_distribution(ingested.frame, ingested.target_column)

    assert summary.is_constant is True
    assert missing.total_missing_values == 2
    assert quality.duplicate_row_count == 1
    assert "sensor_c" in quality.constant_features
    assert distribution.class_counts == {"neg": 4, "pos": 4}
    assert distribution.imbalance_ratio == "1.00:1 normal-to-failure"


def test_splitting_is_stratified_reproducible_and_disjoint(tmp_path: Path) -> None:
    ingested = read_dataset(write_dataset(tmp_path / "training.csv"), dataset_type="training", expected_feature_count=3)
    first = prepare_training_validation_splits(
        ingested.frame,
        target_column="class",
        dataset_id="synthetic",
        validation_ratio=0.25,
        random_seed=17,
    )
    second = prepare_training_validation_splits(
        ingested.frame,
        target_column="class",
        dataset_id="synthetic",
        validation_ratio=0.25,
        random_seed=17,
    )

    assert first.summaries[0].fingerprint == second.summaries[0].fingerprint
    assert first.summaries[1].fingerprint == second.summaries[1].fingerprint
    assert set(first.training.index).isdisjoint(first.validation.index)
    assert [item.record_count for item in first.summaries] == [6, 2]
    with pytest.raises(InvalidRequestError, match="less than 0.5"):
        prepare_training_validation_splits(ingested.frame, target_column="class", dataset_id="synthetic", validation_ratio=0.5)


def test_preprocessing_fits_only_on_training_and_supports_strategies() -> None:
    training = pd.DataFrame({"sensor_a": [1.0, 3.0], "sensor_b": [10.0, 20.0]})
    validation = pd.DataFrame({"sensor_a": [None, 100.0], "sensor_b": [30.0, 40.0]})

    fitted = fit_preprocessing_pipeline(
        training,
        ["sensor_a", "sensor_b"],
        strategy="median",
        model_kind="random_forest",
    )
    transformed = fitted.pipeline.transform(validation)
    assert transformed[0, 0] == 2.0
    assert fitted.feature_names_after == ["sensor_a", "sensor_b"]

    all_missing = fit_preprocessing_pipeline(
        pd.DataFrame({"sensor_a": [1.0, 3.0], "sensor_b": [None, None]}),
        ["sensor_a", "sensor_b"],
        strategy="median",
        model_kind="random_forest",
    )
    assert all_missing.feature_names_after == ["sensor_a", "sensor_b"]

    indicators = fit_preprocessing_pipeline(
        pd.DataFrame({"sensor_a": [1.0, None], "sensor_b": [10.0, 20.0]}),
        ["sensor_a", "sensor_b"],
        strategy="missingness_indicators",
        model_kind="random_forest",
    )
    assert len(indicators.feature_names_after) == 3

    native = fit_preprocessing_pipeline(
        validation,
        ["sensor_a", "sensor_b"],
        strategy="native",
        model_kind="xgboost",
    )
    assert native.pipeline.transform(validation).shape == (2, 2)
    with pytest.raises(InvalidRequestError, match="reserved"):
        fit_preprocessing_pipeline(training, ["sensor_a", "sensor_b"], strategy="native", model_kind="random_forest")


@pytest.fixture
def dataset_client(test_settings: Settings) -> Iterator[TestClient]:
    """Create an isolated API with a small configured training CSV."""

    test_settings.expected_feature_count = 3
    test_settings.raw_dataset_dir.mkdir(parents=True, exist_ok=True)
    write_dataset(test_settings.raw_dataset_dir / test_settings.training_dataset_filename)
    write_dataset(
        test_settings.raw_dataset_dir / test_settings.official_test_dataset_filename,
        SYNTHETIC_CSV.replace("8,9,0", "8,9,1"),
    )
    application = create_app(test_settings)
    with TestClient(application) as test_client:
        Base.metadata.create_all(application.state.engine)
        with application.state.session_factory() as session:
            DatasetService(test_settings, session).sync_configured_datasets(include_testing=True)
        yield test_client


def test_dataset_api_profiles_preprocesses_and_imports_without_production_data(dataset_client: TestClient) -> None:
    response = dataset_client.get("/api/v1/datasets")
    assert response.status_code == 200
    listing = response.json()
    assert listing["total"] == 2
    datasets = {item["dataset_type"]: item["dataset_id"] for item in listing["items"]}
    dataset_id = datasets["training"]

    profile = dataset_client.get(f"/api/v1/datasets/{dataset_id}/profile")
    assert profile.status_code == 200
    assert profile.json()["class_distribution"]["class_counts"] == {"neg": 4, "pos": 4}

    assert dataset_client.get(f"/api/v1/datasets/{dataset_id}/quality").json()["duplicate_row_count"] == 1
    assert dataset_client.get(f"/api/v1/datasets/{dataset_id}/missing-values").json()["total_missing_values"] == 2
    assert dataset_client.get(f"/api/v1/datasets/{dataset_id}/class-distribution").status_code == 200
    assert dataset_client.get(f"/api/v1/datasets/{dataset_id}/features?page_size=2").json()["total"] == 3
    assert dataset_client.get(f"/api/v1/datasets/{dataset_id}/features/sensor_a").status_code == 200

    preprocessing = dataset_client.post(
        f"/api/v1/datasets/{dataset_id}/preprocess",
        json={"strategy": "median", "model_kind": "random_forest", "output_format": "csv", "random_seed": 11},
    )
    assert preprocessing.status_code == 201, preprocessing.text
    assert preprocessing.json()["train_records"] == 6
    assert preprocessing.json()["validation_records"] == 2

    splits = dataset_client.get(f"/api/v1/datasets/{dataset_id}/splits")
    assert splits.status_code == 200
    assert [item["record_count"] for item in splits.json()["splits"]] == [6, 2]
    assert "official APS test dataset was not loaded" in splits.json()["test_isolation_note"]
    status = dataset_client.get(f"/api/v1/datasets/{dataset_id}/preprocessing-status")
    assert status.status_code == 200
    assert len(status.json()["runs"]) == 1
    assert status.json()["runs"][0]["train_records"] == 6
    assert status.json()["runs"][0]["validation_records"] == 2

    isolated_test_preprocessing = dataset_client.post(
        f"/api/v1/datasets/{datasets['testing']}/preprocess",
        json={"strategy": "median", "model_kind": "random_forest", "output_format": "csv"},
    )
    assert isolated_test_preprocessing.status_code == 400

    imported = dataset_client.post(
        "/api/v1/datasets/import",
        files={"file": ("custom.csv", SYNTHETIC_CSV.encode("utf-8"), "text/csv")},
    )
    assert imported.status_code == 201, imported.text
    assert imported.json()["dataset"]["dataset_type"] == "custom"

    invalid_upload = dataset_client.post(
        "/api/v1/datasets/import",
        files={"file": ("../unsafe.txt", b"class,sensor_a\nneg,1\n", "text/plain")},
    )
    assert invalid_upload.status_code == 400


def test_dataset_listing_reads_persisted_metadata_without_opening_official_test_csv(
    dataset_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services.dataset import service as dataset_service_module

    original_read_dataset = dataset_service_module.read_dataset

    def fail_if_official_test_is_read(path: Path, *args: object, **kwargs: object):
        if path.name == "aps_failure_test_set.csv":
            raise AssertionError("dataset listing must not open the official APS test CSV")
        return original_read_dataset(path, *args, **kwargs)

    monkeypatch.setattr(dataset_service_module, "read_dataset", fail_if_official_test_is_read)
    response = dataset_client.get("/api/v1/datasets")

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 2
