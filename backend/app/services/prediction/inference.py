"""Trusted model resolution, cached inference and prediction persistence."""

from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from threading import RLock
import time
from typing import Any, Callable
from uuid import uuid4

import numpy as np
import pandas as pd
from pydantic import TypeAdapter, ValidationError
from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import (
    ArtifactCompatibilityError,
    ArtifactUnavailableError,
    InvalidRequestError,
    ResourceNotFoundError,
)
from app.models.experiment import ExperimentRun
from app.models.prediction import DecisionPolicy, PredictionRecord
from app.models.training import ModelTrainingRun
from app.schemas.predictions import (
    BatchPredictionItem,
    BatchPredictionResponse,
    BatchRecordError,
    DecisionPolicyListResponse,
    DecisionPolicySummary,
    FeatureContribution,
    FeatureSchemaResponse,
    PredictionExplanation,
    PredictionHistoryResponse,
    PredictionModelListResponse,
    PredictionModelOption,
    PolicyRegistrationRequest,
    PredictionRequest,
    PredictionResponse,
    PredictionReference,
    SensorRecord,
)
from app.services.model_training.artifacts import (
    experiment_artifact_paths,
    load_joblib,
    load_json,
    phase5_artifact_paths,
    training_artifact_paths,
)
from app.schemas.phase5 import CalibrationComparisonResponse, DecisionPolicyComparisonResponse
from app.services.registry import ModelRegistryService
from app.services.reproducibility import parse_json_object, sha256_file


logger = logging.getLogger(__name__)
SENSOR_RECORD_ADAPTER = TypeAdapter(SensorRecord)


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass(frozen=True)
class ResolvedPolicy:
    policy_id: str | None
    policy_version: str | None
    threshold: float
    calibration_method: str
    calibrator: Any | None
    calibration_input: str
    calibration_artifact_path: str | None
    calibration_artifact_checksum: str | None
    warnings: list[str]


@dataclass(frozen=True)
class ResolvedModel:
    reference_type: str
    reference_id: str
    model_run_id: str | None
    experiment_id: str | None
    model_name: str
    model_version: str
    dataset_id: str
    feature_names: list[str]
    model: Any
    preprocessor: Any | None
    metadata: dict[str, Any]
    feature_importance: list[FeatureContribution]
    artifact_files: tuple[Path, ...]
    default_threshold: float
    configuration_fingerprint: str | None
    artifact_checksums: dict[str, str]


class InferenceCache:
    """Small process-local LRU cache with explicit invalidation operations."""

    def __init__(self, max_entries: int = 8) -> None:
        self.max_entries = max_entries
        self._models: OrderedDict[tuple[Any, ...], ResolvedModel] = OrderedDict()
        self._calibrators: OrderedDict[tuple[Any, ...], Any] = OrderedDict()
        self._lock = RLock()

    def get_model(self, key: tuple[Any, ...], loader: Callable[[], ResolvedModel]) -> ResolvedModel:
        with self._lock:
            cached = self._models.get(key)
            if cached is not None:
                self._models.move_to_end(key)
                return cached
        loaded = loader()
        with self._lock:
            self._models[key] = loaded
            self._models.move_to_end(key)
            while len(self._models) > self.max_entries:
                self._models.popitem(last=False)
        return loaded

    def get_calibrator(self, key: tuple[Any, ...], loader: Callable[[], Any]) -> Any:
        with self._lock:
            cached = self._calibrators.get(key)
            if cached is not None:
                self._calibrators.move_to_end(key)
                return cached
        loaded = loader()
        with self._lock:
            self._calibrators[key] = loaded
            self._calibrators.move_to_end(key)
            while len(self._calibrators) > self.max_entries:
                self._calibrators.popitem(last=False)
        return loaded

    def invalidate_model(self, reference_type: str, reference_id: str) -> None:
        with self._lock:
            for key in list(self._models):
                if key[:2] == (reference_type, reference_id):
                    self._models.pop(key, None)

    def invalidate_policy(self, policy_id: str) -> None:
        with self._lock:
            for key in list(self._calibrators):
                if len(key) > 1 and key[0] == "calibration" and key[1] == policy_id:
                    self._calibrators.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._models.clear()
            self._calibrators.clear()

    def sizes(self) -> tuple[int, int]:
        with self._lock:
            return len(self._models), len(self._calibrators)


def _safe_json(path: Path) -> dict[str, Any]:
    try:
        payload = load_json(path)
    except Exception as exc:  # joblib/json errors must not leak internals to clients
        raise ArtifactUnavailableError(f"Artifact metadata could not be read: {path.name}.") from exc
    if not isinstance(payload, dict):
        raise ArtifactCompatibilityError(f"Artifact metadata is not an object: {path.name}.")
    return payload


def _safe_json_value(value: str | None, label: str) -> dict[str, Any]:
    try:
        payload = json.loads(value or "{}")
    except (TypeError, json.JSONDecodeError) as exc:
        raise ArtifactCompatibilityError(f"{label.capitalize()} is invalid.") from exc
    if not isinstance(payload, dict):
        raise ArtifactCompatibilityError(f"{label.capitalize()} is not an object.")
    return payload


def _safe_json_text(value: str | None, label: str) -> Any:
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError) as exc:
        raise ArtifactCompatibilityError(f"{label.capitalize()} is invalid.") from exc


def _safe_json_list(value: str | None, label: str) -> list[Any]:
    payload = _safe_json_text(value, label)
    if not isinstance(payload, list):
        raise ArtifactCompatibilityError(f"{label.capitalize()} is not a list.")
    return payload


def _artifact_signature(paths: tuple[Path, ...]) -> tuple[tuple[str, int, int], ...]:
    signatures: list[tuple[str, int, int]] = []
    for path in paths:
        try:
            stat = path.stat()
        except OSError:
            signatures.append((str(path), -1, -1))
        else:
            signatures.append((str(path), stat.st_mtime_ns, stat.st_size))
    return tuple(signatures)


def _expected_registered_path(stored_path: str | None, expected_path: Path, label: str) -> Path:
    """Only accept registry paths that resolve to the configured artifact location."""

    if not stored_path:
        raise ArtifactCompatibilityError(f"Registered {label} artifact path is missing.")
    expected = expected_path.resolve()
    stored = Path(stored_path)
    if not stored.is_absolute():
        stored = (Path.cwd() / stored).resolve()
    else:
        stored = stored.resolve()
    if stored != expected:
        raise ArtifactCompatibilityError(f"Registered {label} artifact path is outside its trusted configured location.")
    return expected


def _require_file(path: Path, label: str) -> None:
    if not path.is_file():
        raise ArtifactUnavailableError(f"Required {label} artifact is unavailable.")


def _ensure_under_root(path: Path, root: Path, label: str) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError as exc:
        raise ArtifactCompatibilityError(f"Registered {label} artifact path is outside its configured storage root.") from exc
    return resolved


def _feature_names(metadata: dict[str, Any], *, source: str) -> list[str]:
    configuration = metadata.get("preprocessing_configuration") or metadata.get("configuration") or {}
    names = configuration.get("feature_names_before")
    if not isinstance(names, list) or not names or not all(isinstance(name, str) and name for name in names):
        raise ArtifactCompatibilityError(f"{source} artifact does not contain a trusted feature schema.")
    if len(set(names)) != len(names):
        raise ArtifactCompatibilityError(f"{source} artifact contains duplicate feature names.")
    return list(names)


def _feature_names_after(metadata: dict[str, Any], feature_names: list[str]) -> list[str]:
    configuration = metadata.get("preprocessing_configuration") or metadata.get("configuration") or {}
    names = configuration.get("feature_names_after")
    if names is None:
        return list(feature_names)
    if not isinstance(names, list) or not names or not all(isinstance(name, str) and name for name in names):
        raise ArtifactCompatibilityError("Artifact feature output metadata is invalid.")
    if len(set(names)) != len(names):
        raise ArtifactCompatibilityError("Artifact feature output metadata contains duplicate names.")
    return list(names)


def _validate_transform_shape(transformer: Any, model: Any, input_names: list[str], output_names: list[str]) -> None:
    """Validate shape metadata when the serialized estimator exposes it."""

    if hasattr(transformer, "get_feature_names_out"):
        try:
            transformed_names = [str(value) for value in transformer.get_feature_names_out(input_names)]
        except (AttributeError, TypeError, ValueError) as exc:
            raise ArtifactCompatibilityError("The preprocessing artifact could not describe its output features.") from exc
        if transformed_names != output_names:
            raise ArtifactCompatibilityError("Preprocessing output feature ordering does not match registered metadata.")
    expected_width = len(output_names)
    model_width = getattr(model, "n_features_in_", None)
    if model_width is not None and int(model_width) != expected_width:
        raise ArtifactCompatibilityError("The serialized model feature count does not match preprocessing metadata.")


def _feature_importance_from_estimator(model: Any, feature_names: list[str]) -> list[FeatureContribution]:
    estimator = model
    if hasattr(model, "named_steps"):
        estimator = model.named_steps.get("model", model)
    values: np.ndarray | None = None
    importance_type: str = "feature_importance"
    if hasattr(estimator, "coef_"):
        values = np.abs(np.asarray(estimator.coef_, dtype=float).reshape(-1))
        importance_type = "absolute_coefficient"
    elif hasattr(estimator, "feature_importances_"):
        values = np.asarray(estimator.feature_importances_, dtype=float).reshape(-1)
    if values is None or len(values) != len(feature_names):
        return []
    items = [
        FeatureContribution(feature_name=name, importance=float(value), importance_type=importance_type)  # type: ignore[arg-type]
        for name, value in zip(feature_names, values, strict=True)
        if np.isfinite(value)
    ]
    return sorted(items, key=lambda item: item.importance, reverse=True)


def _feature_importance_from_payload(payload: Any) -> list[FeatureContribution]:
    if not isinstance(payload, list):
        return []
    items: list[FeatureContribution] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        name = item.get("feature_name")
        importance = item.get("importance")
        method = item.get("importance_type") or item.get("methodology")
        if not isinstance(name, str) or not isinstance(importance, (int, float)) or not np.isfinite(float(importance)):
            continue
        normalized_method = "absolute_coefficient" if method == "absolute_coefficient" else "feature_importance"
        items.append(FeatureContribution(feature_name=name, importance=float(importance), importance_type=normalized_method))  # type: ignore[arg-type]
    return sorted(items, key=lambda item: item.importance, reverse=True)


class InferenceService:
    """Resolve trusted registry entries and execute cached inference."""

    def __init__(self, settings: Settings, session: Session, cache: InferenceCache | None = None) -> None:
        self.settings = settings
        self.session = session
        self.cache = cache or InferenceCache(settings.prediction_model_cache_size)

    def _reference_from_request(self, reference: PredictionReference) -> tuple[str, str]:
        if reference.model_run_id:
            return "training_run", reference.model_run_id
        if reference.experiment_id:
            return "experiment", reference.experiment_id
        if self.settings.default_prediction_run_id:
            return "training_run", self.settings.default_prediction_run_id
        if self.settings.default_prediction_experiment_id:
            return "experiment", self.settings.default_prediction_experiment_id
        promotion = ModelRegistryService(self.settings, self.session).active_promotion()
        if promotion is not None:
            return promotion.model_reference_type, promotion.model_reference_id
        raise InvalidRequestError(
            "A model_run_id or experiment_id is required because no configured default prediction model is registered."
        )

    def _load_training_model(self, run: ModelTrainingRun) -> ResolvedModel:
        paths = training_artifact_paths(self.settings.model_artifact_dir, run.run_id)
        _ensure_under_root(paths.directory, self.settings.model_artifact_dir, "model")
        inventory = ModelRegistryService(self.settings, self.session).verify_artifacts("training_run", run.run_id)
        if not inventory.all_verified:
            raise ArtifactUnavailableError("Registered training artifacts are missing or failed checksum verification.")
        model_path = _expected_registered_path(run.model_artifact_path, paths.model, "model")
        preprocessor_path = _expected_registered_path(run.preprocessor_artifact_path, paths.preprocessor, "preprocessor")
        metadata_path = _expected_registered_path(run.metadata_artifact_path, paths.metadata, "metadata")
        artifacts = (model_path, preprocessor_path, metadata_path)
        for path, label in ((model_path, "model"), (preprocessor_path, "preprocessor"), (metadata_path, "metadata")):
            _require_file(path, label)
        try:
            model = load_joblib(model_path)
            preprocessor = load_joblib(preprocessor_path)
        except Exception as exc:
            raise ArtifactUnavailableError("The registered model or preprocessor artifact could not be loaded.") from exc
        metadata = _safe_json(metadata_path)
        if metadata.get("run_id") != run.run_id or metadata.get("model_version") != run.model_version:
            raise ArtifactCompatibilityError("Registered model metadata does not match the model run.")
        if metadata.get("model_name") != run.model_name or metadata.get("dataset_id") != run.dataset_id:
            raise ArtifactCompatibilityError("Registered model metadata does not match its model or dataset reference.")
        feature_names = _feature_names(metadata, source="Training")
        output_names = _feature_names_after(metadata, feature_names)
        try:
            registered_names = json.loads(run.feature_names_before_json)
            registered_output_names = json.loads(run.feature_names_after_json)
        except (TypeError, json.JSONDecodeError) as exc:
            raise ArtifactCompatibilityError("Training-run feature metadata is invalid.") from exc
        if registered_names and registered_names != feature_names:
            raise ArtifactCompatibilityError("Training-run feature ordering differs from the metadata artifact.")
        if registered_output_names and registered_output_names != output_names:
            raise ArtifactCompatibilityError("Training-run transformed feature ordering differs from the metadata artifact.")
        if len(feature_names) != self.settings.expected_feature_count:
            raise ArtifactCompatibilityError(
                f"Registered model expects {len(feature_names)} features, but the configured contract expects {self.settings.expected_feature_count}."
            )
        if not hasattr(model, "predict_proba") or not hasattr(preprocessor, "transform"):
            raise ArtifactCompatibilityError("Registered training artifacts do not expose the required inference interface.")
        _validate_transform_shape(preprocessor, model, feature_names, output_names)
        return ResolvedModel(
            reference_type="training_run",
            reference_id=run.run_id,
            model_run_id=run.run_id,
            experiment_id=None,
            model_name=run.model_name,
            model_version=run.model_version,
            dataset_id=run.dataset_id,
            feature_names=feature_names,
            model=model,
            preprocessor=preprocessor,
            metadata=metadata,
            feature_importance=_feature_importance_from_estimator(model, output_names),
            artifact_files=artifacts,
            default_threshold=run.threshold,
            configuration_fingerprint=run.configuration_fingerprint,
            artifact_checksums=parse_json_object(run.artifact_checksums_json),
        )

    def _load_experiment_model(self, run: ExperimentRun) -> ResolvedModel:
        paths = experiment_artifact_paths(self.settings.model_artifact_dir, run.experiment_id)
        _ensure_under_root(paths.directory, self.settings.model_artifact_dir, "pipeline")
        inventory = ModelRegistryService(self.settings, self.session).verify_artifacts("experiment", run.experiment_id)
        if not inventory.all_verified:
            raise ArtifactUnavailableError("Registered experiment artifacts are missing or failed checksum verification.")
        pipeline_path = _expected_registered_path(run.pipeline_artifact_path, paths.pipeline, "pipeline")
        preprocessor_path = _expected_registered_path(run.preprocessor_artifact_path, paths.preprocessor, "preprocessor")
        metadata_path = _expected_registered_path(run.metadata_artifact_path, paths.metadata, "metadata")
        artifacts = (pipeline_path, preprocessor_path, metadata_path)
        for path, label in ((pipeline_path, "pipeline"), (preprocessor_path, "preprocessor"), (metadata_path, "metadata")):
            _require_file(path, label)
        try:
            pipeline = load_joblib(pipeline_path)
            # The full pipeline performs preprocessing exactly once. Load the
            # separate artifact only as a compatibility/integrity check.
            preprocessor = load_joblib(preprocessor_path)
        except Exception as exc:
            raise ArtifactUnavailableError("The registered experiment artifacts could not be loaded.") from exc
        metadata = _safe_json(metadata_path)
        if metadata.get("experiment_id") != run.experiment_id:
            raise ArtifactCompatibilityError("Registered experiment metadata does not match the experiment reference.")
        configuration = metadata.get("configuration") or {}
        if configuration.get("model_name") != run.model_name or configuration.get("resolved_hyperparameters") is None:
            raise ArtifactCompatibilityError("Registered experiment metadata does not match its model configuration.")
        feature_names = _feature_names(metadata, source="Experiment")
        output_names = _feature_names_after(metadata, feature_names)
        try:
            registered_configuration = json.loads(run.configuration_json)
            registered_names = registered_configuration.get("feature_names_before", [])
            registered_output_names = registered_configuration.get("feature_names_after", [])
        except (TypeError, json.JSONDecodeError, AttributeError) as exc:
            raise ArtifactCompatibilityError("Experiment feature metadata is invalid.") from exc
        if registered_names and registered_names != feature_names:
            raise ArtifactCompatibilityError("Experiment feature ordering differs from the metadata artifact.")
        if registered_output_names and registered_output_names != output_names:
            raise ArtifactCompatibilityError("Experiment transformed feature ordering differs from the metadata artifact.")
        if len(feature_names) != self.settings.expected_feature_count:
            raise ArtifactCompatibilityError(
                f"Registered experiment expects {len(feature_names)} features, but the configured contract expects {self.settings.expected_feature_count}."
            )
        if not hasattr(pipeline, "predict_proba") or not hasattr(preprocessor, "transform"):
            raise ArtifactCompatibilityError("Registered experiment artifacts do not expose the required inference interface.")
        pipeline_preprocessor = getattr(pipeline, "named_steps", {}).get("preprocessor", preprocessor)
        _validate_transform_shape(pipeline_preprocessor, getattr(pipeline, "named_steps", {}).get("model", pipeline), feature_names, output_names)
        return ResolvedModel(
            reference_type="experiment",
            reference_id=run.experiment_id,
            model_run_id=None,
            experiment_id=run.experiment_id,
            model_name=run.model_name,
            model_version=run.model_version,
            dataset_id=run.dataset_id,
            feature_names=feature_names,
            model=pipeline,
            preprocessor=None,
            metadata=metadata,
            feature_importance=_feature_importance_from_payload(
                _safe_json_text(run.feature_importance_json, "experiment feature importance")
            ),
            artifact_files=artifacts,
            default_threshold=run.threshold,
            configuration_fingerprint=run.configuration_fingerprint,
            artifact_checksums=parse_json_object(run.artifact_checksums_json),
        )

    def resolve_model(self, reference: PredictionReference) -> ResolvedModel:
        reference_type, reference_id = self._reference_from_request(reference)
        if reference_type == "training_run":
            run = self.session.get(ModelTrainingRun, reference_id)
            if run is None:
                raise ResourceNotFoundError(f"Model training run '{reference_id}' was not found.")
            if run.status != "completed":
                raise InvalidRequestError(f"Model training run '{reference_id}' is not available for inference.")
            model_version = run.model_version
            expected_paths = training_artifact_paths(self.settings.model_artifact_dir, reference_id)
            _ensure_under_root(expected_paths.directory, self.settings.model_artifact_dir, "model")
            artifact_files = (
                _expected_registered_path(run.model_artifact_path, expected_paths.model, "model"),
                _expected_registered_path(run.preprocessor_artifact_path, expected_paths.preprocessor, "preprocessor"),
                _expected_registered_path(run.metadata_artifact_path, expected_paths.metadata, "metadata"),
            )
            loader = lambda: self._load_training_model(run)
        else:
            run = self.session.get(ExperimentRun, reference_id)
            if run is None:
                raise ResourceNotFoundError(f"Experiment '{reference_id}' was not found.")
            if run.status != "completed":
                raise InvalidRequestError(f"Experiment '{reference_id}' is not available for inference.")
            model_version = run.model_version
            expected_paths = experiment_artifact_paths(self.settings.model_artifact_dir, reference_id)
            _ensure_under_root(expected_paths.directory, self.settings.model_artifact_dir, "pipeline")
            artifact_files = (
                _expected_registered_path(run.pipeline_artifact_path, expected_paths.pipeline, "pipeline"),
                _expected_registered_path(run.preprocessor_artifact_path, expected_paths.preprocessor, "preprocessor"),
                _expected_registered_path(run.metadata_artifact_path, expected_paths.metadata, "metadata"),
            )
            loader = lambda: self._load_experiment_model(run)
        key = (reference_type, reference_id, model_version, _artifact_signature(tuple(path.resolve() for path in artifact_files)))
        return self.cache.get_model(key, loader)

    def _resolve_policy(self, reference: PredictionReference, model: ResolvedModel) -> ResolvedPolicy:
        policy_id = reference.decision_policy_id or self.settings.default_prediction_policy_id
        if not policy_id:
            promotion = ModelRegistryService(self.settings, self.session).active_promotion()
            if promotion and promotion.model_reference_type == model.reference_type and promotion.model_reference_id == model.reference_id:
                policy_id = promotion.decision_policy_id
        if not policy_id:
            return ResolvedPolicy(
                policy_id=None,
                policy_version=None,
                threshold=model.default_threshold,
                calibration_method="uncalibrated",
                calibrator=None,
                calibration_input="none",
                calibration_artifact_path=None,
                calibration_artifact_checksum=None,
                warnings=["No decision policy reference was supplied; the selected model run threshold was applied."],
            )
        policy = self.session.get(DecisionPolicy, policy_id)
        if policy is None:
            raise ResourceNotFoundError(f"Decision policy '{policy_id}' was not found.")
        if policy.status not in {"active", "completed", "ready"}:
            raise InvalidRequestError(f"Decision policy '{policy_id}' is not available for inference.")
        if policy.model_reference_type != model.reference_type or policy.model_reference_id != model.reference_id:
            raise ArtifactCompatibilityError("The decision policy belongs to a different model reference.")
        if policy.model_version != model.model_version:
            raise ArtifactCompatibilityError("The decision policy model version does not match the selected model.")
        if not 0 <= policy.threshold <= 1:
            raise ArtifactCompatibilityError("The decision policy threshold is outside the valid probability range.")
        method = policy.calibration_method or "uncalibrated"
        if method in {"none", "uncalibrated"}:
            return ResolvedPolicy(policy.policy_id, policy.policy_version, policy.threshold, "uncalibrated", None, "none", None, None, [])
        if method not in {"isotonic", "sigmoid"}:
            raise ArtifactCompatibilityError("The decision policy specifies an unsupported calibration method.")
        if not policy.calibration_artifact_path:
            raise ArtifactUnavailableError("The decision-policy calibration artifact is unavailable.")
        report_path = self.settings.report_storage_dir / "phase5" / model.reference_id / f"calibrator_{method}.joblib"
        legacy_path = self.settings.model_artifact_dir / "policies" / policy.policy_id / "calibrator.joblib"
        _ensure_under_root(report_path, self.settings.report_storage_dir, "calibration")
        _ensure_under_root(legacy_path, self.settings.model_artifact_dir, "calibration")
        try:
            calibrator_path = _expected_registered_path(policy.calibration_artifact_path, report_path, "calibration")
            calibration_input = "features"
        except ArtifactCompatibilityError:
            calibrator_path = _expected_registered_path(policy.calibration_artifact_path, legacy_path, "calibration")
            calibration_input = "probability"
        _require_file(calibrator_path, "calibration")
        actual_calibration_checksum = sha256_file(calibrator_path)
        if policy.calibration_artifact_checksum and policy.calibration_artifact_checksum != actual_calibration_checksum:
            raise ArtifactCompatibilityError("The decision-policy calibration artifact checksum does not match the registry.")
        if not policy.calibration_artifact_checksum:
            policy.calibration_artifact_checksum = actual_calibration_checksum
            policy.artifact_integrity_status = "verified"
            self.session.commit()
        key = ("calibration", policy.policy_id, method, _artifact_signature((calibrator_path,)))
        try:
            calibrator = self.cache.get_calibrator(key, lambda: load_joblib(calibrator_path))
        except Exception as exc:
            raise ArtifactUnavailableError("The decision-policy calibration artifact could not be loaded.") from exc
        policy_metadata = _safe_json_value(policy.metadata_json, "decision policy metadata")
        configured_input = policy_metadata.get("calibration_input")
        if configured_input in {"features", "probability"}:
            calibration_input = configured_input
        if calibration_input == "features" and not hasattr(calibrator, "predict_proba"):
            raise ArtifactCompatibilityError("The feature-based calibration artifact does not expose predict_proba.")
        if calibration_input == "probability" and not hasattr(calibrator, "predict") and not hasattr(calibrator, "transform") and not hasattr(calibrator, "predict_proba"):
            raise ArtifactCompatibilityError("The calibration artifact does not expose a supported prediction interface.")
        return ResolvedPolicy(policy.policy_id, policy.policy_version, policy.threshold, method, calibrator, calibration_input, str(calibrator_path), actual_calibration_checksum, [])

    def _validate_sensor_record(self, record: SensorRecord, model: ResolvedModel) -> pd.DataFrame:
        provided = set(record.features)
        expected = set(model.feature_names)
        missing = sorted(expected - provided)
        unexpected = sorted(provided - expected)
        if missing or unexpected:
            raise InvalidRequestError(
                "Sensor feature names do not match the selected model contract.",
                details={"missing_features": missing, "unexpected_features": unexpected},
            )
        values = {
            name: (np.nan if record.features[name] is None else float(record.features[name]))
            for name in model.feature_names
        }
        return pd.DataFrame([values], columns=model.feature_names)

    @staticmethod
    def _positive_probabilities(model: Any, probabilities: Any) -> np.ndarray:
        values = np.asarray(probabilities, dtype=float)
        if values.ndim != 2 or values.shape[1] < 2:
            raise ArtifactCompatibilityError("The model artifact did not return binary class probabilities.")
        estimator = model
        if hasattr(model, "named_steps"):
            estimator = model.named_steps.get("model", model)
        classes = list(getattr(estimator, "classes_", [0, 1]))
        try:
            positive_index = classes.index(1)
        except ValueError as exc:
            raise ArtifactCompatibilityError("The model artifact does not expose the required positive class '1'.") from exc
        result = values[:, positive_index]
        if not np.isfinite(result).all() or ((result < 0) | (result > 1)).any():
            raise ArtifactCompatibilityError("The model returned probabilities outside the valid range.")
        return result

    @staticmethod
    def _apply_calibration(probabilities: np.ndarray, frame: pd.DataFrame, policy: ResolvedPolicy) -> np.ndarray:
        if policy.calibrator is None:
            return probabilities
        calibrator = policy.calibrator
        try:
            if policy.calibration_input == "features":
                calibrated = InferenceService._positive_probabilities(
                    calibrator,
                    calibrator.predict_proba(frame),
                )
            elif hasattr(calibrator, "predict"):
                calibrated = np.asarray(calibrator.predict(probabilities))
            elif hasattr(calibrator, "transform"):
                calibrated = np.asarray(calibrator.transform(probabilities))
            else:
                calibrated = np.asarray(calibrator.predict_proba(probabilities.reshape(-1, 1)))[:, 1]
        except Exception as exc:
            raise ArtifactCompatibilityError("The calibration artifact could not transform model probabilities.") from exc
        calibrated = calibrated.reshape(-1)
        if len(calibrated) != len(probabilities) or not np.isfinite(calibrated).all() or ((calibrated < 0) | (calibrated > 1)).any():
            raise ArtifactCompatibilityError("The calibration artifact returned invalid probabilities.")
        return calibrated

    @staticmethod
    def _prediction_explanation(model: ResolvedModel, include: bool) -> PredictionExplanation | None:
        if not include:
            return None
        top = model.feature_importance[:10]
        return PredictionExplanation(
            method="global_model_feature_importance",
            top_features=top,
            warning="Global feature importance is not a per-record causal explanation of why this vehicle was predicted to fail.",
        )

    @staticmethod
    def _policy_summary(policy: DecisionPolicy) -> DecisionPolicySummary:
        metadata = _safe_json_value(policy.metadata_json, "decision policy metadata")
        return DecisionPolicySummary(
            policy_id=policy.policy_id,
            policy_name=policy.policy_name,
            policy_version=policy.policy_version,
            model_reference_type=policy.model_reference_type,  # type: ignore[arg-type]
            model_reference_id=policy.model_reference_id,
            model_version=policy.model_version,
            status=policy.status,
            threshold=policy.threshold,
            calibration_method=policy.calibration_method,
            created_at=policy.created_at,
        )

    def register_policy(self, request: PolicyRegistrationRequest) -> DecisionPolicySummary:
        """Register a named policy from the trusted Phase 5 comparison artifacts."""

        reference = PredictionReference(
            model_run_id=request.model_run_id,
            experiment_id=request.experiment_id,
        )
        model = self.resolve_model(reference)
        paths = phase5_artifact_paths(self.settings.report_storage_dir, model.reference_id)
        _require_file(paths.decision_policies, "decision-policy comparison")
        comparison = DecisionPolicyComparisonResponse.model_validate(_safe_json(paths.decision_policies))
        if (
            comparison.reference.reference_id != model.reference_id
            or comparison.reference.reference_type != model.reference_type
            or comparison.reference.model_version != model.model_version
        ):
            raise ArtifactCompatibilityError("The decision-policy artifact does not belong to the selected model.")
        try:
            row = next(item for item in comparison.rows if item.policy_name == request.policy_name)
        except StopIteration as exc:
            raise ResourceNotFoundError(f"Decision policy '{request.policy_name}' was not found for model '{model.reference_id}'.") from exc

        calibration_path: Path | None = None
        calibration_checksum: str | None = None
        calibration_method = row.calibration_method
        if calibration_method != "uncalibrated":
            _require_file(paths.calibration, "calibration comparison")
            calibration = CalibrationComparisonResponse.model_validate(_safe_json(paths.calibration))
            if calibration.reference.reference_id != model.reference_id or calibration.reference.model_version != model.model_version:
                raise ArtifactCompatibilityError("The calibration artifact does not belong to the selected model.")
            method_result = next((item for item in calibration.methods if item.method == calibration_method), None)
            if method_result is None or method_result.status != "completed" or not method_result.artifact_reference:
                raise ArtifactCompatibilityError("The selected decision policy has no completed compatible calibration artifact.")
            expected_path = paths.directory / f"calibrator_{calibration_method}.joblib"
            _ensure_under_root(expected_path, self.settings.report_storage_dir, "calibration")
            calibration_path = _expected_registered_path(
                str(paths.directory / method_result.artifact_reference),
                expected_path,
                "calibration",
            )
            _require_file(calibration_path, "calibration")
            calibration_checksum = sha256_file(calibration_path)
            if method_result.artifact_checksum and method_result.artifact_checksum != calibration_checksum:
                raise ArtifactCompatibilityError("The calibration artifact checksum does not match the Phase 5 calibration metadata.")

        existing = self.session.scalar(
            select(DecisionPolicy).where(
                DecisionPolicy.model_reference_type == model.reference_type,
                DecisionPolicy.model_reference_id == model.reference_id,
                DecisionPolicy.policy_name == request.policy_name,
            )
        )
        if existing is not None:
            if (
                existing.model_version != model.model_version
                or existing.threshold != row.decision_threshold
                or existing.calibration_method != calibration_method
                or existing.calibration_artifact_path != (str(calibration_path) if calibration_path else None)
                or existing.calibration_artifact_checksum != calibration_checksum
            ):
                raise ArtifactCompatibilityError("The persisted decision policy no longer matches the Phase 5 policy artifact.")
            return self._policy_summary(existing)

        now = utc_now()
        policy = DecisionPolicy(
            policy_id=f"policy-{uuid4().hex[:20]}",
            policy_name=row.policy_name,
            policy_version="1",
            model_reference_type=model.reference_type,
            model_reference_id=model.reference_id,
            model_version=model.model_version,
            status="active",
            threshold=row.decision_threshold,
            calibration_method=calibration_method,
            calibration_artifact_path=str(calibration_path) if calibration_path else None,
            calibration_artifact_checksum=calibration_checksum,
            artifact_integrity_status="verified",
            false_positive_cost=comparison.false_positive_cost,
            false_negative_cost=comparison.false_negative_cost,
            risk_configuration_json=json.dumps(
                {
                    "high": "predicted_class == 'pos'",
                    "low": "predicted_class == 'neg'",
                    "intermediate_band": False,
                }
            ),
            metadata_json=json.dumps(
                {
                    "source": "phase5_decision_policy_comparison",
                    "policy_name": row.policy_name,
                    "calibration_input": "features" if calibration_path else "none",
                    "source_artifact_checksum": sha256_file(paths.decision_policies),
                }
            ),
            created_at=now,
            updated_at=now,
        )
        self.session.add(policy)
        self.session.commit()
        self.session.refresh(policy)
        return self._policy_summary(policy)

    @staticmethod
    def _response_from_record(record: PredictionRecord) -> PredictionResponse:
        metadata = _safe_json_value(record.metadata_json, "prediction metadata")
        explanation = metadata.get("explanation")
        return PredictionResponse(
            prediction_id=record.prediction_id,
            model_reference_type=record.model_reference_type,  # type: ignore[arg-type]
            model_reference_id=record.model_reference_id,
            model_version=record.model_version,
            model_run_id=record.model_reference_id if record.model_reference_type == "training_run" else None,
            experiment_id=record.model_reference_id if record.model_reference_type == "experiment" else None,
            decision_policy_id=record.decision_policy_id,
            decision_policy_version=record.decision_policy_version,
            predicted_class=record.predicted_class,  # type: ignore[arg-type]
            failure_probability=record.failure_probability,
            applied_threshold=record.applied_threshold,
            calibration_method=record.calibration_method,
            calibration_artifact_reference=Path(record.calibration_artifact_reference).name if record.calibration_artifact_reference else None,
            calibration_artifact_checksum=record.calibration_artifact_checksum,
            model_configuration_fingerprint=record.model_configuration_fingerprint,
            risk_classification=record.risk_classification,  # type: ignore[arg-type]
            prediction_timestamp=record.prediction_timestamp,
            inference_duration_ms=record.inference_duration_ms,
            vehicle_identifier=record.vehicle_identifier,
            request_reference=record.request_reference,
            warnings=_safe_json_list(record.warnings_json, "prediction warnings"),
            explanation=PredictionExplanation.model_validate(explanation) if explanation else None,
        )

    def _persist_prediction(
        self,
        model: ResolvedModel,
        policy: ResolvedPolicy,
        record: SensorRecord,
        raw_probability: float,
        probability: float,
        inference_duration_ms: float,
        *,
        batch_id: str | None = None,
        batch_index: int | None = None,
        explanation: PredictionExplanation | None = None,
    ) -> PredictionRecord:
        predicted_class = "pos" if probability >= policy.threshold else "neg"
        metadata = {
            "probability_note": "This probability is a model estimate, not a guaranteed real-world failure probability.",
            "explanation": explanation.model_dump(mode="json") if explanation else None,
        }
        persisted = PredictionRecord(
            prediction_id=f"pred-{uuid4().hex[:20]}",
            batch_id=batch_id,
            batch_index=batch_index,
            model_reference_type=model.reference_type,
            model_reference_id=model.reference_id,
            model_version=model.model_version,
            decision_policy_id=policy.policy_id,
            decision_policy_version=policy.policy_version,
            predicted_class=predicted_class,
            raw_failure_probability=float(raw_probability),
            failure_probability=float(probability),
            applied_threshold=policy.threshold,
            calibration_method=policy.calibration_method,
            calibration_artifact_reference=Path(policy.calibration_artifact_path).name if policy.calibration_artifact_path else None,
            calibration_artifact_checksum=policy.calibration_artifact_checksum,
            model_configuration_fingerprint=model.configuration_fingerprint,
            artifact_checksums_json=json.dumps(model.artifact_checksums),
            risk_classification="high" if probability >= policy.threshold else "low",
            vehicle_identifier=record.vehicle_identifier,
            request_reference=record.request_reference,
            user_description=record.user_description,
            prediction_timestamp=utc_now(),
            inference_duration_ms=float(inference_duration_ms),
            explanation_method=explanation.method if explanation else None,
            warnings_json=json.dumps(policy.warnings),
            metadata_json=json.dumps(metadata),
        )
        self.session.add(persisted)
        self.session.commit()
        self.session.refresh(persisted)
        return persisted

    def _predict_arrays(self, model: ResolvedModel, policy: ResolvedPolicy, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, float]:
        started = time.perf_counter()
        try:
            if model.preprocessor is None:
                probabilities = model.model.predict_proba(frame)
            else:
                transformed = model.preprocessor.transform(frame[model.feature_names])
                probabilities = model.model.predict_proba(transformed)
        except Exception as exc:
            raise ArtifactCompatibilityError("The selected model could not process the validated sensor feature matrix.") from exc
        raw = self._positive_probabilities(model.model, probabilities)
        calibrated = self._apply_calibration(raw, frame, policy)
        elapsed_ms = (time.perf_counter() - started) * 1000
        return raw, calibrated, elapsed_ms

    def predict(self, request: PredictionRequest) -> PredictionResponse:
        model = self.resolve_model(request)
        policy = self._resolve_policy(request, model)
        frame = self._validate_sensor_record(request, model)
        raw, calibrated, elapsed_ms = self._predict_arrays(model, policy, frame)
        explanation = self._prediction_explanation(model, request.include_explanation)
        persisted = self._persist_prediction(model, policy, request, float(raw[0]), float(calibrated[0]), elapsed_ms, explanation=explanation)
        return self._response_from_record(persisted)

    def predict_batch(self, request: Any) -> Any:
        if len(request.records) > self.settings.prediction_batch_max_size:
            raise InvalidRequestError(
                f"Batch size {len(request.records)} exceeds the configured maximum of {self.settings.prediction_batch_max_size}.",
                status_code=413,
            )
        model = self.resolve_model(request)
        policy = self._resolve_policy(request, model)
        batch_id = f"batch-{uuid4().hex[:20]}"
        items: list[BatchPredictionItem] = []
        valid_records: list[tuple[int, SensorRecord, pd.DataFrame]] = []
        for index, raw_record in enumerate(request.records):
            try:
                record = SENSOR_RECORD_ADAPTER.validate_python(raw_record)
                frame = self._validate_sensor_record(record, model)
            except ValidationError as exc:
                items.append(BatchPredictionItem(index=index, error=BatchRecordError(index=index, code="validation_error", message="Sensor record validation failed.", details=[{"location": list(error["loc"]), "message": error["msg"], "type": error["type"]} for error in exc.errors()])))
            except InvalidRequestError as exc:
                items.append(BatchPredictionItem(index=index, error=BatchRecordError(index=index, code=exc.error_code, message=exc.detail, details=exc.details if isinstance(exc.details, list) else ([exc.details] if exc.details is not None else []))))
            else:
                valid_records.append((index, record, frame))
        total_inference_ms = 0.0
        if valid_records:
            frame = pd.concat([item[2] for item in valid_records], ignore_index=True)
            raw, calibrated, elapsed_ms = self._predict_arrays(model, policy, frame)
            total_inference_ms = elapsed_ms
            per_record_ms = elapsed_ms / len(valid_records)
            for result_index, (index, record, _record_frame) in enumerate(valid_records):
                explanation = self._prediction_explanation(model, request.include_explanation)
                persisted = self._persist_prediction(
                    model,
                    policy,
                    record,
                    float(raw[result_index]),
                    float(calibrated[result_index]),
                    per_record_ms,
                    batch_id=batch_id,
                    batch_index=index,
                    explanation=explanation,
                )
                items.append(BatchPredictionItem(index=index, prediction=self._response_from_record(persisted)))
        items.sort(key=lambda item: item.index)
        predictions = [item.prediction for item in items if item.prediction is not None]
        positive_count = sum(1 for item in predictions if item and item.predicted_class == "pos")
        negative_count = sum(1 for item in predictions if item and item.predicted_class == "neg")
        successful = len(predictions)
        return BatchPredictionResponse(
            batch_id=batch_id,
            model_reference_type=model.reference_type,  # type: ignore[arg-type]
            model_reference_id=model.reference_id,
            model_version=model.model_version,
            decision_policy_id=policy.policy_id,
            items=items,
            total_records=len(request.records),
            successful_count=successful,
            failed_count=len(request.records) - successful,
            positive_count=positive_count,
            negative_count=negative_count,
            total_inference_duration_ms=total_inference_ms,
            average_inference_duration_ms=(total_inference_ms / successful if successful else 0.0),
            warnings=policy.warnings,
        )

    def get_prediction(self, prediction_id: str) -> PredictionResponse:
        record = self.session.get(PredictionRecord, prediction_id)
        if record is None:
            raise ResourceNotFoundError(f"Prediction '{prediction_id}' was not found.")
        return self._response_from_record(record)

    def list_predictions(
        self,
        page: int,
        page_size: int,
        *,
        model_reference_id: str | None = None,
        model_reference_type: str | None = None,
        predicted_class: str | None = None,
        vehicle_identifier: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> PredictionHistoryResponse:
        if date_from and date_to and date_from > date_to:
            raise InvalidRequestError("date_from must be earlier than or equal to date_to.")
        statement = select(PredictionRecord).order_by(desc(PredictionRecord.prediction_timestamp))
        count_statement = select(func.count()).select_from(PredictionRecord)
        filters: list[Any] = []
        if model_reference_id:
            filters.append(PredictionRecord.model_reference_id == model_reference_id)
        if model_reference_type:
            filters.append(PredictionRecord.model_reference_type == model_reference_type)
        if predicted_class:
            filters.append(PredictionRecord.predicted_class == predicted_class)
        if vehicle_identifier:
            filters.append(PredictionRecord.vehicle_identifier == vehicle_identifier)
        if date_from:
            filters.append(PredictionRecord.prediction_timestamp >= date_from)
        if date_to:
            filters.append(PredictionRecord.prediction_timestamp <= date_to)
        if filters:
            statement = statement.where(*filters)
            count_statement = count_statement.where(*filters)
        total = int(self.session.scalar(count_statement) or 0)
        records = list(self.session.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
        return PredictionHistoryResponse(
            items=[self._response_from_record(record) for record in records],
            total=total,
            page=page,
            page_size=page_size,
        )

    def list_policies(
        self,
        page: int,
        page_size: int,
        *,
        model_reference_id: str | None = None,
        model_reference_type: str | None = None,
    ) -> DecisionPolicyListResponse:
        statement = select(DecisionPolicy).order_by(desc(DecisionPolicy.created_at))
        count_statement = select(func.count()).select_from(DecisionPolicy)
        if model_reference_id:
            statement = statement.where(DecisionPolicy.model_reference_id == model_reference_id)
            count_statement = count_statement.where(DecisionPolicy.model_reference_id == model_reference_id)
        if model_reference_type:
            statement = statement.where(DecisionPolicy.model_reference_type == model_reference_type)
            count_statement = count_statement.where(DecisionPolicy.model_reference_type == model_reference_type)
        total = int(self.session.scalar(count_statement) or 0)
        policies = list(self.session.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
        return DecisionPolicyListResponse(
            items=[self._policy_summary(policy) for policy in policies],
            total=total,
            page=page,
            page_size=page_size,
        )

    def list_models(self, page: int, page_size: int) -> PredictionModelListResponse:
        options: list[PredictionModelOption] = []
        training_runs = list(self.session.scalars(select(ModelTrainingRun).where(ModelTrainingRun.status == "completed")))
        experiment_runs = list(self.session.scalars(select(ExperimentRun).where(ExperimentRun.status == "completed")))
        for run in training_runs:
            try:
                feature_count = len(json.loads(run.feature_names_before_json))
            except (TypeError, json.JSONDecodeError):
                feature_count = 0
            policy_count = int(self.session.scalar(select(func.count()).select_from(DecisionPolicy).where(DecisionPolicy.model_reference_type == "training_run", DecisionPolicy.model_reference_id == run.run_id, DecisionPolicy.status.in_(["active", "completed", "ready"]))) or 0)
            options.append(PredictionModelOption(model_reference_type="training_run", model_reference_id=run.run_id, model_name=run.model_name, model_version=run.model_version, dataset_id=run.dataset_id, status=run.status, feature_count=feature_count, default_threshold=run.threshold, available_policy_count=policy_count))
        for run in experiment_runs:
            try:
                feature_count = len(json.loads(run.configuration_json).get("feature_names_before", []))
            except (TypeError, json.JSONDecodeError, AttributeError):
                feature_count = 0
            policy_count = int(self.session.scalar(select(func.count()).select_from(DecisionPolicy).where(DecisionPolicy.model_reference_type == "experiment", DecisionPolicy.model_reference_id == run.experiment_id, DecisionPolicy.status.in_(["active", "completed", "ready"]))) or 0)
            options.append(PredictionModelOption(model_reference_type="experiment", model_reference_id=run.experiment_id, model_name=run.model_name, model_version=run.model_version, dataset_id=run.dataset_id, status=run.status, feature_count=feature_count, default_threshold=run.threshold, available_policy_count=policy_count))
        options.sort(key=lambda item: (item.model_name, item.model_reference_id))
        total = len(options)
        start = (page - 1) * page_size
        return PredictionModelListResponse(items=options[start : start + page_size], total=total, page=page, page_size=page_size)

    def feature_schema(self, reference: PredictionReference) -> FeatureSchemaResponse:
        model = self.resolve_model(reference)
        return FeatureSchemaResponse(
            model_reference_type=model.reference_type,  # type: ignore[arg-type]
            model_reference_id=model.reference_id,
            model_version=model.model_version,
            feature_count=len(model.feature_names),
            feature_names=model.feature_names,
        )

    def clear_cache(self) -> None:
        self.cache.clear()
