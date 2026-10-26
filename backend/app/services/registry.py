"""Unified experiment/model lineage, lifecycle and reproducibility services."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import ArtifactCompatibilityError, ArtifactUnavailableError, InvalidRequestError, ResourceNotFoundError
from app.models.dataset import DatasetMetadata
from app.models.experiment import ExperimentRun
from app.models.prediction import DecisionPolicy, PredictionRecord
from app.models.registry import ModelPromotion
from app.models.training import ModelTrainingRun
from app.schemas.registry import (
    ArtifactInventoryItem,
    ArtifactInventoryResponse,
    ModelLineageResponse,
    ModelVersionHistoryResponse,
    PromotionListResponse,
    PromotionRequest,
    PromotionSummary,
    RegistryDetailResponse,
    RegistryLifecycleRequest,
    RegistryListResponse,
    RegistryModelSummary,
    ReproducibilityCheck,
    ReproducibilityResponse,
)
from app.services.model_training.artifacts import experiment_artifact_paths, training_artifact_paths
from app.services.reproducibility import compare_checksums, dependency_versions, parse_json_object


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass(frozen=True)
class RegistryReference:
    reference_type: str
    reference_id: str
    run: ModelTrainingRun | ExperimentRun


class ModelRegistryService:
    """Operate on the existing training/experiment registries without duplicating them."""

    def __init__(self, settings: Settings, session: Session) -> None:
        self.settings = settings
        self.session = session

    def resolve(self, reference_type: str, reference_id: str) -> RegistryReference:
        if reference_type == "training_run":
            run = self.session.get(ModelTrainingRun, reference_id)
        elif reference_type == "experiment":
            run = self.session.get(ExperimentRun, reference_id)
        else:
            raise InvalidRequestError("reference_type must be training_run or experiment.")
        if run is None:
            raise ResourceNotFoundError(f"{reference_type} '{reference_id}' was not found.")
        return RegistryReference(reference_type, reference_id, run)

    @staticmethod
    def _effective_lifecycle(run: ModelTrainingRun | ExperimentRun) -> str:
        registry_status = getattr(run, "registry_status", None)
        if registry_status:
            return registry_status
        if run.status == "completed":
            return "evaluated"
        if run.status == "failed":
            return "failed"
        return "registered"

    @staticmethod
    def _metrics(run: ModelTrainingRun | ExperimentRun) -> dict[str, Any] | None:
        value = getattr(run, "metrics_json", None)
        if not value:
            return None
        try:
            payload = json.loads(value)
        except json.JSONDecodeError:
            return None
        return payload if isinstance(payload, dict) else None

    @staticmethod
    def _configuration(run: ModelTrainingRun | ExperimentRun) -> dict[str, Any]:
        value = run.preprocessing_configuration_json if isinstance(run, ModelTrainingRun) else run.configuration_json
        return parse_json_object(value)

    @staticmethod
    def _paths(settings: Settings, reference: RegistryReference) -> dict[str, Path]:
        if reference.reference_type == "training_run":
            paths = training_artifact_paths(settings.model_artifact_dir, reference.reference_id)
            return {"model": paths.model, "preprocessor": paths.preprocessor, "metadata": paths.metadata, "splits": paths.split_metadata}
        paths = experiment_artifact_paths(settings.model_artifact_dir, reference.reference_id)
        return {
            "pipeline": paths.pipeline,
            "preprocessor": paths.preprocessor,
            "metadata": paths.metadata,
            "splits": paths.split_metadata,
            "curves": paths.curves,
            "feature_importance": paths.feature_importance,
            "confusion_matrix": paths.confusion_matrix_visualization,
        }

    @staticmethod
    def _stored_checksums(run: ModelTrainingRun | ExperimentRun) -> dict[str, str]:
        return {key: value for key, value in parse_json_object(getattr(run, "artifact_checksums_json", "{}")).items() if isinstance(value, str)}

    def _inventory(self, reference: RegistryReference, *, persist_backfill: bool = True) -> ArtifactInventoryResponse:
        paths = self._paths(self.settings, reference)
        stored = self._stored_checksums(reference.run)
        result = compare_checksums(paths, stored)
        if persist_backfill and (not stored or any(item["status"] == "checksum_missing" for item in result["items"])):
            existing = {item["logical_name"]: item["actual_checksum"] for item in result["items"] if item["actual_checksum"]}
            reference.run.artifact_checksums_json = json.dumps(existing)
            reference.run.artifact_integrity_status = "verified" if result["all_verified"] else "checksum_missing" if result["all_available"] else "missing"
            self.session.commit()
            stored = existing
            result = compare_checksums(paths, stored)
        integrity_status = "verified" if result["all_verified"] else "missing" if not result["all_available"] else "mismatch" if any(item["status"] == "mismatch" for item in result["items"]) else "checksum_missing"
        if getattr(reference.run, "artifact_integrity_status", None) != integrity_status:
            reference.run.artifact_integrity_status = integrity_status
            self.session.commit()
        return ArtifactInventoryResponse(
            model_reference_type=reference.reference_type,  # type: ignore[arg-type]
            model_reference_id=reference.reference_id,
            model_version=reference.run.model_version,
            artifact_integrity_status=integrity_status,
            items=[ArtifactInventoryItem.model_validate(item) for item in result["items"]],
            all_available=result["all_available"],
            all_verified=result["all_verified"],
        )

    def verify_artifacts(self, reference_type: str, reference_id: str, *, persist_backfill: bool = True) -> ArtifactInventoryResponse:
        return self._inventory(self.resolve(reference_type, reference_id), persist_backfill=persist_backfill)

    def _prediction_count(self, reference: RegistryReference) -> int:
        return int(
            self.session.scalar(
                select(func.count()).select_from(PredictionRecord).where(
                    PredictionRecord.model_reference_type == reference.reference_type,
                    PredictionRecord.model_reference_id == reference.reference_id,
                )
            )
            or 0
        )

    def _policy_count(self, reference: RegistryReference) -> int:
        return int(
            self.session.scalar(
                select(func.count()).select_from(DecisionPolicy).where(
                    DecisionPolicy.model_reference_type == reference.reference_type,
                    DecisionPolicy.model_reference_id == reference.reference_id,
                )
            )
            or 0
        )

    def summary(self, reference: RegistryReference) -> RegistryModelSummary:
        metrics = self._metrics(reference.run)
        return RegistryModelSummary(
            model_reference_type=reference.reference_type,  # type: ignore[arg-type]
            model_reference_id=reference.reference_id,
            model_name=reference.run.model_name,
            model_version=reference.run.model_version,
            execution_status=reference.run.status,
            lifecycle_status=self._effective_lifecycle(reference.run),  # type: ignore[arg-type]
            dataset_id=reference.run.dataset_id,
            dataset_fingerprint=reference.run.dataset_fingerprint,
            configuration_fingerprint=getattr(reference.run, "configuration_fingerprint", None),
            split_identifier=getattr(reference.run, "split_identifier", None),
            primary_metric=metrics.get("pr_auc") if metrics else None,
            artifact_integrity_status=getattr(reference.run, "artifact_integrity_status", "pending"),
            created_at=reference.run.created_at,
            completed_at=reference.run.completed_at,
            archived_at=getattr(reference.run, "archived_at", None),
            policy_count=self._policy_count(reference),
            prediction_count=self._prediction_count(reference),
        )

    def _associated_training_ids(self, reference: RegistryReference) -> list[str]:
        if reference.reference_type == "training_run":
            return [reference.reference_id]
        return list(
            self.session.scalars(
                select(ModelTrainingRun.run_id).where(
                    ModelTrainingRun.dataset_id == reference.run.dataset_id,
                    ModelTrainingRun.model_name == reference.run.model_name,
                    ModelTrainingRun.model_version == reference.run.model_version,
                )
            )
        )

    def detail(self, reference_type: str, reference_id: str) -> RegistryDetailResponse:
        reference = self.resolve(reference_type, reference_id)
        inventory = self._inventory(reference)
        run = reference.run
        if isinstance(run, ModelTrainingRun):
            configuration = parse_json_object(run.preprocessing_configuration_json)
            hyperparameters = parse_json_object(run.hyperparameters_json)
            imbalance = parse_json_object(run.class_imbalance_configuration_json)
            before = json.loads(run.feature_names_before_json or "[]")
            after = json.loads(run.feature_names_after_json or "[]")
        else:
            configuration = parse_json_object(run.configuration_json)
            hyperparameters = parse_json_object(run.best_parameters_json)
            imbalance = {"strategy": run.imbalance_strategy, "configuration": configuration.get("class_imbalance", {})}
            before = configuration.get("feature_names_before", [])
            after = configuration.get("feature_names_after", [])
        policies = list(
            self.session.scalars(
                select(DecisionPolicy).where(
                    DecisionPolicy.model_reference_type == reference_type,
                    DecisionPolicy.model_reference_id == reference_id,
                )
            )
        )
        policy_ids = [policy.policy_id for policy in policies]
        return RegistryDetailResponse(
            **self.summary(reference).model_dump(),
            preprocessing_configuration=configuration,
            hyperparameters=hyperparameters,
            imbalance_configuration=imbalance,
            feature_names_before=before if isinstance(before, list) else [],
            feature_names_after=after if isinstance(after, list) else [],
            library_versions=parse_json_object(getattr(run, "library_versions_json", "{}")),
            artifact_checksums=parse_json_object(getattr(run, "artifact_checksums_json", "{}")),
            associated_training_run_ids=self._associated_training_ids(reference),
            decision_policy_ids=policy_ids,
            validation_metrics=self._metrics(run),
            failure_reason=run.error_message,
            lifecycle_metadata=parse_json_object(getattr(run, "lifecycle_metadata_json", "{}")),
        )

    def list_models(
        self,
        page: int,
        page_size: int,
        *,
        model_name: str | None = None,
        lifecycle_status: str | None = None,
        execution_status: str | None = None,
        dataset_id: str | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
    ) -> RegistryListResponse:
        items: list[RegistryModelSummary] = []
        for reference_type, model in (("training_run", ModelTrainingRun), ("experiment", ExperimentRun)):
            statement = select(model).order_by(desc(model.created_at))
            if model_name:
                statement = statement.where(model.model_name == model_name)
            if execution_status:
                statement = statement.where(model.status == execution_status)
            if dataset_id:
                statement = statement.where(model.dataset_id == dataset_id)
            if date_from:
                statement = statement.where(model.created_at >= date_from)
            if date_to:
                statement = statement.where(model.created_at <= date_to)
            for run in self.session.scalars(statement):
                reference = RegistryReference(reference_type, run.run_id if reference_type == "training_run" else run.experiment_id, run)
                if lifecycle_status and self._effective_lifecycle(run) != lifecycle_status:
                    continue
                items.append(self.summary(reference))
        items.sort(key=lambda item: item.created_at, reverse=True)
        total = len(items)
        start = (page - 1) * page_size
        return RegistryListResponse(items=items[start : start + page_size], total=total, page=page, page_size=page_size)

    def version_history(self, model_name: str, page: int, page_size: int) -> ModelVersionHistoryResponse:
        result = self.list_models(page=1, page_size=10_000, model_name=model_name)
        start = (page - 1) * page_size
        return ModelVersionHistoryResponse(model_name=model_name, items=result.items[start : start + page_size], total=result.total, page=page, page_size=page_size)

    def lineage(self, reference_type: str, reference_id: str) -> ModelLineageResponse:
        reference = self.resolve(reference_type, reference_id)
        inventory = self._inventory(reference)
        run = reference.run
        dataset = self.session.get(DatasetMetadata, run.dataset_id)
        if dataset is None:
            raise ResourceNotFoundError(f"Dataset '{run.dataset_id}' was not found for registry reference '{reference_id}'.")
        configuration = self._configuration(run)
        split = {
            "split_identifier": getattr(run, "split_identifier", None),
            "validation_ratio": run.validation_ratio,
            "random_seed": run.random_seed,
            "training_records": run.training_records,
            "validation_records": run.validation_records,
        }
        preprocessing = configuration if reference_type == "training_run" else {
            "strategy": run.preprocessing_strategy,
            "feature_names_before": configuration.get("feature_names_before", []),
            "feature_names_after": configuration.get("feature_names_after", []),
        }
        policies = list(
            self.session.scalars(
                select(DecisionPolicy).where(
                    DecisionPolicy.model_reference_type == reference_type,
                    DecisionPolicy.model_reference_id == reference_id,
                )
            )
        )
        return ModelLineageResponse(
            model=self.summary(reference),
            dataset={
                "dataset_id": dataset.dataset_id,
                "dataset_name": dataset.dataset_name,
                "dataset_type": dataset.dataset_type,
                "fingerprint": dataset.fingerprint,
                "record_count": dataset.record_count,
                "feature_count": dataset.feature_count,
                "target_column": dataset.target_column,
            },
            split=split,
            preprocessing=preprocessing,
            configuration=configuration if reference_type == "experiment" else {
                "model_name": run.model_name,
                "model_version": run.model_version,
                "hyperparameters": parse_json_object(run.hyperparameters_json),
                "imbalance": parse_json_object(run.class_imbalance_configuration_json),
            },
            artifact_references=[item.logical_name for item in inventory.items],
            decision_policies=[
                {
                    "policy_id": policy.policy_id,
                    "policy_name": policy.policy_name,
                    "policy_version": policy.policy_version,
                    "threshold": policy.threshold,
                    "calibration_method": policy.calibration_method,
                    "status": policy.status,
                }
                for policy in policies
            ],
            prediction_count=self._prediction_count(reference),
        )

    def transition(self, reference_type: str, reference_id: str, request: RegistryLifecycleRequest) -> RegistryDetailResponse:
        reference = self.resolve(reference_type, reference_id)
        run = reference.run
        current = self._effective_lifecycle(run)
        target = request.target_status
        allowed = {
            "registered": {"trained", "evaluated", "archived", "failed"},
            "trained": {"evaluated", "archived"},
            "evaluated": {"eligible", "archived"},
            "eligible": {"archived"},
            "approved": {"archived", "eligible"},
            "failed": {"registered", "archived"},
            "archived": set(),
        }
        if target == current:
            return self.detail(reference_type, reference_id)
        if target not in allowed.get(current, set()):
            raise InvalidRequestError(f"Lifecycle transition from '{current}' to '{target}' is not allowed.")
        if target in {"trained", "evaluated", "eligible"} and run.status != "completed":
            raise InvalidRequestError("A model must have a completed execution before lifecycle promotion.")
        if target in {"trained", "evaluated", "eligible"}:
            inventory = self._inventory(reference)
            if not inventory.all_available or not inventory.all_verified:
                raise ArtifactUnavailableError("All registered artifacts must exist and pass checksum verification.")
        if target == "evaluated" and self._metrics(run) is None:
            raise InvalidRequestError("Evaluation status requires recorded validation metrics.")
        if target == "eligible":
            if not request.genuine_aps_evaluation_completed or not request.evaluation_evidence:
                raise InvalidRequestError("A model can be eligible only after explicit genuine APS evaluation evidence is recorded.")
        lifecycle_metadata = parse_json_object(getattr(run, "lifecycle_metadata_json", "{}"))
        lifecycle_metadata.update({"last_transition_note": request.note, "transitioned_at": utc_now().isoformat()})
        if request.genuine_aps_evaluation_completed:
            lifecycle_metadata.update({"genuine_aps_evaluation_completed": True, "evaluation_evidence": request.evaluation_evidence})
        run.registry_status = target
        run.lifecycle_metadata_json = json.dumps(lifecycle_metadata)
        if target == "archived":
            run.archived_at = utc_now()
        self.session.commit()
        return self.detail(reference_type, reference_id)

    def _policy_for_promotion(self, reference: RegistryReference, policy_id: str) -> DecisionPolicy:
        policy = self.session.get(DecisionPolicy, policy_id)
        if policy is None:
            raise ResourceNotFoundError(f"Decision policy '{policy_id}' was not found.")
        if policy.model_reference_type != reference.reference_type or policy.model_reference_id != reference.reference_id or policy.model_version != reference.run.model_version:
            raise ArtifactCompatibilityError("The decision policy is not compatible with the selected model version.")
        if policy.status not in {"active", "completed", "ready"}:
            raise InvalidRequestError("The decision policy is not available for promotion.")
        return policy

    def promote(self, reference_type: str, reference_id: str, request: PromotionRequest) -> PromotionSummary:
        reference = self.resolve(reference_type, reference_id)
        if self._effective_lifecycle(reference.run) != "eligible":
            raise InvalidRequestError("Only an eligible model with explicit evaluation evidence can be promoted.")
        if not request.confirm_genuine_aps_evaluation:
            raise InvalidRequestError("Promotion requires confirmation of genuine APS evaluation; synthetic results cannot be promoted.")
        lifecycle_metadata = parse_json_object(getattr(reference.run, "lifecycle_metadata_json", "{}"))
        if lifecycle_metadata.get("synthetic_fixture"):
            raise InvalidRequestError("Synthetic fixtures cannot be promoted as production-approved models.")
        if not lifecycle_metadata.get("genuine_aps_evaluation_completed"):
            raise InvalidRequestError("The model has no recorded genuine APS evaluation evidence.")
        inventory = self._inventory(reference)
        if not inventory.all_verified:
            raise ArtifactUnavailableError("Promotion requires verified model artifacts.")
        policy = self._policy_for_promotion(reference, request.decision_policy_id)
        if policy.calibration_artifact_path and policy.artifact_integrity_status != "verified":
            raise ArtifactUnavailableError("Promotion requires a verified calibration artifact when calibration is configured.")
        current = self.session.scalar(select(ModelPromotion).where(ModelPromotion.status == "active"))
        now = utc_now()
        if current is not None:
            current.status = "superseded"
            current.superseded_at = now
        promotion = ModelPromotion(
            promotion_id=f"promotion-{uuid4().hex[:20]}",
            model_reference_type=reference_type,
            model_reference_id=reference_id,
            model_version=reference.run.model_version,
            decision_policy_id=policy.policy_id,
            decision_policy_version=policy.policy_version,
            status="active",
            previous_promotion_id=current.promotion_id if current else None,
            genuine_evaluation_confirmed=True,
            evaluation_evidence=request.evaluation_evidence,
            note=request.note,
            promoted_at=now,
        )
        reference.run.registry_status = "approved"
        lifecycle_metadata.update({"approved_at": now.isoformat(), "approval_evidence": request.evaluation_evidence})
        reference.run.lifecycle_metadata_json = json.dumps(lifecycle_metadata)
        self.session.add(promotion)
        self.session.commit()
        self.session.refresh(promotion)
        return self._promotion_summary(promotion)

    @staticmethod
    def _promotion_summary(promotion: ModelPromotion) -> PromotionSummary:
        return PromotionSummary.model_validate(promotion, from_attributes=True)

    def list_promotions(self, page: int, page_size: int) -> PromotionListResponse:
        statement = select(ModelPromotion).order_by(desc(ModelPromotion.promoted_at))
        total = int(self.session.scalar(select(func.count()).select_from(ModelPromotion)) or 0)
        rows = list(self.session.scalars(statement.offset((page - 1) * page_size).limit(page_size)))
        return PromotionListResponse(items=[self._promotion_summary(row) for row in rows], total=total, page=page, page_size=page_size)

    def revert_promotion(self, promotion_id: str) -> PromotionSummary:
        promotion = self.session.get(ModelPromotion, promotion_id)
        if promotion is None:
            raise ResourceNotFoundError(f"Promotion '{promotion_id}' was not found.")
        if promotion.status != "active":
            raise InvalidRequestError("Only the active promotion can be reverted.")
        promotion.status = "reverted"
        promotion.reverted_at = utc_now()
        if promotion.previous_promotion_id:
            previous = self.session.get(ModelPromotion, promotion.previous_promotion_id)
            if previous is not None and previous.status == "superseded":
                previous.status = "active"
                previous.superseded_at = None
        self.session.commit()
        self.session.refresh(promotion)
        return self._promotion_summary(promotion)

    def active_promotion(self) -> ModelPromotion | None:
        return self.session.scalar(select(ModelPromotion).where(ModelPromotion.status == "active").order_by(desc(ModelPromotion.promoted_at)))

    def reproducibility(self, reference_type: str, reference_id: str) -> ReproducibilityResponse:
        reference = self.resolve(reference_type, reference_id)
        run = reference.run
        checks: list[ReproducibilityCheck] = []
        missing: list[str] = []
        dataset = self.session.get(DatasetMetadata, run.dataset_id)
        if dataset is None:
            checks.append(ReproducibilityCheck(name="dataset_registry", status="unavailable", message="The referenced dataset registry row is missing."))
            missing.append("dataset_registry")
            source_available = False
        else:
            source_path = Path(dataset.source_path)
            source_available = source_path.is_file()
            if dataset.fingerprint != run.dataset_fingerprint:
                checks.append(ReproducibilityCheck(name="dataset_fingerprint", status="mismatch", message="The dataset fingerprint differs from the run metadata."))
                missing.append("dataset_fingerprint")
            else:
                checks.append(ReproducibilityCheck(name="dataset_fingerprint", status="passed", message="The registered dataset fingerprint matches the run."))
            checks.append(ReproducibilityCheck(name="source_data", status="passed" if source_available else "blocked", message="Source data is available." if source_available else "Source data is unavailable; reproduction is blocked without loading any dataset."))
            if not source_available:
                missing.append("source_data")
        config_fp = getattr(run, "configuration_fingerprint", None)
        if config_fp:
            checks.append(ReproducibilityCheck(name="configuration_fingerprint", status="passed", message="A stable configuration fingerprint is recorded."))
        else:
            checks.append(ReproducibilityCheck(name="configuration_fingerprint", status="unavailable", message="No configuration fingerprint is recorded."))
            missing.append("configuration_fingerprint")
        if getattr(run, "split_identifier", None):
            checks.append(ReproducibilityCheck(name="split_identifier", status="passed", message="The train/validation split identifier is recorded."))
        else:
            checks.append(ReproducibilityCheck(name="split_identifier", status="unavailable", message="No split identifier is recorded."))
            missing.append("split_identifier")
        inventory = self._inventory(reference, persist_backfill=False)
        checks.append(ReproducibilityCheck(name="artifact_integrity", status="passed" if inventory.all_verified else "mismatch" if inventory.all_available else "blocked", message="All artifacts are present and checksum verified." if inventory.all_verified else "One or more artifacts are missing or do not match their checksum."))
        if not inventory.all_verified:
            missing.append("artifact_integrity")
        stored_dependencies = parse_json_object(getattr(run, "library_versions_json", "{}"))
        current_dependencies = dependency_versions()
        mismatches = {
            key: {"recorded": str(value), "current": current_dependencies.get(key, "unavailable")}
            for key, value in stored_dependencies.items()
            if current_dependencies.get(key) != value
        }
        if stored_dependencies and not mismatches:
            checks.append(ReproducibilityCheck(name="dependency_versions", status="passed", message="Recorded dependency versions match the current environment."))
        else:
            checks.append(ReproducibilityCheck(name="dependency_versions", status="mismatch" if mismatches else "unavailable", message="Dependency versions differ from the recorded environment." if mismatches else "No dependency snapshot is recorded."))
            missing.append("dependency_versions")
        return ReproducibilityResponse(
            model_reference_type=reference_type,  # type: ignore[arg-type]
            model_reference_id=reference_id,
            configuration_fingerprint=config_fp,
            reproducible=bool(source_available and config_fp and getattr(run, "split_identifier", None) and inventory.all_verified and stored_dependencies and not mismatches and not missing),
            source_data_available=source_available,
            checks=checks,
            missing_prerequisites=sorted(set(missing)),
            dependency_mismatches=mismatches,
            test_dataset_loaded=False,
        )
