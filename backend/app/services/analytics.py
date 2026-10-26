"""Read-only, bounded analytics over persisted registry and report artifacts."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import InvalidRequestError, ResourceNotFoundError
from app.models.dataset import DatasetMetadata, PreprocessingRun
from app.models.experiment import ExperimentRun
from app.models.prediction import DecisionPolicy, PredictionRecord
from app.models.registry import ModelPromotion
from app.models.training import ModelTrainingRun
from app.schemas.analytics import (
    AvailabilityNote,
    DashboardResponse,
    DashboardValidationMetric,
    DatasetAnalyticsResponse,
    ModelComparisonItem,
    ModelComparisonResponse,
    RecentExperimentActivity,
    RecentPredictionActivity,
    ThresholdAnalyticsListItem,
    ThresholdAnalyticsListResponse,
    ThresholdAnalyticsResponse,
)
from app.schemas.datasets import DatasetProfileResponse, DatasetSummary, FeaturePageResponse, SplitsResponse, SplitSummary
from app.schemas.phase5 import CalibrationComparisonResponse, DecisionPolicyComparisonResponse, ThresholdAnalysisResponse
from app.services.dataset.artifacts import read_json
from app.services.model_training.artifacts import experiment_artifact_paths, phase5_artifact_paths, training_artifact_paths
from app.services.registry import ModelRegistryService
from app.services.reproducibility import parse_json_object


MODEL_FAMILIES = ["logistic_regression", "random_forest", "xgboost", "catboost"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _safe_json_text(value: str | None) -> Any:
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError):
        return None


def _safe_profile_path(settings: Settings, value: str | None) -> Path | None:
    if not value:
        return None
    root = settings.dataset_metadata_dir.resolve()
    path = Path(value)
    resolved = path.resolve() if path.is_absolute() else (root / path).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        return None
    return resolved


class AnalyticsService:
    """Aggregate already-recorded metadata without retraining or test loading."""

    def __init__(self, settings: Settings, session: Session) -> None:
        self.settings = settings
        self.session = session
        self.registry = ModelRegistryService(settings, session)

    def dashboard(self) -> DashboardResponse:
        datasets = list(self.session.scalars(select(DatasetMetadata).order_by(DatasetMetadata.imported_at.desc()).limit(20)))
        model_count = int(self.session.scalar(select(func.count()).select_from(ModelTrainingRun)) or 0)
        experiment_count = int(self.session.scalar(select(func.count()).select_from(ExperimentRun)) or 0)
        lifecycle_counts: dict[str, int] = {}
        for model in (ModelTrainingRun, ExperimentRun):
            rows = self.session.execute(select(model.registry_status, func.count()).group_by(model.registry_status)).all()
            for state, count in rows:
                lifecycle_counts[str(state or "unknown")] = lifecycle_counts.get(str(state or "unknown"), 0) + int(count)
        total_predictions = int(self.session.scalar(select(func.count()).select_from(PredictionRecord)) or 0)
        positive_predictions = int(self.session.scalar(select(func.count()).select_from(PredictionRecord).where(PredictionRecord.predicted_class == "pos")) or 0)
        negative_predictions = int(self.session.scalar(select(func.count()).select_from(PredictionRecord).where(PredictionRecord.predicted_class == "neg")) or 0)
        promotion = self.session.scalar(select(ModelPromotion).where(ModelPromotion.status == "active").order_by(ModelPromotion.promoted_at.desc()))
        current_promotion = self.registry._promotion_summary(promotion) if promotion else None

        recent_runs = list(self.session.scalars(select(ExperimentRun).order_by(ExperimentRun.created_at.desc()).limit(5)))
        recent_experiments = []
        for run in recent_runs:
            metrics = parse_json_object(run.metrics_json)
            recent_experiments.append(
                RecentExperimentActivity(
                    experiment_id=run.experiment_id,
                    model_name=run.model_name,
                    model_version=run.model_version,
                    status=run.status,
                    lifecycle_status=run.registry_status,
                    dataset_id=run.dataset_id,
                    configuration_fingerprint=run.configuration_fingerprint,
                    created_at=run.created_at,
                    completed_at=run.completed_at,
                    pr_auc=metrics.get("pr_auc"),
                )
            )
        recent_predictions = [
            RecentPredictionActivity(
                prediction_id=record.prediction_id,
                model_reference_type=record.model_reference_type,
                model_reference_id=record.model_reference_id,
                model_version=record.model_version,
                predicted_class=record.predicted_class,
                failure_probability=record.failure_probability,
                prediction_timestamp=record.prediction_timestamp,
            )
            for record in self.session.scalars(select(PredictionRecord).order_by(PredictionRecord.prediction_timestamp.desc()).limit(5))
        ]
        latest_metrics: list[DashboardValidationMetric] = []
        for reference_type, model in (("training_run", ModelTrainingRun), ("experiment", ExperimentRun)):
            run = self.session.scalar(select(model).where(model.status == "completed").order_by(model.completed_at.desc()).limit(1))
            if run is None or not run.metrics_json:
                continue
            metrics = parse_json_object(run.metrics_json)
            latest_metrics.append(
                DashboardValidationMetric(
                    reference_type=reference_type,  # type: ignore[arg-type]
                    reference_id=run.run_id if reference_type == "training_run" else run.experiment_id,
                    model_name=run.model_name,
                    model_version=run.model_version,
                    dataset_id=run.dataset_id,
                    split_identifier=run.split_identifier,
                    pr_auc=metrics.get("pr_auc"),
                    roc_auc=metrics.get("roc_auc"),
                    precision=metrics.get("precision"),
                    recall=metrics.get("recall"),
                    f1_score=metrics.get("f1_score"),
                    estimated_business_cost=metrics.get("estimated_business_cost"),
                    generated_at=run.completed_at or run.created_at,
                )
            )
        integrity_counts: dict[str, int] = {}
        for model in (ModelTrainingRun, ExperimentRun):
            for state, count in self.session.execute(select(model.artifact_integrity_status, func.count()).group_by(model.artifact_integrity_status)).all():
                integrity_counts[str(state or "unknown")] = integrity_counts.get(str(state or "unknown"), 0) + int(count)
        reproducibility_status = {
            "metadata_complete": int(
                self.session.scalar(
                    select(func.count()).select_from(ModelTrainingRun).where(
                        ModelTrainingRun.configuration_fingerprint.is_not(None),
                        ModelTrainingRun.split_identifier.is_not(None),
                    )
                )
                or 0
            )
            + int(
                self.session.scalar(
                    select(func.count()).select_from(ExperimentRun).where(
                        ExperimentRun.configuration_fingerprint.is_not(None),
                        ExperimentRun.split_identifier.is_not(None),
                    )
                )
                or 0
            ),
            "approved_models": int(self.session.scalar(select(func.count()).select_from(ModelPromotion).where(ModelPromotion.status == "active")) or 0),
        }
        availability = [
            AvailabilityNote(name="official_test_metrics", status="unavailable", message="No official APS test-set evaluation is exposed by this backend."),
            AvailabilityNote(name="production_approved_model", status="available" if promotion else "unavailable", message="An explicit approved promotion is active." if promotion else "No approved production model/policy is registered."),
        ]
        return DashboardResponse(
            generated_at=utc_now(),
            datasets=[DatasetSummary.model_validate(dataset) for dataset in datasets],
            model_run_count=model_count,
            experiment_count=experiment_count,
            model_counts_by_lifecycle=lifecycle_counts,
            current_promotion=current_promotion,
            total_predictions=total_predictions,
            positive_prediction_count=positive_predictions,
            negative_prediction_count=negative_predictions,
            recent_experiments=recent_experiments,
            recent_predictions=recent_predictions,
            latest_validation_metrics=latest_metrics,
            artifact_integrity_counts=integrity_counts,
            reproducibility_status=reproducibility_status,
            availability=availability,
        )

    def dataset(self, dataset_id: str, page: int, page_size: int) -> DatasetAnalyticsResponse:
        metadata = self.session.get(DatasetMetadata, dataset_id)
        if metadata is None:
            raise ResourceNotFoundError(f"Dataset '{dataset_id}' was not found.")
        summary = DatasetSummary.model_validate(metadata)
        source_available = Path(metadata.source_path).is_file()
        availability: list[AvailabilityNote] = []
        profile: DatasetProfileResponse | None = None
        feature_page: FeaturePageResponse | None = None
        profile_path = _safe_profile_path(self.settings, metadata.profile_path)
        if profile_path and profile_path.is_file():
            try:
                profile = DatasetProfileResponse.model_validate(read_json(profile_path))
                items = profile.profile.items
                start = (page - 1) * page_size
                feature_page = FeaturePageResponse(items=items[start : start + page_size], total=len(items), page=page, page_size=page_size)
            except (OSError, ValueError, TypeError) as exc:
                availability.append(AvailabilityNote(name="profile", status="blocked", message="The persisted profile artifact could not be read safely."))
        if profile is None:
            availability.append(AvailabilityNote(name="profile", status="unavailable", message="No persisted dataset profile artifact is available; raw data was not reprocessed."))
        preprocessing = self.session.scalar(select(PreprocessingRun).where(PreprocessingRun.dataset_id == dataset_id).order_by(PreprocessingRun.created_at.desc()))
        splits: SplitsResponse | None = None
        if preprocessing and Path(preprocessing.split_metadata_path).is_file():
            try:
                payload = read_json(Path(preprocessing.split_metadata_path))
                splits = SplitsResponse(
                    dataset_id=dataset_id,
                    validation_ratio=preprocessing.validation_ratio,
                    random_seed=preprocessing.random_seed,
                    test_isolation_note=payload.get("test_isolation_note", "The official APS test dataset was not loaded."),
                    splits=[SplitSummary.model_validate(item) for item in payload.get("splits", [])],
                )
            except (OSError, ValueError, TypeError):
                availability.append(AvailabilityNote(name="splits", status="blocked", message="The persisted split artifact could not be read safely."))
        if splits is None:
            availability.append(AvailabilityNote(name="splits", status="unavailable", message="No persisted train/validation split metadata is available."))
        availability.append(AvailabilityNote(name="source_data", status="available" if source_available else "blocked", message="The recorded source file is available." if source_available else "The recorded source file is unavailable; metadata was returned without loading raw data."))
        return DatasetAnalyticsResponse(
            dataset=summary,
            source_available=source_available,
            profile_available=profile is not None,
            profile=profile,
            feature_page=feature_page,
            splits=splits,
            availability=availability,
        )

    def model_comparison(
        self,
        page: int,
        page_size: int,
        *,
        model_name: str | None = None,
        experiment_id: str | None = None,
        imbalance_strategy: str | None = None,
        evaluation_type: str = "validation",
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> ModelComparisonResponse:
        if evaluation_type not in {"validation", "official_test", "production"}:
            raise InvalidRequestError("evaluation_type must be validation, official_test or production.")
        if date_from and date_to and date_from > date_to:
            raise InvalidRequestError("date_from must be earlier than or equal to date_to.")
        availability: list[AvailabilityNote] = []
        if evaluation_type != "validation":
            availability.append(AvailabilityNote(name=evaluation_type, status="unavailable", message="This backend has not performed official-test or production evaluation."))
            return ModelComparisonResponse(available_model_families=MODEL_FAMILIES, items=[], total=0, page=page, page_size=page_size, filters={"evaluation_type": evaluation_type}, availability=availability)
        items: list[ModelComparisonItem] = []
        experiments = select(ExperimentRun).order_by(ExperimentRun.created_at.desc())
        if model_name:
            experiments = experiments.where(ExperimentRun.model_name == model_name)
        if experiment_id:
            experiments = experiments.where(ExperimentRun.experiment_id == experiment_id)
        if imbalance_strategy:
            experiments = experiments.where(ExperimentRun.imbalance_strategy == imbalance_strategy)
        if date_from:
            experiments = experiments.where(ExperimentRun.created_at >= date_from)
        if date_to:
            experiments = experiments.where(ExperimentRun.created_at <= date_to)
        for run in self.session.scalars(experiments.limit(self.settings.analytics_export_max_rows)):
            items.append(self._comparison_item("experiment", run))
        training = select(ModelTrainingRun).order_by(ModelTrainingRun.created_at.desc())
        if model_name:
            training = training.where(ModelTrainingRun.model_name == model_name)
        if date_from:
            training = training.where(ModelTrainingRun.created_at >= date_from)
        if date_to:
            training = training.where(ModelTrainingRun.created_at <= date_to)
        if not experiment_id:
            for run in self.session.scalars(training.limit(self.settings.analytics_export_max_rows)):
                items.append(self._comparison_item("training_run", run))
        items.sort(key=lambda item: item.created_at, reverse=True)
        total = len(items)
        start = (page - 1) * page_size
        if not items:
            availability.append(AvailabilityNote(name="validation_metrics", status="unavailable", message="No persisted validation metrics are available for the selected filters."))
        else:
            availability.append(AvailabilityNote(name="validation_metrics", status="available", message="Metrics are validation-split results and retain their split identifiers."))
        return ModelComparisonResponse(
            available_model_families=MODEL_FAMILIES,
            items=items[start : start + page_size],
            total=total,
            page=page,
            page_size=page_size,
            filters={"model_name": model_name, "experiment_id": experiment_id, "imbalance_strategy": imbalance_strategy, "evaluation_type": evaluation_type},
            availability=availability,
        )

    def _comparison_item(self, reference_type: str, run: ModelTrainingRun | ExperimentRun) -> ModelComparisonItem:
        metrics = parse_json_object(run.metrics_json)
        if reference_type == "training_run":
            hyperparameters = parse_json_object(run.hyperparameters_json)
            preprocessing = parse_json_object(run.preprocessing_configuration_json)
            imbalance = parse_json_object(run.class_imbalance_configuration_json)
            curves = None
            feature_importance: list[dict[str, Any]] = []
            ref_id = run.run_id
        else:
            hyperparameters = parse_json_object(run.best_parameters_json)
            preprocessing = parse_json_object(run.configuration_json)
            imbalance = {"strategy": run.imbalance_strategy}
            paths = experiment_artifact_paths(self.settings.model_artifact_dir, run.experiment_id)
            curves = _safe_json_text(run.curves_json) if paths.curves.is_file() else None
            feature_importance = _safe_json_text(run.feature_importance_json) if paths.feature_importance.is_file() else []
            ref_id = run.experiment_id
        confusion = metrics.get("confusion_matrix")
        return ModelComparisonItem(
            reference_type=reference_type,  # type: ignore[arg-type]
            reference_id=ref_id,
            model_name=run.model_name,
            model_version=run.model_version,
            dataset_id=run.dataset_id,
            dataset_fingerprint=run.dataset_fingerprint,
            evaluation_scope="validation",
            evaluation_split=run.split_identifier,
            imbalance_strategy=run.imbalance_strategy if isinstance(run, ExperimentRun) else imbalance.get("resolved", {}).get("mode"),
            preprocessing_strategy=run.preprocessing_strategy if isinstance(run, ExperimentRun) else preprocessing.get("strategy"),
            hyperparameters=hyperparameters,
            pr_auc=metrics.get("pr_auc"),
            roc_auc=metrics.get("roc_auc"),
            precision=metrics.get("precision"),
            recall=metrics.get("recall"),
            f1_score=metrics.get("f1_score"),
            confusion_matrix=confusion,
            false_positive_cost=metrics.get("false_positive_cost", run.false_positive_cost),
            false_negative_cost=metrics.get("false_negative_cost", run.false_negative_cost),
            estimated_business_cost=metrics.get("estimated_business_cost"),
            training_duration_seconds=run.training_duration_seconds,
            inference_duration_seconds=getattr(run, "inference_duration_seconds", None),
            precision_recall_curve=curves.get("precision_recall") if isinstance(curves, dict) else None,
            roc_curve=curves.get("roc") if isinstance(curves, dict) else None,
            feature_importance=feature_importance if isinstance(feature_importance, list) else [],
            created_at=run.created_at,
        )

    def threshold(self, reference_id: str) -> ThresholdAnalyticsResponse:
        reference = self.registry.resolve("experiment", reference_id) if self.session.get(ExperimentRun, reference_id) else self.registry.resolve("training_run", reference_id)
        paths = phase5_artifact_paths(self.settings.report_storage_dir, reference_id)
        availability: list[AvailabilityNote] = []
        threshold_analysis = self._read_phase5(paths.thresholds, ThresholdAnalysisResponse, "threshold_analysis", availability)
        calibration = self._read_phase5(paths.calibration, CalibrationComparisonResponse, "calibration", availability)
        policies = self._read_phase5(paths.decision_policies, DecisionPolicyComparisonResponse, "decision_policies", availability)
        return ThresholdAnalyticsResponse(
            reference_type=reference.reference_type,  # type: ignore[arg-type]
            reference_id=reference_id,
            threshold_analysis=threshold_analysis,
            calibration=calibration,
            decision_policies=policies,
            availability=availability,
        )

    @staticmethod
    def _read_phase5(path: Path, schema: Any, name: str, availability: list[AvailabilityNote]) -> Any | None:
        if not path.is_file():
            availability.append(AvailabilityNote(name=name, status="unavailable", message=f"No persisted {name.replace('_', ' ')} artifact is available."))
            return None
        try:
            value = schema.model_validate(read_json(path))
        except (OSError, ValueError, TypeError):
            availability.append(AvailabilityNote(name=name, status="blocked", message=f"The persisted {name.replace('_', ' ')} artifact is invalid."))
            return None
        availability.append(AvailabilityNote(name=name, status="available", message="Persisted Phase 5 artifact loaded without recomputation."))
        return value

    def threshold_list(self, page: int, page_size: int) -> ThresholdAnalyticsListResponse:
        records = self.registry.list_models(page=1, page_size=self.settings.analytics_export_max_rows).items
        items: list[ThresholdAnalyticsListItem] = []
        for record in records:
            paths = phase5_artifact_paths(self.settings.report_storage_dir, record.model_reference_id)
            items.append(
                ThresholdAnalyticsListItem(
                    reference_type=record.model_reference_type,
                    reference_id=record.model_reference_id,
                    model_name=record.model_name,
                    model_version=record.model_version,
                    threshold_available=paths.thresholds.is_file(),
                    calibration_available=paths.calibration.is_file(),
                    decision_policy_available=paths.decision_policies.is_file(),
                )
            )
        total = len(items)
        start = (page - 1) * page_size
        return ThresholdAnalyticsListResponse(items=items[start : start + page_size], total=total, page=page, page_size=page_size)
