"""Controlled imbalance, preprocessing and hyperparameter experiments."""

from datetime import datetime, timezone
import json
import logging
from pathlib import Path
import random
import statistics
import time
from typing import Any, cast
from uuid import uuid4

import matplotlib
import pandas as pd
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbalancedPipeline
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold
from sklearn.metrics import average_precision_score
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import InvalidRequestError, ResourceNotFoundError
from app.database.session import create_database_engine, create_session_factory
from app.models.experiment import ExperimentRun
from app.schemas.experiments import (
    CurveDataResponse,
    ExperimentArtifactMetadata,
    ExperimentBatchResponse,
    ExperimentComparisonResponse,
    ExperimentConfigurationResponse,
    ExperimentListResponse,
    ExperimentRequest,
    ExperimentRunDetailResponse,
    ExperimentRunSummary,
    FeatureImportanceItem,
    ImbalanceStrategy,
)
from app.schemas.models import ConfusionMatrixResponse, EvaluationMetricsResponse, ModelName
from app.services.dataset.preprocessing import build_preprocessing_pipeline
from app.services.dataset.service import DatasetService
from app.services.dataset.splitting import prepare_training_validation_splits
from app.services.model_training.artifacts import (
    ExperimentArtifactPaths,
    experiment_artifact_paths,
    load_json,
    load_joblib,
    save_joblib,
    save_json,
)
from app.services.model_training.evaluation import build_curve_data, evaluate_binary_classifier
from app.services.model_training.trainers.base import ImbalanceSettings
from app.services.model_training.trainers.registry import get_trainer
from app.services.reproducibility import checksum_paths, configuration_fingerprint, dependency_versions


logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _class_counts(values: pd.Series) -> dict[str, int]:
    return {str(key): int(value) for key, value in values.value_counts().to_dict().items()}


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if hasattr(value, "item"):
        return _json_safe(value.item())
    return value


def _search_space(model_name: str) -> dict[str, list[Any]]:
    spaces: dict[str, dict[str, list[Any]]] = {
        "logistic_regression": {"model__C": [0.1, 0.5, 1.0, 2.0, 10.0]},
        "random_forest": {
            "model__n_estimators": [50, 100, 200],
            "model__max_depth": [None, 8, 16, 32],
            "model__min_samples_leaf": [1, 2, 5],
        },
        "xgboost": {
            "model__n_estimators": [50, 100, 200],
            "model__max_depth": [3, 5, 7],
            "model__learning_rate": [0.03, 0.05, 0.1],
            "model__subsample": [0.8, 1.0],
            "model__colsample_bytree": [0.8, 1.0],
        },
        "catboost": {
            "model__iterations": [50, 100, 200],
            "model__depth": [4, 6, 8],
            "model__learning_rate": [0.03, 0.05, 0.1],
            "model__l2_leaf_reg": [1.0, 3.0, 10.0],
        },
    }
    return spaces[model_name]


def _sample_search_parameters(search_space: dict[str, list[Any]], budget: int, seed: int) -> list[dict[str, Any]]:
    """Sample bounded candidate combinations deterministically."""

    import itertools

    candidates = [dict(zip(search_space, values)) for values in itertools.product(*search_space.values())]
    random.Random(seed).shuffle(candidates)
    return candidates[: min(budget, len(candidates))]


def _feature_importance(fitted_pipeline: Any) -> list[FeatureImportanceItem]:
    preprocessor = fitted_pipeline.named_steps["preprocessor"]
    model = fitted_pipeline.named_steps["model"]
    names = [str(value) for value in preprocessor.get_feature_names_out()]
    if hasattr(model, "feature_importances_"):
        values = [float(value) for value in model.feature_importances_]
        importance_type = "feature_importance"
    elif hasattr(model, "coef_"):
        coefficients = model.coef_[0]
        values = [abs(float(value)) for value in coefficients]
        importance_type = "absolute_coefficient"
    else:
        return []
    pairs = sorted(zip(names, values), key=lambda pair: pair[1], reverse=True)
    return [FeatureImportanceItem(feature_name=name, importance=value, importance_type=importance_type) for name, value in pairs[:50]]  # type: ignore[arg-type]


def _save_confusion_visualization(path: Path, metrics: EvaluationMetricsResponse) -> Path:
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    matrix = metrics.confusion_matrix.matrix
    figure, axis = plt.subplots(figsize=(4, 4))
    image = axis.imshow(matrix, cmap="Blues")
    figure.colorbar(image, ax=axis)
    axis.set(
        xticks=[0, 1],
        yticks=[0, 1],
        xticklabels=["neg", "pos"],
        yticklabels=["neg", "pos"],
        xlabel="Predicted",
        ylabel="Actual",
        title="Validation confusion matrix",
    )
    for row in range(2):
        for column in range(2):
            axis.text(column, row, matrix[row][column], ha="center", va="center")
    path.parent.mkdir(parents=True, exist_ok=True)
    figure.tight_layout()
    figure.savefig(path, format="svg")
    plt.close(figure)
    return path


class ExperimentService:
    """Manage immutable experiment configurations, runs and comparisons."""

    def __init__(self, settings: Settings, session: Session) -> None:
        self.settings = settings
        self.session = session
        self.datasets = DatasetService(settings, session)

    def _training_dataset(self, dataset_id: str) -> tuple[Any, Any]:
        self.datasets.sync_configured_datasets(include_testing=False)
        metadata = self.datasets.get_metadata(dataset_id, sync=False)
        if metadata.dataset_type == "testing":
            raise InvalidRequestError("The official APS test dataset is isolated and cannot be used for experimentation.")
        _, ingested = self.datasets.load(dataset_id, sync=False)
        return metadata, ingested

    def _operating_configuration(self, request: ExperimentRequest) -> tuple[float, float, float]:
        return (
            request.threshold if request.threshold is not None else self.settings.default_classification_threshold,
            request.false_positive_cost if request.false_positive_cost is not None else self.settings.false_positive_cost,
            request.false_negative_cost if request.false_negative_cost is not None else self.settings.false_negative_cost,
        )

    @staticmethod
    def _resolve_imbalance(request: ExperimentRequest, frame: pd.DataFrame, target_column: str) -> ImbalanceSettings:
        if request.imbalance_strategy != "class_weight":
            return ImbalanceSettings(mode="none")
        negative_count = int((frame[target_column] == "neg").sum())
        positive_count = int((frame[target_column] == "pos").sum())
        if not positive_count or not negative_count:
            raise InvalidRequestError("Experiment training requires both neg and pos target classes.")
        if request.class_imbalance.mode == "balanced":
            positive_weight = negative_count / positive_count
            negative_weight = 1.0
        elif request.class_imbalance.mode == "custom":
            positive_weight = request.class_imbalance.positive_weight
            negative_weight = request.class_imbalance.negative_weight
        else:
            positive_weight = 1.0
            negative_weight = 1.0
        scale = request.class_imbalance.scale_pos_weight or positive_weight / negative_weight
        return ImbalanceSettings(mode=request.class_imbalance.mode, negative_weight=negative_weight, positive_weight=positive_weight, scale_pos_weight=scale)

    def _build_pipeline(self, request: ExperimentRequest, features: list[str], frame: pd.DataFrame, target_column: str) -> ImbalancedPipeline:
        trainer = get_trainer(request.model_name)
        try:
            config = trainer.validate_hyperparameters(request.hyperparameters)
        except (ValueError, TypeError) as exc:
            raise InvalidRequestError(str(exc)) from exc
        imbalance = self._resolve_imbalance(request, frame, target_column)
        estimator = trainer.build_estimator(config, imbalance=imbalance, random_seed=request.random_seed)
        phase2_pipeline = build_preprocessing_pipeline(
            features,
            strategy=request.preprocessing_strategy,
            model_kind=request.model_name,
            constant_value=request.constant_value,
            add_missingness_indicators=request.add_missingness_indicators,
        )
        # imblearn Pipeline intentionally rejects a nested sklearn Pipeline as
        # an intermediate step. Reuse Phase 2's configured ColumnTransformer,
        # which preserves the same fitted preprocessing behavior without
        # introducing a second preprocessing implementation.
        steps: list[tuple[str, Any]] = [("preprocessor", phase2_pipeline.named_steps["features"])]
        if request.imbalance_strategy == "smote":
            steps.append(("sampler", SMOTE(random_state=request.random_seed, k_neighbors=request.smote_k_neighbors)))
        steps.append(("model", estimator))
        return ImbalancedPipeline(steps=steps)

    def _validated_hyperparameters(self, request: ExperimentRequest) -> dict[str, Any]:
        trainer = get_trainer(request.model_name)
        try:
            return trainer.validate_hyperparameters(request.hyperparameters).model_dump(mode="json")
        except (ValueError, TypeError) as exc:
            raise InvalidRequestError(str(exc)) from exc

    def _manual_catboost_search(
        self,
        request: ExperimentRequest,
        feature_names: list[str],
        frame: pd.DataFrame,
        target_column: str,
        train_x: pd.DataFrame,
        train_y: Any,
    ) -> tuple[Any, dict[str, Any], list[dict[str, Any]]]:
        """Search CatBoost without sklearn cloning its mutable class_weights list."""

        search_space = _search_space(request.model_name)
        candidates = _sample_search_parameters(search_space, request.search_budget, request.random_seed)
        splitter = StratifiedKFold(n_splits=request.cv_folds, shuffle=True, random_state=request.random_seed)
        fold_results: list[dict[str, Any]] = []
        for candidate in candidates:
            scores: list[float] = []
            for train_indices, validation_indices in splitter.split(train_x, train_y):
                fold_pipeline = self._build_pipeline(request, feature_names, frame, target_column)
                fold_pipeline.set_params(**candidate)
                fold_pipeline.fit(train_x.iloc[train_indices], train_y[train_indices])
                fold_probabilities = fold_pipeline.predict_proba(train_x.iloc[validation_indices])[:, 1]
                scores.append(float(average_precision_score(train_y[validation_indices], fold_probabilities)))
            fold_results.append({
                "params": _json_safe(candidate),
                "mean_test_pr_auc": sum(scores) / len(scores),
                "std_test_pr_auc": float(statistics.pstdev(scores)),
            })
        fold_results.sort(key=lambda result: result["mean_test_pr_auc"], reverse=True)
        for rank, result in enumerate(fold_results, start=1):
            result["rank"] = rank
        best_parameters = fold_results[0]["params"]
        fitted = self._build_pipeline(request, feature_names, frame, target_column)
        fitted.set_params(**best_parameters)
        fitted.fit(train_x, train_y)
        return fitted, {key.removeprefix("model__"): value for key, value in best_parameters.items()}, fold_results

    def create_queued(self, request: ExperimentRequest) -> ExperimentRun:
        metadata, ingested = self._training_dataset(request.dataset_id)
        trainer = get_trainer(request.model_name)
        self._validated_hyperparameters(request)
        threshold, false_positive_cost, false_negative_cost = self._operating_configuration(request)
        experiment_id = f"exp-{uuid4().hex[:20]}"
        paths = experiment_artifact_paths(self.settings.model_artifact_dir, experiment_id)
        configuration = request.model_dump(mode="json")
        configuration["resolved_hyperparameters"] = self._validated_hyperparameters(request)
        configuration["feature_names_before"] = list(ingested.feature_columns)
        configuration["test_isolation_note"] = "The official APS test dataset is isolated from experimentation."
        configuration_fp = configuration_fingerprint(
            {
                "schema_version": 1,
                "dataset_fingerprint": metadata.fingerprint,
                "configuration": configuration,
            }
        )
        run = ExperimentRun(
            experiment_id=experiment_id,
            model_name=trainer.name,
            model_version=trainer.version,
            dataset_id=metadata.dataset_id,
            dataset_fingerprint=metadata.fingerprint,
            status="queued",
            registry_status="registered",
            imbalance_strategy=request.imbalance_strategy,
            preprocessing_strategy=request.preprocessing_strategy,
            optimize_hyperparameters=request.optimize_hyperparameters,
            random_seed=request.random_seed,
            validation_ratio=request.validation_ratio,
            threshold=threshold,
            false_positive_cost=false_positive_cost,
            false_negative_cost=false_negative_cost,
            search_budget=request.search_budget,
            cv_folds=request.cv_folds,
            artifact_directory=str(paths.directory),
            pipeline_artifact_path=str(paths.pipeline),
            preprocessor_artifact_path=str(paths.preprocessor),
            metadata_artifact_path=str(paths.metadata),
            split_metadata_path=str(paths.split_metadata),
            curves_artifact_path=str(paths.curves),
            feature_importance_artifact_path=str(paths.feature_importance),
            confusion_matrix_visualization_path=str(paths.confusion_matrix_visualization),
            configuration_json=json.dumps(configuration),
            best_parameters_json="{}",
            search_results_json="[]",
            feature_importance_json="[]",
            training_class_counts_json="{}",
            validation_class_counts_json="{}",
            created_at=_utc_now(),
            configuration_fingerprint=configuration_fp,
            library_versions_json=json.dumps(dependency_versions()),
            artifact_checksums_json="{}",
            artifact_integrity_status="pending",
            lifecycle_metadata_json="{}",
        )
        self.session.add(run)
        self.session.commit()
        self.session.refresh(run)
        return run

    def execute(self, experiment_id: str, request: ExperimentRequest) -> ExperimentRun:
        run = self.session.get(ExperimentRun, experiment_id)
        if run is None:
            raise ResourceNotFoundError(f"Experiment '{experiment_id}' was not found.")
        started = time.perf_counter()
        run.status = "running"
        run.started_at = _utc_now()
        self.session.commit()
        try:
            metadata, ingested = self._training_dataset(request.dataset_id)
            if metadata.dataset_id != run.dataset_id or metadata.fingerprint != run.dataset_fingerprint:
                raise InvalidRequestError("The dataset changed after the experiment was queued; the experiment was rejected.")
            prepared = prepare_training_validation_splits(
                ingested.frame,
                target_column=ingested.target_column,
                dataset_id=metadata.dataset_id,
                validation_ratio=request.validation_ratio,
                random_seed=request.random_seed,
            )
            feature_names = list(ingested.feature_columns)
            train_x = cast(pd.DataFrame, prepared.training[feature_names])
            validation_x = cast(pd.DataFrame, prepared.validation[feature_names])
            train_y = prepared.training[ingested.target_column].map(lambda value: 0 if value == "neg" else 1).astype(int).to_numpy()
            validation_y = prepared.validation[ingested.target_column].map(lambda value: 0 if value == "neg" else 1).astype(int).to_numpy()
            pipeline = self._build_pipeline(request, feature_names, ingested.frame, ingested.target_column)
            best_parameters: dict[str, Any] = self._validated_hyperparameters(request)
            search_results: list[dict[str, Any]] = []
            if request.optimize_hyperparameters and request.model_name == "catboost":
                fitted, best_parameters, search_results = self._manual_catboost_search(
                    request,
                    feature_names,
                    ingested.frame,
                    ingested.target_column,
                    train_x,
                    train_y,
                )
            elif request.optimize_hyperparameters:
                search = RandomizedSearchCV(
                    pipeline,
                    param_distributions=_search_space(request.model_name),
                    n_iter=request.search_budget,
                    scoring="average_precision",
                    cv=StratifiedKFold(n_splits=request.cv_folds, shuffle=True, random_state=request.random_seed),
                    random_state=request.random_seed,
                    n_jobs=request.search_n_jobs,
                    refit=True,
                    return_train_score=False,
                )
                search.fit(train_x, train_y)
                fitted = search.best_estimator_
                best_parameters = {key.removeprefix("model__"): _json_safe(value) for key, value in search.best_params_.items()}
                ranking = sorted(
                    zip(search.cv_results_["params"], search.cv_results_["mean_test_score"], search.cv_results_["std_test_score"], search.cv_results_["rank_test_score"]),
                    key=lambda row: int(row[3]),
                )
                search_results = [
                    {"params": _json_safe(params), "mean_test_pr_auc": float(mean), "std_test_pr_auc": float(std), "rank": int(rank)}
                    for params, mean, std, rank in ranking[:20]
                ]
            else:
                fit_started = time.perf_counter()
                pipeline.fit(train_x, train_y)
                fitted = pipeline
                fit_elapsed = time.perf_counter() - fit_started
                search_results = [{"params": best_parameters, "mean_test_pr_auc": None, "std_test_pr_auc": None, "rank": 1, "search_skipped": True, "fit_duration_seconds": fit_elapsed}]
            inference_started = time.perf_counter()
            probabilities = fitted.predict_proba(validation_x)[:, 1]
            inference_duration = time.perf_counter() - inference_started
            threshold = run.threshold
            metrics = evaluate_binary_classifier(
                validation_y.tolist(),
                probabilities.tolist(),
                threshold=threshold,
                false_positive_cost=run.false_positive_cost,
                false_negative_cost=run.false_negative_cost,
            )
            curves = build_curve_data(validation_y.tolist(), probabilities.tolist())
            importance = _feature_importance(fitted)
            paths = experiment_artifact_paths(self.settings.model_artifact_dir, experiment_id)
            paths.directory.mkdir(parents=True, exist_ok=True)
            save_joblib(fitted, paths.pipeline)
            save_joblib(fitted.named_steps["preprocessor"], paths.preprocessor)
            split_payload = {
                "experiment_id": experiment_id,
                "dataset_id": metadata.dataset_id,
                "dataset_fingerprint": metadata.fingerprint,
                "validation_ratio": request.validation_ratio,
                "random_seed": request.random_seed,
                "imbalance_strategy": request.imbalance_strategy,
                "training_class_counts": _class_counts(cast(pd.Series, prepared.training[ingested.target_column])),
                "validation_class_counts": _class_counts(cast(pd.Series, prepared.validation[ingested.target_column])),
                "validation_distribution_preserved": True,
                "splits": [summary.model_dump(mode="json") for summary in prepared.summaries],
                "test_isolation_note": "The official APS test dataset was not loaded, fitted, transformed or used in this experiment.",
            }
            save_json(split_payload, paths.split_metadata)
            save_json(curves, paths.curves)
            save_json([item.model_dump(mode="json") for item in importance], paths.feature_importance)
            _save_confusion_visualization(paths.confusion_matrix_visualization, metrics)
            duration = time.perf_counter() - started
            configuration = {
                **request.model_dump(mode="json"),
                "resolved_hyperparameters": self._validated_hyperparameters(request),
                "feature_names_before": feature_names,
                "feature_names_after": [str(value) for value in fitted.named_steps["preprocessor"].get_feature_names_out()],
                "fit_scope": "training split only",
                "cv_scope": "training split only",
                "resampling_scope": (
                    "training folds only"
                    if request.imbalance_strategy == "smote" and request.optimize_hyperparameters
                    else "training split only"
                    if request.imbalance_strategy == "smote"
                    else "none"
                ),
            }
            run.configuration_fingerprint = configuration_fingerprint(
                {
                    "schema_version": 1,
                    "dataset_fingerprint": metadata.fingerprint,
                    "configuration": configuration,
                }
            )
            metadata_payload = {
                "experiment_id": experiment_id,
                "configuration": configuration,
                "best_parameters": best_parameters,
                "search_results": search_results,
                "metrics": metrics.model_dump(mode="json"),
                "curves": curves,
                "feature_importance": [item.model_dump(mode="json") for item in importance],
                "training_duration_seconds": duration,
                "inference_duration_seconds": inference_duration,
                "artifacts": {"pipeline": str(paths.pipeline), "preprocessor": str(paths.preprocessor), "curves": str(paths.curves), "feature_importance": str(paths.feature_importance)},
                "test_isolation_note": split_payload["test_isolation_note"],
                "configuration_fingerprint": run.configuration_fingerprint,
                "library_versions": dependency_versions(),
            }
            checksums = checksum_paths(
                {
                    "pipeline": paths.pipeline,
                    "preprocessor": paths.preprocessor,
                    "splits": paths.split_metadata,
                    "curves": paths.curves,
                    "feature_importance": paths.feature_importance,
                    "confusion_matrix": paths.confusion_matrix_visualization,
                }
            )
            metadata_payload["artifact_checksums"] = checksums
            save_json(metadata_payload, paths.metadata)
            checksums["metadata"] = checksum_paths({"metadata": paths.metadata})["metadata"]
            split_identifier = "|".join(summary.fingerprint for summary in prepared.summaries)
            run.status = "completed"
            run.registry_status = "evaluated"
            run.configuration_json = json.dumps(configuration)
            run.best_parameters_json = json.dumps(best_parameters)
            run.search_results_json = json.dumps(search_results)
            run.metrics_json = json.dumps(metrics.model_dump(mode="json"))
            run.curves_json = json.dumps(curves)
            run.feature_importance_json = json.dumps([item.model_dump(mode="json") for item in importance])
            run.training_records = len(prepared.training)
            run.validation_records = len(prepared.validation)
            run.training_class_counts_json = json.dumps(split_payload["training_class_counts"])
            run.validation_class_counts_json = json.dumps(split_payload["validation_class_counts"])
            run.training_duration_seconds = duration
            run.inference_duration_seconds = inference_duration
            run.completed_at = _utc_now()
            run.split_identifier = split_identifier
            run.library_versions_json = json.dumps(dependency_versions())
            run.artifact_checksums_json = json.dumps(checksums)
            run.artifact_integrity_status = "verified"
            self.session.commit()
            self.session.refresh(run)
            return run
        except Exception as exc:
            run.status = "failed"
            run.registry_status = "failed"
            run.error_message = str(exc)
            run.artifact_integrity_status = "failed"
            run.training_duration_seconds = time.perf_counter() - started
            run.completed_at = _utc_now()
            self.session.commit()
            logger.exception("Experiment %s failed", experiment_id)
            return run

    def get_run(self, experiment_id: str) -> ExperimentRun:
        run = self.session.get(ExperimentRun, experiment_id)
        if run is None:
            raise ResourceNotFoundError(f"Experiment '{experiment_id}' was not found.")
        return run

    @staticmethod
    def _metrics(run: ExperimentRun) -> EvaluationMetricsResponse | None:
        return EvaluationMetricsResponse.model_validate(json.loads(run.metrics_json)) if run.metrics_json else None

    @staticmethod
    def _curves(run: ExperimentRun) -> CurveDataResponse | None:
        return CurveDataResponse.model_validate(json.loads(run.curves_json)) if run.curves_json else None

    @staticmethod
    def _importance(run: ExperimentRun) -> list[FeatureImportanceItem]:
        return [FeatureImportanceItem.model_validate(item) for item in json.loads(run.feature_importance_json)]

    def summary(self, run: ExperimentRun) -> ExperimentRunSummary:
        metrics = self._metrics(run)
        return ExperimentRunSummary(
            experiment_id=run.experiment_id,
            model_name=run.model_name,  # type: ignore[arg-type]
            model_version=run.model_version,
            dataset_id=run.dataset_id,
            dataset_fingerprint=run.dataset_fingerprint,
            status=run.status,  # type: ignore[arg-type]
            imbalance_strategy=run.imbalance_strategy,  # type: ignore[arg-type]
            preprocessing_strategy=run.preprocessing_strategy,  # type: ignore[arg-type]
            optimize_hyperparameters=run.optimize_hyperparameters,
            random_seed=run.random_seed,
            validation_ratio=run.validation_ratio,
            primary_metric=metrics.pr_auc if metrics else None,
            training_duration_seconds=run.training_duration_seconds,
            inference_duration_seconds=run.inference_duration_seconds,
            created_at=run.created_at,
            completed_at=run.completed_at,
        )

    def detail(self, experiment_id: str) -> ExperimentRunDetailResponse:
        run = self.get_run(experiment_id)
        configuration = json.loads(run.configuration_json)
        metrics = self._metrics(run)
        return ExperimentRunDetailResponse(
            **self.summary(run).model_dump(),
            configuration=configuration,
            best_parameters=json.loads(run.best_parameters_json),
            search_results=json.loads(run.search_results_json),
            metrics=metrics,
            confusion_matrix=metrics.confusion_matrix if metrics else None,
            curves=self._curves(run),
            feature_importance=self._importance(run),
            artifacts=ExperimentArtifactMetadata(
                artifact_directory=run.artifact_directory,
                pipeline_artifact_path=run.pipeline_artifact_path,
                preprocessor_artifact_path=run.preprocessor_artifact_path,
                metadata_artifact_path=run.metadata_artifact_path,
                split_metadata_path=run.split_metadata_path,
                curves_artifact_path=run.curves_artifact_path,
                feature_importance_artifact_path=run.feature_importance_artifact_path,
                confusion_matrix_visualization_path=run.confusion_matrix_visualization_path,
            ),
            training_records=run.training_records,
            validation_records=run.validation_records,
            training_class_counts=json.loads(run.training_class_counts_json),
            validation_class_counts=json.loads(run.validation_class_counts_json),
            validation_distribution_preserved=True,
            test_isolation_note="The official APS test dataset is isolated from experimentation, hyperparameter search and model comparison.",
            error_message=run.error_message,
        )

    def create_batch(self, requests: list[ExperimentRequest]) -> ExperimentBatchResponse:
        runs = [self.create_queued(request) for request in requests]
        return ExperimentBatchResponse(experiment_ids=[run.experiment_id for run in runs], message="Experiments queued without using the official APS test dataset.")

    def list_runs(self, page: int, page_size: int, model_name: ModelName | None = None, imbalance_strategy: ImbalanceStrategy | None = None) -> ExperimentListResponse:
        statement = select(ExperimentRun).order_by(desc(ExperimentRun.created_at))
        count_statement = select(func.count()).select_from(ExperimentRun)
        if model_name:
            statement = statement.where(ExperimentRun.model_name == model_name)
            count_statement = count_statement.where(ExperimentRun.model_name == model_name)
        if imbalance_strategy:
            statement = statement.where(ExperimentRun.imbalance_strategy == imbalance_strategy)
            count_statement = count_statement.where(ExperimentRun.imbalance_strategy == imbalance_strategy)
        total = int(self.session.scalar(count_statement) or 0)
        records = list(self.session.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
        return ExperimentListResponse(items=[self.summary(record) for record in records], total=total, page=page, page_size=page_size)

    def compare(self, experiment_ids: list[str]) -> ExperimentComparisonResponse:
        runs = [self.get_run(experiment_id) for experiment_id in experiment_ids]
        rows: list[ExperimentRunSummary] = []
        metric_rows: list[dict[str, Any]] = []
        for run in runs:
            rows.append(self.summary(run))
            metrics = self._metrics(run)
            if metrics:
                metric_rows.append({
                    "experiment_id": run.experiment_id,
                    "model_name": run.model_name,
                    "imbalance_strategy": run.imbalance_strategy,
                    "preprocessing_strategy": run.preprocessing_strategy,
                    "pr_auc": metrics.pr_auc,
                    "roc_auc": metrics.roc_auc,
                    "precision": metrics.precision,
                    "recall": metrics.recall,
                    "f1_score": metrics.f1_score,
                    "false_positives": metrics.confusion_matrix.false_positive,
                    "false_negatives": metrics.confusion_matrix.false_negative,
                    "estimated_business_cost": metrics.estimated_business_cost,
                    "training_duration_seconds": run.training_duration_seconds,
                    "inference_duration_seconds": run.inference_duration_seconds,
                })
        return ExperimentComparisonResponse(experiment_ids=experiment_ids, rows=rows, metric_rows=metric_rows)

    def configuration(self, experiment_id: str) -> ExperimentConfigurationResponse:
        run = self.get_run(experiment_id)
        return ExperimentConfigurationResponse(experiment_id=experiment_id, configuration=json.loads(run.configuration_json), best_parameters=json.loads(run.best_parameters_json), search_results=json.loads(run.search_results_json))

    def curves(self, experiment_id: str) -> CurveDataResponse:
        curves = self._curves(self.get_run(experiment_id))
        if curves is None:
            raise InvalidRequestError("Curves are available only after an experiment completes.")
        return curves

    def feature_importance(self, experiment_id: str) -> list[FeatureImportanceItem]:
        run = self.get_run(experiment_id)
        if run.status != "completed":
            raise InvalidRequestError("Feature importance is available only after an experiment completes.")
        return self._importance(run)

    def load_pipeline(self, experiment_id: str) -> Any:
        run = self.get_run(experiment_id)
        if run.status != "completed":
            raise InvalidRequestError("Experiment artifacts are available only after completion.")
        return load_joblib(Path(run.pipeline_artifact_path))


def execute_experiment_background(settings: Settings, experiment_id: str, request: ExperimentRequest) -> None:
    """Run one experiment in a worker-local session."""

    engine = create_database_engine(settings)
    session = create_session_factory(engine)()
    try:
        ExperimentService(settings, session).execute(experiment_id, request)
    finally:
        session.close()
        engine.dispose()
