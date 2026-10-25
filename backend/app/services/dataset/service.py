"""Dataset engineering orchestration over filesystem artifacts and metadata."""

from datetime import datetime, timezone
import json
from pathlib import Path
import uuid

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import InvalidRequestError, ResourceNotFoundError
from app.models.dataset import DatasetMetadata, PreprocessingRun
from app.schemas.datasets import (
    DatasetKind,
    DatasetProfileResponse,
    DatasetSummary,
    FeatureDetailResponse,
    FeaturePageResponse,
    PreprocessingRequest,
    PreprocessingRunResponse,
    PreprocessingStatusResponse,
    SplitSummary,
    SplitsResponse,
)
from app.services.dataset.artifacts import read_json, relative_artifact_path, write_json
from app.services.dataset.ingestion import DatasetValidationError, IngestedDataset, read_dataset, validate_compatible_schemas
from app.services.dataset.preprocessing import fit_preprocessing_pipeline, save_preprocessor
from app.services.dataset.profiling import feature_detail, feature_summary, profile_dataset
from app.services.dataset.splitting import prepare_training_validation_splits


class DatasetService:
    """Application service coordinating ingestion, profiling and preprocessing."""

    def __init__(self, settings: Settings, session: Session) -> None:
        self.settings = settings
        self.session = session

    def _configured_path(self, dataset_type: DatasetKind) -> Path:
        if dataset_type == "training":
            return self.settings.raw_dataset_dir / self.settings.training_dataset_filename
        if dataset_type == "testing":
            return self.settings.raw_dataset_dir / self.settings.official_test_dataset_filename
        raise InvalidRequestError("Custom datasets must be imported through the import endpoint.")

    def _read_path(self, path: Path, dataset_type: DatasetKind) -> IngestedDataset:
        return read_dataset(
            path,
            dataset_type=dataset_type,
            target_column=self.settings.target_column,
            expected_feature_count=self.settings.expected_feature_count if dataset_type in {"training", "testing"} else None,
        )

    def _dataset_id(self, ingested: IngestedDataset) -> str:
        return f"{ingested.info.dataset_type}-{ingested.info.fingerprint[:16]}"

    def _summary(self, model: DatasetMetadata) -> DatasetSummary:
        return DatasetSummary.model_validate(model)

    def register_file(self, path: Path, dataset_type: DatasetKind, *, dataset_name: str | None = None) -> DatasetSummary:
        ingested = self._read_path(path, dataset_type)
        dataset_id = self._dataset_id(ingested)
        existing = self.session.get(DatasetMetadata, dataset_id)
        if existing is None:
            existing_by_fingerprint = self.session.scalar(select(DatasetMetadata).where(DatasetMetadata.fingerprint == ingested.info.fingerprint))
            existing = existing_by_fingerprint
        if existing is None:
            existing = DatasetMetadata(
                dataset_id=dataset_id,
                dataset_name=dataset_name or ingested.info.dataset_name,
                dataset_type=dataset_type,
                source_file_name=ingested.info.source_file_name,
                source_path=str(ingested.info.path.resolve()),
                fingerprint=ingested.info.fingerprint,
                file_size_bytes=ingested.info.file_size_bytes,
                record_count=len(ingested.frame),
                feature_count=len(ingested.feature_columns),
                target_column=ingested.target_column,
                status="ready",
                imported_at=datetime.now(timezone.utc).replace(tzinfo=None),
            )
            self.session.add(existing)
        else:
            existing.dataset_name = dataset_name or existing.dataset_name
            existing.source_path = str(ingested.info.path.resolve())
            existing.file_size_bytes = ingested.info.file_size_bytes
            existing.record_count = len(ingested.frame)
            existing.feature_count = len(ingested.feature_columns)
            existing.target_column = ingested.target_column
            existing.status = "ready"
        self.session.commit()
        self.session.refresh(existing)
        return self._summary(existing)

    def sync_configured_datasets(self) -> list[DatasetSummary]:
        configured: dict[DatasetKind, Path] = {}
        for dataset_type in ("training", "testing"):
            path = self._configured_path(dataset_type)  # type: ignore[arg-type]
            if path.exists():
                configured[dataset_type] = path  # type: ignore[index]
        if "training" in configured and "testing" in configured:
            validate_compatible_schemas(
                self._read_path(configured["training"], "training"),
                self._read_path(configured["testing"], "testing"),
            )
        summaries: list[DatasetSummary] = []
        for dataset_type, path in configured.items():
            summaries.append(self.register_file(path, dataset_type))
        return summaries

    def list_datasets(self, page: int, page_size: int, dataset_type: DatasetKind | None = None) -> tuple[list[DatasetSummary], int]:
        self.sync_configured_datasets()
        statement = select(DatasetMetadata).order_by(DatasetMetadata.imported_at.desc())
        if dataset_type:
            statement = statement.where(DatasetMetadata.dataset_type == dataset_type)
        records = list(self.session.scalars(statement))
        total = len(records)
        start = (page - 1) * page_size
        return [self._summary(record) for record in records[start : start + page_size]], total

    def get_metadata(self, dataset_id: str) -> DatasetMetadata:
        self.sync_configured_datasets()
        model = self.session.get(DatasetMetadata, dataset_id)
        if model is None:
            raise ResourceNotFoundError(f"Dataset '{dataset_id}' was not found.")
        return model

    def load(self, dataset_id: str) -> tuple[DatasetMetadata, IngestedDataset]:
        metadata = self.get_metadata(dataset_id)
        try:
            dataset_type = metadata.dataset_type  # type: ignore[assignment]
            return metadata, self._read_path(Path(metadata.source_path), dataset_type)
        except DatasetValidationError:
            raise
        except OSError as exc:
            raise DatasetValidationError(f"Dataset file could not be read: {metadata.source_file_name}.") from exc

    def profile(self, dataset_id: str) -> DatasetProfileResponse:
        metadata, ingested = self.load(dataset_id)
        metadata.status = "profiled"
        summary = self._summary(metadata)
        profile = profile_dataset(ingested, summary)
        profile_path = self.settings.dataset_metadata_dir / dataset_id / "profile.json"
        write_json(profile_path, profile.model_dump(mode="json"))
        metadata.profile_path = relative_artifact_path(profile_path, self.settings.dataset_metadata_dir)
        metadata.metadata_path = metadata.profile_path
        self.session.commit()
        return profile

    def features(self, dataset_id: str, page: int, page_size: int, search: str | None = None) -> FeaturePageResponse:
        profile = self.profile(dataset_id)
        items = profile.profile.items
        if search:
            query = search.lower()
            items = [item for item in items if query in item.feature_name.lower()]
        total = len(items)
        start = (page - 1) * page_size
        return FeaturePageResponse(items=items[start : start + page_size], total=total, page=page, page_size=page_size, search=search)

    def feature(self, dataset_id: str, feature_name: str) -> FeatureDetailResponse:
        _, ingested = self.load(dataset_id)
        if feature_name not in ingested.feature_columns:
            raise ResourceNotFoundError(f"Feature '{feature_name}' was not found in dataset '{dataset_id}'.")
        return feature_detail(ingested.frame, feature_name, feature_summary(ingested.frame, feature_name), ingested.feature_columns)

    def splits(self, dataset_id: str) -> SplitsResponse:
        metadata = self.get_metadata(dataset_id)
        run = self.session.scalar(select(PreprocessingRun).where(PreprocessingRun.dataset_id == dataset_id).order_by(PreprocessingRun.created_at.desc()))
        if run is None:
            raise ResourceNotFoundError(f"No preprocessing split has been prepared for dataset '{dataset_id}'.")
        payload = read_json(Path(run.split_metadata_path))
        summaries = [SplitSummary.model_validate(item) for item in payload["splits"]]
        return SplitsResponse(dataset_id=metadata.dataset_id, validation_ratio=run.validation_ratio, random_seed=run.random_seed, test_isolation_note=payload["test_isolation_note"], splits=summaries)

    def preprocessing_status(self, dataset_id: str) -> PreprocessingStatusResponse:
        self.get_metadata(dataset_id)
        runs = list(self.session.scalars(select(PreprocessingRun).where(PreprocessingRun.dataset_id == dataset_id).order_by(PreprocessingRun.created_at.desc())))
        responses = [self._preprocessing_response(run) for run in runs]
        return PreprocessingStatusResponse(dataset_id=dataset_id, runs=responses)

    def preprocess(self, dataset_id: str, request: PreprocessingRequest) -> PreprocessingRunResponse:
        metadata, ingested = self.load(dataset_id)
        if metadata.dataset_type != "training":
            raise InvalidRequestError("Preprocessing and split preparation must start from the official training dataset; the test set remains isolated.")
        prepared = prepare_training_validation_splits(
            ingested.frame,
            target_column=ingested.target_column,
            dataset_id=dataset_id,
            validation_ratio=request.validation_ratio,
            random_seed=request.random_seed,
        )
        features = ingested.feature_columns
        fitted = fit_preprocessing_pipeline(
            prepared.training,
            features,
            strategy=request.strategy,
            model_kind=request.model_kind,
            constant_value=request.constant_value,
            add_missingness_indicators=request.add_missingness_indicators,
        )
        run_id = f"prep-{uuid.uuid4().hex[:16]}"
        processed_dir = self.settings.processed_dataset_dir / run_id
        artifact_dir = self.settings.model_artifact_dir / "preprocessing" / run_id
        processed_dir.mkdir(parents=True, exist_ok=True)
        artifact_dir.mkdir(parents=True, exist_ok=True)
        train_matrix = fitted.pipeline.transform(prepared.training[features])
        validation_matrix = fitted.pipeline.transform(prepared.validation[features])
        train_output = pd.DataFrame(train_matrix, columns=fitted.feature_names_after, index=prepared.training.index)
        validation_output = pd.DataFrame(validation_matrix, columns=fitted.feature_names_after, index=prepared.validation.index)
        train_output[ingested.target_column] = prepared.training[ingested.target_column]
        validation_output[ingested.target_column] = prepared.validation[ingested.target_column]
        suffix = "parquet" if request.output_format == "parquet" else "csv"
        train_path = processed_dir / f"training.{suffix}"
        validation_path = processed_dir / f"validation.{suffix}"
        if request.output_format == "parquet":
            train_output.to_parquet(train_path, index=False)
            validation_output.to_parquet(validation_path, index=False)
        else:
            train_output.to_csv(train_path, index=False)
            validation_output.to_csv(validation_path, index=False)
        preprocessor_path = save_preprocessor(fitted, artifact_dir / "preprocessor.joblib")
        split_path = self.settings.split_storage_dir / f"{run_id}.json"
        split_payload = {
            "run_id": run_id,
            "source_dataset_id": dataset_id,
            "source_dataset_fingerprint": metadata.fingerprint,
            "validation_ratio": request.validation_ratio,
            "random_seed": request.random_seed,
            "test_isolation_note": "The official APS test dataset was not loaded, fitted, transformed or used in this preparation run.",
            "splits": [summary.model_dump(mode="json") for summary in prepared.summaries],
            "processed_artifacts": [str(train_path), str(validation_path)],
            "preprocessor_artifact": str(preprocessor_path),
        }
        write_json(split_path, split_payload)
        configuration = {
            **request.model_dump(),
            "feature_names_before": features,
            "feature_names_after": fitted.feature_names_after,
            "fit_scope": "training split only",
            "train_records": len(prepared.training),
            "validation_records": len(prepared.validation),
        }
        run = PreprocessingRun(
            run_id=run_id,
            dataset_id=dataset_id,
            strategy=request.strategy,
            model_kind=request.model_kind,
            validation_ratio=request.validation_ratio,
            random_seed=request.random_seed,
            status="completed",
            artifact_directory=str(artifact_dir),
            split_metadata_path=str(split_path),
            configuration_json=json.dumps(configuration),
        )
        self.session.add(run)
        metadata.status = "preprocessed"
        self.session.commit()
        return self._preprocessing_response(run, feature_count_before=len(features), feature_count_after=len(fitted.feature_names_after), train_records=len(prepared.training), validation_records=len(prepared.validation))

    def _preprocessing_response(self, run: PreprocessingRun, **overrides: int) -> PreprocessingRunResponse:
        config = json.loads(run.configuration_json)
        return PreprocessingRunResponse(
            run_id=run.run_id,
            dataset_id=run.dataset_id,
            strategy=run.strategy,  # type: ignore[arg-type]
            model_kind=run.model_kind,  # type: ignore[arg-type]
            validation_ratio=run.validation_ratio,
            random_seed=run.random_seed,
            status=run.status,  # type: ignore[arg-type]
            feature_count_before=overrides.get("feature_count_before", len(config.get("feature_names_before", []))),
            feature_count_after=overrides.get("feature_count_after", len(config.get("feature_names_after", []))),
            train_records=overrides.get("train_records", config.get("train_records", 0)),
            validation_records=overrides.get("validation_records", config.get("validation_records", 0)),
            artifact_directory=run.artifact_directory,
            split_metadata_path=run.split_metadata_path,
            leakage_prevention="Preprocessing parameters were fit on the training split only; validation data was transformed with the fitted training transformer; official test data was isolated.",
            message="Preprocessing completed without modifying raw data.",
        )
