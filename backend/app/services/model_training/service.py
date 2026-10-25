"""Reproducible model-training orchestration and registry operations."""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import time
from typing import Any
from uuid import uuid4

import pandas as pd
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import InvalidRequestError, ResourceNotFoundError
from app.database.session import create_database_engine, create_session_factory
from app.models.training import ModelTrainingRun
from app.schemas.models import (
    EvaluationMetricsResponse,
    ModelCatalogItem,
    ModelCatalogResponse,
    ModelName,
    ModelVersionsResponse,
    TrainingRequest,
    TrainingRunDetailResponse,
    TrainingRunListResponse,
    TrainingRunSummary,
    TrainingStatusResponse,
)
from app.services.dataset.service import DatasetService
from app.services.dataset.splitting import prepare_training_validation_splits
from app.services.model_training.artifacts import (
    TrainingArtifactPaths,
    load_joblib,
    save_joblib,
    save_json,
    training_artifact_paths,
)
from app.services.model_training.evaluation import evaluate_binary_classifier
from app.services.model_training.trainers.base import ImbalanceSettings
from app.services.model_training.trainers.registry import get_trainer, list_trainers


logger = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TrainingService:
    """Coordinate dataset loading, preprocessing, fitting, evaluation and registry writes."""

    def __init__(self, settings: Settings, session: Session) -> None:
        self.settings = settings
        self.session = session
        self.datasets = DatasetService(settings, session)

    def _training_dataset(self, dataset_id: str) -> tuple[Any, Any]:
        # This deliberately syncs only the configured training file. The official
        # test file is never loaded by a training request.
        self.datasets.sync_configured_datasets(include_testing=False)
        metadata = self.datasets.get_metadata(dataset_id, sync=False)
        if metadata.dataset_type == "testing":
            raise InvalidRequestError("The official APS test dataset is isolated and cannot be used for training.")
        _, ingested = self.datasets.load(dataset_id, sync=False)
        return metadata, ingested

    @staticmethod
    def _resolve_imbalance(request: TrainingRequest, frame: pd.DataFrame, target_column: str) -> ImbalanceSettings:
        negative_count = int((frame[target_column] == "neg").sum())
        positive_count = int((frame[target_column] == "pos").sum())
        if positive_count == 0 or negative_count == 0:
            raise InvalidRequestError("Training requires both neg and pos target classes.")
        balanced_ratio = negative_count / positive_count
        if request.class_imbalance.mode == "balanced":
            negative_weight = 1.0
            positive_weight = balanced_ratio
        elif request.class_imbalance.mode == "custom":
            negative_weight = request.class_imbalance.negative_weight
            positive_weight = request.class_imbalance.positive_weight
        else:
            negative_weight = 1.0
            positive_weight = 1.0
        explicit_scale = request.class_imbalance.scale_pos_weight
        scale_pos_weight = explicit_scale if explicit_scale is not None else positive_weight / negative_weight
        return ImbalanceSettings(
            mode=request.class_imbalance.mode,
            negative_weight=negative_weight,
            positive_weight=positive_weight,
            scale_pos_weight=scale_pos_weight,
        )

    @staticmethod
    def _validate_hyperparameters(request: TrainingRequest) -> tuple[Any, dict[str, Any]]:
        try:
            trainer = get_trainer(request.model_name)
            validated = trainer.validate_hyperparameters(request.hyperparameters)
        except (ValueError, TypeError) as exc:
            raise InvalidRequestError(str(exc)) from exc
        return trainer, validated.model_dump(mode="json")

    def create_queued_run(self, request: TrainingRequest) -> ModelTrainingRun:
        metadata, ingested = self._training_dataset(request.dataset_id)
        trainer, hyperparameters = self._validate_hyperparameters(request)
        imbalance = self._resolve_imbalance(request, ingested.frame, ingested.target_column)
        run_id = f"run-{uuid4().hex[:20]}"
        paths = training_artifact_paths(self.settings.model_artifact_dir, run_id)
        preprocessing_configuration = {
            "strategy": request.preprocessing_strategy,
            "constant_value": request.constant_value,
            "add_missingness_indicators": request.add_missingness_indicators,
            "fit_scope": "training split only",
        }
        imbalance_configuration = {
            "requested": request.class_imbalance.model_dump(mode="json"),
            "resolved": imbalance.model_dump(mode="json"),
            "negative_records": int((ingested.frame[ingested.target_column] == "neg").sum()),
            "positive_records": int((ingested.frame[ingested.target_column] == "pos").sum()),
            "resampling": "none",
        }
        run = ModelTrainingRun(
            run_id=run_id,
            model_name=trainer.name,
            model_version=trainer.version,
            dataset_id=metadata.dataset_id,
            dataset_fingerprint=metadata.fingerprint,
            status="queued",
            random_seed=request.random_seed,
            validation_ratio=request.validation_ratio,
            threshold=request.threshold,
            false_positive_cost=request.false_positive_cost,
            false_negative_cost=request.false_negative_cost,
            artifact_directory=str(paths.directory),
            model_artifact_path=str(paths.model),
            preprocessor_artifact_path=str(paths.preprocessor),
            metadata_artifact_path=str(paths.metadata),
            split_metadata_path=str(paths.split_metadata),
            preprocessing_configuration_json=json.dumps(preprocessing_configuration),
            hyperparameters_json=json.dumps(hyperparameters),
            class_imbalance_configuration_json=json.dumps(imbalance_configuration),
            feature_names_before_json=json.dumps([]),
            feature_names_after_json=json.dumps([]),
            training_records=0,
            validation_records=0,
            created_at=utc_now(),
        )
        self.session.add(run)
        self.session.commit()
        self.session.refresh(run)
        return run

    def execute_run(self, run_id: str, request: TrainingRequest) -> ModelTrainingRun:
        run = self.session.get(ModelTrainingRun, run_id)
        if run is None:
            raise ResourceNotFoundError(f"Training run '{run_id}' was not found.")
        started_at = utc_now()
        started_clock = time.perf_counter()
        run.status = "running"
        run.started_at = started_at
        run.error_message = None
        self.session.commit()
        try:
            metadata, ingested = self._training_dataset(request.dataset_id)
            if metadata.dataset_id != run.dataset_id or metadata.fingerprint != run.dataset_fingerprint:
                raise InvalidRequestError("The dataset changed after the training run was queued; the run was rejected.")
            trainer, hyperparameters = self._validate_hyperparameters(request)
            imbalance = self._resolve_imbalance(request, ingested.frame, ingested.target_column)
            prepared = prepare_training_validation_splits(
                ingested.frame,
                target_column=ingested.target_column,
                dataset_id=metadata.dataset_id,
                validation_ratio=request.validation_ratio,
                random_seed=request.random_seed,
            )
            feature_names = list(ingested.feature_columns)
            from app.services.dataset.preprocessing import fit_preprocessing_pipeline

            fitted = fit_preprocessing_pipeline(
                prepared.training,
                feature_names,
                strategy=request.preprocessing_strategy,
                model_kind=request.model_name,
                constant_value=request.constant_value,
                add_missingness_indicators=request.add_missingness_indicators,
            )
            training_features = pd.DataFrame(
                fitted.pipeline.transform(prepared.training[feature_names]),
                columns=fitted.feature_names_after,
                index=prepared.training.index,
            )
            validation_features = pd.DataFrame(
                fitted.pipeline.transform(prepared.validation[feature_names]),
                columns=fitted.feature_names_after,
                index=prepared.validation.index,
            )
            training_target = prepared.training[ingested.target_column].map(lambda value: 0 if value == "neg" else 1).astype(int).to_numpy()
            validation_target = prepared.validation[ingested.target_column].map(lambda value: 0 if value == "neg" else 1).astype(int).to_numpy()
            estimator = trainer.build_estimator(
                trainer.validate_hyperparameters(hyperparameters),
                imbalance=imbalance,
                random_seed=request.random_seed,
            )
            estimator.fit(training_features, training_target)
            probabilities = estimator.predict_proba(validation_features)[:, 1]
            metrics = evaluate_binary_classifier(
                validation_target.tolist(),
                probabilities.tolist(),
                threshold=request.threshold,
                false_positive_cost=request.false_positive_cost,
                false_negative_cost=request.false_negative_cost,
            )
            paths = training_artifact_paths(self.settings.model_artifact_dir, run_id)
            paths.directory.mkdir(parents=True, exist_ok=True)
            save_joblib(estimator, paths.model)
            save_joblib(fitted.pipeline, paths.preprocessor)
            split_payload = {
                "run_id": run_id,
                "dataset_id": metadata.dataset_id,
                "dataset_fingerprint": metadata.fingerprint,
                "validation_ratio": request.validation_ratio,
                "random_seed": request.random_seed,
                "splits": [summary.model_dump(mode="json") for summary in prepared.summaries],
                "test_isolation_note": "The official APS test dataset was not loaded, fitted, transformed or used in this training run.",
            }
            save_json(split_payload, paths.split_metadata)
            duration = time.perf_counter() - started_clock
            preprocessing_configuration = {
                "strategy": request.preprocessing_strategy,
                "constant_value": request.constant_value,
                "add_missingness_indicators": request.add_missingness_indicators,
                "fit_scope": "training split only",
                "feature_names_before": feature_names,
                "feature_names_after": fitted.feature_names_after,
            }
            imbalance_configuration = {
                "requested": request.class_imbalance.model_dump(mode="json"),
                "resolved": imbalance.model_dump(mode="json"),
                "negative_records": int((ingested.frame[ingested.target_column] == "neg").sum()),
                "positive_records": int((ingested.frame[ingested.target_column] == "pos").sum()),
                "resampling": "none",
            }
            metadata_payload = {
                "run_id": run_id,
                "model_name": trainer.name,
                "model_version": trainer.version,
                "dataset_id": metadata.dataset_id,
                "dataset_fingerprint": metadata.fingerprint,
                "random_seed": request.random_seed,
                "validation_ratio": request.validation_ratio,
                "threshold": request.threshold,
                "preprocessing_configuration": preprocessing_configuration,
                "hyperparameters": hyperparameters,
                "class_imbalance_configuration": imbalance_configuration,
                "metrics": metrics.model_dump(mode="json"),
                "training_duration_seconds": duration,
                "training_records": len(prepared.training),
                "validation_records": len(prepared.validation),
                "artifacts": {
                    "model": str(paths.model),
                    "preprocessor": str(paths.preprocessor),
                    "metadata": str(paths.metadata),
                    "splits": str(paths.split_metadata),
                },
                "test_isolation_note": split_payload["test_isolation_note"],
            }
            save_json(metadata_payload, paths.metadata)
            run.status = "completed"
            run.metrics_json = json.dumps(metrics.model_dump(mode="json"))
            run.confusion_matrix_json = json.dumps(metrics.confusion_matrix.model_dump(mode="json"))
            run.preprocessing_configuration_json = json.dumps(preprocessing_configuration)
            run.hyperparameters_json = json.dumps(hyperparameters)
            run.class_imbalance_configuration_json = json.dumps(imbalance_configuration)
            run.feature_names_before_json = json.dumps(feature_names)
            run.feature_names_after_json = json.dumps(fitted.feature_names_after)
            run.training_records = len(prepared.training)
            run.validation_records = len(prepared.validation)
            run.training_duration_seconds = duration
            run.completed_at = utc_now()
            run.model_artifact_path = str(paths.model)
            run.preprocessor_artifact_path = str(paths.preprocessor)
            run.metadata_artifact_path = str(paths.metadata)
            run.split_metadata_path = str(paths.split_metadata)
            self.session.commit()
            self.session.refresh(run)
            return run
        except Exception as exc:
            duration = time.perf_counter() - started_clock
            run.status = "failed"
            run.training_duration_seconds = duration
            run.completed_at = utc_now()
            run.error_message = str(exc)
            self.session.commit()
            logger.exception("Training run %s failed", run_id)
            return run

    def get_run(self, run_id: str) -> ModelTrainingRun:
        run = self.session.get(ModelTrainingRun, run_id)
        if run is None:
            raise ResourceNotFoundError(f"Training run '{run_id}' was not found.")
        return run

    @staticmethod
    def _metrics(run: ModelTrainingRun) -> EvaluationMetricsResponse | None:
        if not run.metrics_json:
            return None
        return EvaluationMetricsResponse.model_validate(json.loads(run.metrics_json))

    def summary(self, run: ModelTrainingRun) -> TrainingRunSummary:
        metrics = self._metrics(run)
        return TrainingRunSummary(
            run_id=run.run_id,
            model_name=run.model_name,  # type: ignore[arg-type]
            model_version=run.model_version,
            dataset_id=run.dataset_id,
            dataset_fingerprint=run.dataset_fingerprint,
            status=run.status,  # type: ignore[arg-type]
            random_seed=run.random_seed,
            validation_ratio=run.validation_ratio,
            threshold=run.threshold,
            primary_metric=metrics.pr_auc if metrics else None,
            training_duration_seconds=run.training_duration_seconds,
            created_at=run.created_at,
            started_at=run.started_at,
            completed_at=run.completed_at,
        )

    def detail(self, run_id: str) -> TrainingRunDetailResponse:
        run = self.get_run(run_id)
        return TrainingRunDetailResponse(
            **self.summary(run).model_dump(),
            preprocessing_configuration=json.loads(run.preprocessing_configuration_json),
            hyperparameters=json.loads(run.hyperparameters_json),
            class_imbalance_configuration=json.loads(run.class_imbalance_configuration_json),
            metrics=self._metrics(run),
            artifacts={
                "model_artifact_path": run.model_artifact_path,
                "preprocessor_artifact_path": run.preprocessor_artifact_path,
                "metadata_artifact_path": run.metadata_artifact_path,
                "split_metadata_path": run.split_metadata_path,
                "artifact_directory": run.artifact_directory,
            },
            feature_names_before=json.loads(run.feature_names_before_json),
            feature_names_after=json.loads(run.feature_names_after_json),
            training_records=run.training_records,
            validation_records=run.validation_records,
            test_isolation_note="The official APS test dataset is isolated from training, preprocessing, model selection and tuning.",
            error_message=run.error_message,
        )

    def list_runs(self, page: int, page_size: int, model_name: ModelName | None = None, status: str | None = None) -> TrainingRunListResponse:
        statement = select(ModelTrainingRun).order_by(desc(ModelTrainingRun.created_at))
        count_statement = select(func.count()).select_from(ModelTrainingRun)
        if model_name:
            statement = statement.where(ModelTrainingRun.model_name == model_name)
            count_statement = count_statement.where(ModelTrainingRun.model_name == model_name)
        if status:
            statement = statement.where(ModelTrainingRun.status == status)
            count_statement = count_statement.where(ModelTrainingRun.status == status)
        total = int(self.session.scalar(count_statement) or 0)
        records = list(self.session.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
        return TrainingRunListResponse(items=[self.summary(record) for record in records], total=total, page=page, page_size=page_size)

    def status(self, run_id: str) -> TrainingStatusResponse:
        run = self.get_run(run_id)
        message = {
            "queued": "Training run is queued.",
            "running": "Training run is in progress.",
            "completed": "Training run completed successfully.",
            "failed": run.error_message or "Training run failed.",
        }[run.status]
        return TrainingStatusResponse(
            run_id=run.run_id,
            status=run.status,  # type: ignore[arg-type]
            message=message,
            started_at=run.started_at,
            completed_at=run.completed_at,
            training_duration_seconds=run.training_duration_seconds,
        )

    def metrics(self, run_id: str) -> EvaluationMetricsResponse:
        run = self.get_run(run_id)
        metrics = self._metrics(run)
        if metrics is None:
            raise InvalidRequestError("Evaluation metrics are available only after a training run completes.")
        return metrics

    def catalog(self) -> ModelCatalogResponse:
        items: list[ModelCatalogItem] = []
        for trainer in list_trainers():
            versions = list(self.session.scalars(select(ModelTrainingRun.model_version).where(ModelTrainingRun.model_name == trainer["name"], ModelTrainingRun.status == "completed").distinct()))
            count = int(self.session.scalar(select(func.count()).select_from(ModelTrainingRun).where(ModelTrainingRun.model_name == trainer["name"], ModelTrainingRun.status == "completed")) or 0)
            items.append(ModelCatalogItem(model_name=trainer["name"], display_name=trainer["display_name"], trainer_version=trainer["version"], available_versions=sorted(set([trainer["version"], *versions])), completed_run_count=count))  # type: ignore[arg-type]
        return ModelCatalogResponse(items=items)

    def versions(self, model_name: ModelName) -> ModelVersionsResponse:
        get_trainer(model_name)
        versions = list(self.session.scalars(select(ModelTrainingRun.model_version).where(ModelTrainingRun.model_name == model_name, ModelTrainingRun.status == "completed").distinct()))
        trainer_version = get_trainer(model_name).version
        return ModelVersionsResponse(model_name=model_name, versions=sorted(set([trainer_version, *versions])))

    def load_artifacts(self, run_id: str) -> tuple[Any, Any]:
        run = self.get_run(run_id)
        if run.status != "completed":
            raise InvalidRequestError("Artifacts are available only after a training run completes.")
        return load_joblib(Path(run.model_artifact_path)), load_joblib(Path(run.preprocessor_artifact_path))


def execute_training_background(settings: Settings, run_id: str, request: TrainingRequest) -> None:
    """Run training in a worker thread with a session local to that worker."""

    engine = create_database_engine(settings)
    session = create_session_factory(engine)()
    try:
        TrainingService(settings, session).execute_run(run_id, request)
    finally:
        session.close()
        engine.dispose()
