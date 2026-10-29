"""Read-only adapters for the persisted Phase 3, 4 and 9 evidence stores."""

from __future__ import annotations

import csv
from datetime import datetime
import json
from pathlib import Path
import re
import sqlite3
from typing import Any

from app.core.config import Settings
from app.core.exceptions import (
    ArtifactCompatibilityError,
    ArtifactUnavailableError,
    DatabaseOperationError,
    ResourceNotFoundError,
)
from app.schemas.historical_evidence import (
    HistoricalArtifact,
    HistoricalAvailability,
    HistoricalCalibrationResponse,
    HistoricalConfusionMatrix,
    HistoricalCrossValidation,
    HistoricalEvidenceOverview,
    HistoricalMetric,
    OfficialTestConfidenceInterval,
    OfficialTestEvidenceResponse,
    HistoricalRunDetail,
    HistoricalRunListResponse,
    HistoricalRunSummary,
    HistoricalThresholdPoint,
    HistoricalThresholdResponse,
    HistoricalValidationComparisonResponse,
    HistoricalValidationResponse,
)
from app.services.reproducibility import sha256_file


EVIDENCE_VERSION = "phase11.3.v1"
NORMALIZATION_VERSION = "phase9-validation-nested-v1"
OFFICIAL_TEST_EVIDENCE_VERSION = "phase10-official-test.v1"
_SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")


def _json(value: str | None, fallback: Any) -> Any:
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError):
        return fallback


def _dict(value: str | None) -> dict[str, Any]:
    payload = _json(value, {})
    return payload if isinstance(payload, dict) else {}


def _list(value: str | None) -> list[Any]:
    payload = _json(value, [])
    return payload if isinstance(payload, list) else []


def _datetime(value: Any) -> datetime | None:
    if not value:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _int(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


def _safe_component(value: str) -> str:
    if not _SAFE_COMPONENT.fullmatch(value):
        raise ResourceNotFoundError("The historical evidence reference is invalid.")
    return value


def _metric(
    payload: dict[str, Any],
    *,
    scope: str,
    label: str,
    source_reference: str,
) -> HistoricalMetric:
    matrix = payload.get("confusion_matrix")
    if not isinstance(matrix, dict):
        matrix = payload
    confusion = None
    required = ("true_negative", "false_positive", "false_negative", "true_positive")
    if all(key in matrix for key in required):
        confusion = HistoricalConfusionMatrix(**{key: int(matrix[key]) for key in required})
    return HistoricalMetric(
        scope=scope,  # type: ignore[arg-type]
        label=label,
        threshold=_number(payload.get("threshold")),
        pr_auc=_number(payload.get("pr_auc")),
        roc_auc=_number(payload.get("roc_auc")),
        precision=_number(payload.get("precision")),
        recall=_number(payload.get("recall")),
        f1_score=_number(payload.get("f1_score")),
        specificity=_number(payload.get("specificity")),
        balanced_accuracy=_number(payload.get("balanced_accuracy")),
        accuracy=_number(payload.get("accuracy")),
        false_positive_cost=_number(payload.get("false_positive_cost")),
        false_negative_cost=_number(payload.get("false_negative_cost")),
        estimated_business_cost=_number(payload.get("estimated_business_cost", payload.get("business_cost"))),
        business_cost_note=payload.get("business_cost_note"),
        confusion_matrix=confusion,
        source_reference=source_reference,
    )


class HistoricalEvidenceService:
    """Read historical evidence without using the active ORM or loading models."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.backend_root = settings.persistent_storage_dir.resolve().parent
        self.data_root = settings.persistent_storage_dir.resolve()
        self.model_root = settings.model_artifact_dir.resolve()
        self.phase9_root = self.model_root.parent / "phase9" / "phase9-final-validation"
        self.phase10_root = self.model_root.parent / "phase10" / "official-test-evaluation"

    def _database_path(self, name: str) -> Path:
        return (self.data_root / name).resolve()

    def _connect(self, name: str) -> sqlite3.Connection | None:
        path = self._database_path(name)
        if not path.is_file():
            return None
        try:
            conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
            conn.execute("SELECT 1 FROM sqlite_master LIMIT 1")
            return conn
        except sqlite3.DatabaseError as exc:
            raise ArtifactCompatibilityError(f"Historical evidence database '{name}' is not a readable SQLite database.") from exc
        except OSError as exc:
            raise DatabaseOperationError(f"The historical evidence database '{name}' could not be opened.") from exc

    def _connect_required(self, name: str) -> sqlite3.Connection:
        path = self._database_path(name)
        if not path.is_file():
            raise ArtifactUnavailableError(f"Historical evidence database '{name}' is unavailable.")
        try:
            conn = sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)
            conn.execute("SELECT 1 FROM sqlite_master LIMIT 1")
            return conn
        except sqlite3.DatabaseError as exc:
            raise ArtifactCompatibilityError(f"Historical evidence database '{name}' is not a readable SQLite database.") from exc
        except OSError as exc:
            raise DatabaseOperationError(f"The historical evidence database '{name}' could not be opened.") from exc

    @staticmethod
    def _rows(connection: sqlite3.Connection, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        connection.row_factory = sqlite3.Row
        try:
            return [dict(row) for row in connection.execute(query, params)]
        except sqlite3.OperationalError as exc:
            if "no such table" in str(exc).lower() or "no such column" in str(exc).lower():
                raise ArtifactCompatibilityError("Historical evidence database schema is incompatible with this reader.") from exc
            raise DatabaseOperationError("The historical evidence database could not be read.") from exc
        except sqlite3.DatabaseError as exc:
            raise DatabaseOperationError("The historical evidence database could not be read.") from exc

    @staticmethod
    def _row(connection: sqlite3.Connection, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        rows = HistoricalEvidenceService._rows(connection, query, params)
        return rows[0] if rows else None

    @staticmethod
    def _read_json_file(path: Path, label: str) -> dict[str, Any]:
        if not path.is_file():
            return {}
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except OSError as exc:
            raise ArtifactUnavailableError(f"The persisted {label} evidence could not be read.") from exc
        except json.JSONDecodeError as exc:
            raise ArtifactCompatibilityError(f"The persisted {label} evidence is not valid JSON.") from exc
        if not isinstance(payload, dict):
            raise ArtifactCompatibilityError(f"The persisted {label} evidence has an incompatible schema.")
        return payload

    def _artifact(self, logical_name: str, path: Path, stored_checksum: str | None = None) -> HistoricalArtifact:
        try:
            relative = path.resolve().relative_to(self.backend_root)
            relative_path = str(relative).replace("\\", "/")
        except ValueError:
            return HistoricalArtifact(
                logical_name=logical_name,
                relative_path="",
                exists=False,
                readable=False,
                stored_checksum=stored_checksum,
                checksum_status="unavailable",
                message="Artifact path is outside the configured backend root.",
            )
        if not path.is_file():
            return HistoricalArtifact(
                logical_name=logical_name,
                relative_path=relative_path,
                exists=False,
                readable=False,
                stored_checksum=stored_checksum,
                checksum_status="missing",
                message="Persisted artifact file is missing.",
            )
        try:
            actual = sha256_file(path)
            status = "verified" if stored_checksum and stored_checksum == actual else "mismatch" if stored_checksum else "not_recorded"
            return HistoricalArtifact(
                logical_name=logical_name,
                relative_path=relative_path,
                exists=True,
                readable=True,
                size_bytes=path.stat().st_size,
                stored_checksum=stored_checksum,
                actual_checksum=actual,
                checksum_status=status,
                message=None if status in {"verified", "not_recorded"} else "Persisted checksum does not match the artifact.",
            )
        except OSError as exc:
            return HistoricalArtifact(
                logical_name=logical_name,
                relative_path=relative_path,
                exists=True,
                readable=False,
                size_bytes=path.stat().st_size,
                stored_checksum=stored_checksum,
                checksum_status="unavailable",
                message=f"Artifact could not be read: {exc}",
            )

    def _trusted_artifact_path(self, value: str | None, fallback: Path) -> Path:
        """Resolve a historical path only when it remains under the model root."""

        candidate = fallback if not value else Path(value)
        if not candidate.is_absolute():
            candidate = self.backend_root / candidate
        try:
            resolved = candidate.resolve()
            resolved.relative_to(self.model_root)
            return resolved
        except (OSError, ValueError) as exc:
            raise ArtifactCompatibilityError("A historical artifact path is outside the trusted model artifact root.") from exc

    def _trusted_evidence_path(self, path: Path, root: Path | None = None) -> Path:
        trusted_root = (root or self.phase9_root).resolve()
        try:
            resolved = path.resolve()
            resolved.relative_to(trusted_root)
            return resolved
        except (OSError, ValueError) as exc:
            raise ArtifactCompatibilityError("A historical evidence path is outside its trusted evidence root.") from exc

    def _availability(self, name: str, artifacts: list[HistoricalArtifact]) -> HistoricalAvailability:
        if not artifacts:
            return HistoricalAvailability(name=name, status="unavailable", message="No persisted artifact references were found.")
        if any(item.checksum_status == "mismatch" for item in artifacts):
            return HistoricalAvailability(name=name, status="blocked", message="One or more persisted artifacts failed checksum verification.")
        if any(not item.exists or not item.readable for item in artifacts):
            return HistoricalAvailability(name=name, status="blocked", message="One or more persisted artifacts are missing or unreadable.")
        return HistoricalAvailability(name=name, status="available", message="Persisted historical artifacts are available without model loading.")

    def _canonical_artifacts(
        self,
        reference_type: str,
        reference_id: str,
        stored: dict[str, str] | None = None,
        persisted_paths: dict[str, str | None] | None = None,
    ) -> list[HistoricalArtifact]:
        reference_id = _safe_component(reference_id)
        directory = self.model_root / ("training" if reference_type == "training_run" else "experiments") / reference_id
        names = (
            [("model", directory / "model.joblib"), ("preprocessor", directory / "preprocessor.joblib"), ("metadata", directory / "metadata.json"), ("splits", directory / "splits.json")]
            if reference_type == "training_run"
            else [("pipeline", directory / "pipeline.joblib"), ("preprocessor", directory / "preprocessor.joblib"), ("metadata", directory / "metadata.json"), ("splits", directory / "splits.json"), ("curves", directory / "curves.json"), ("feature_importance", directory / "feature_importance.json"), ("confusion_matrix", directory / "confusion_matrix.svg")]
        )
        persisted_paths = persisted_paths or {}
        return [
            self._artifact(
                name,
                self._trusted_artifact_path(persisted_paths.get(name), path),
                (stored or {}).get(name),
            )
            for name, path in names
        ]

    @staticmethod
    def _stored_checksums(row: dict[str, Any]) -> dict[str, str]:
        value = _dict(row.get("artifact_checksums_json"))
        return {key: value for key, value in value.items() if isinstance(value, str)}

    def _phase3_rows(self) -> list[dict[str, Any]]:
        connection = self._connect("phase3_smoke.db")
        if connection is None:
            return []
        try:
            return self._rows(connection, "SELECT * FROM model_training_runs ORDER BY created_at DESC")
        finally:
            connection.close()

    def _phase4_rows(self) -> list[dict[str, Any]]:
        connection = self._connect("phase4_smoke.db")
        if connection is None:
            return []
        try:
            return self._rows(connection, "SELECT * FROM experiment_runs ORDER BY created_at DESC")
        finally:
            connection.close()

    def _phase9_row(self, reference_id: str) -> dict[str, Any] | None:
        connection = self._connect("phase9_validation.db")
        if connection is None:
            return None
        try:
            return self._row(connection, "SELECT * FROM experiment_runs WHERE experiment_id = ?", (_safe_component(reference_id),))
        finally:
            connection.close()

    @staticmethod
    def _cv_from_search(results: list[Any], source_reference: str) -> HistoricalCrossValidation | None:
        values = [_number(item.get("mean_test_pr_auc")) for item in results if isinstance(item, dict)]
        values = [value for value in values if value is not None]
        if not values:
            return None
        first = next((item for item in results if isinstance(item, dict)), {})
        return HistoricalCrossValidation(
            pr_auc_mean=max(values),
            pr_auc_std=_number(first.get("std_test_pr_auc")),
            folds=_int(first.get("cv_folds")),
            search_budget=len(results),
            source_reference=source_reference,
        )

    def _phase3_summary(self, row: dict[str, Any]) -> HistoricalRunSummary:
        metrics = _dict(row.get("metrics_json"))
        artifacts = self._canonical_artifacts(
            "training_run",
            row["run_id"],
            self._stored_checksums(row),
            {
                "model": row.get("model_artifact_path"),
                "preprocessor": row.get("preprocessor_artifact_path"),
                "metadata": row.get("metadata_artifact_path"),
                "splits": row.get("split_metadata_path"),
            },
        )
        return HistoricalRunSummary(
            reference_type="training_run",
            reference_id=row["run_id"],
            phase="phase3",
            model_name=row["model_name"],
            model_version=row["model_version"],
            dataset_id=row["dataset_id"],
            dataset_fingerprint=row.get("dataset_fingerprint"),
            status=row["status"],
            lifecycle_status=row.get("registry_status") or ("evaluated" if row["status"] == "completed" else row["status"]),
            threshold=_number(row.get("threshold")),
            created_at=_datetime(row.get("created_at")),
            completed_at=_datetime(row.get("completed_at")),
            primary_metric=_number(metrics.get("pr_auc")),
            validation_metrics=_metric(metrics, scope="validation", label="Validation / configured threshold", source_reference="phase3_smoke.db") if metrics else None,
            artifact_integrity_status=row.get("artifact_integrity_status") or "not_recorded",
            artifact_available=all(item.exists for item in artifacts),
            feature_importance_available=False,
            hyperparameters=_dict(row.get("hyperparameters_json")),
            source_database="data/phase3_smoke.db",
            training_duration_seconds=_number(row.get("training_duration_seconds")),
            calibration_method=None,
        )

    def _phase4_summary(self, row: dict[str, Any]) -> HistoricalRunSummary:
        metrics = _dict(row.get("metrics_json"))
        search = _list(row.get("search_results_json"))
        artifacts = self._canonical_artifacts(
            "experiment",
            row["experiment_id"],
            self._stored_checksums(row),
            {
                "pipeline": row.get("pipeline_artifact_path"),
                "preprocessor": row.get("preprocessor_artifact_path"),
                "metadata": row.get("metadata_artifact_path"),
                "splits": row.get("split_metadata_path"),
                "curves": row.get("curves_artifact_path"),
                "feature_importance": row.get("feature_importance_artifact_path"),
                "confusion_matrix": row.get("confusion_matrix_visualization_path"),
            },
        )
        return HistoricalRunSummary(
            reference_type="experiment",
            reference_id=row["experiment_id"],
            phase="phase4",
            model_name=row["model_name"],
            model_version=row["model_version"],
            imbalance_strategy=row.get("imbalance_strategy"),
            preprocessing_strategy=row.get("preprocessing_strategy"),
            dataset_id=row["dataset_id"],
            dataset_fingerprint=row.get("dataset_fingerprint"),
            status=row["status"],
            lifecycle_status=row.get("registry_status") or ("evaluated" if row["status"] == "completed" else row["status"]),
            threshold=_number(row.get("threshold")),
            created_at=_datetime(row.get("created_at")),
            completed_at=_datetime(row.get("completed_at")),
            primary_metric=_number(metrics.get("pr_auc")),
            validation_metrics=_metric(metrics, scope="validation", label="Validation / configured threshold", source_reference="phase4_smoke.db") if metrics else None,
            cross_validation=self._cv_from_search(search, "phase4_smoke.db") if search else None,
            artifact_integrity_status=row.get("artifact_integrity_status") or "not_recorded",
            artifact_available=all(item.exists for item in artifacts) if row["status"] == "completed" else False,
            feature_importance_available=any(item.logical_name == "feature_importance" and item.exists for item in artifacts) if row["status"] == "completed" else False,
            hyperparameters=_dict(row.get("best_parameters_json")),
            source_database="data/phase4_smoke.db",
            curves=_dict(row.get("curves_json")) or None,
            training_duration_seconds=_number(row.get("training_duration_seconds")),
            inference_duration_seconds=_number(row.get("inference_duration_seconds")),
            calibration_method=None,
        )

    def _phase9_payloads(self) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
        return (
            self._read_json_file(self.phase9_root / "final_candidate.json", "Phase 9 candidate"),
            self._read_json_file(self.phase9_root / "validation_metrics.json", "Phase 9 validation metrics"),
            self._read_json_file(self.phase9_root / "selected" / "threshold_policy_comparisons.json", "Phase 9 threshold policy"),
            self._read_json_file(self.phase9_root / "selected" / "calibration.json", "Phase 9 calibration"),
        )

    def _phase9_artifacts(self) -> list[HistoricalArtifact]:
        registry_path = self.phase9_root / "registry_verification.json"
        stored: dict[str, str] = {}
        if registry_path.is_file():
            registry = self._read_json_file(registry_path, "Phase 9 registry verification")
            for item in registry.get("artifact_inventory", {}).get("items", []):
                if isinstance(item, dict) and isinstance(item.get("logical_name"), str) and isinstance(item.get("stored_checksum"), str):
                    stored[item["logical_name"]] = item["stored_checksum"]
        row = self._phase9_row("phase9-final-validation-candidate")
        persisted_paths = {
            "pipeline": row.get("pipeline_artifact_path") if row else None,
            "preprocessor": row.get("preprocessor_artifact_path") if row else None,
            "metadata": row.get("metadata_artifact_path") if row else None,
            "splits": row.get("split_metadata_path") if row else None,
            "curves": row.get("curves_artifact_path") if row else None,
            "feature_importance": row.get("feature_importance_artifact_path") if row else None,
            "confusion_matrix": row.get("confusion_matrix_visualization_path") if row else None,
        }
        artifacts = self._canonical_artifacts("experiment", "phase9-final-validation-candidate", stored, persisted_paths)
        evidence_paths = (
            ("final_candidate", self.phase9_root / "final_candidate.json"),
            ("validation_metrics", self.phase9_root / "validation_metrics.json"),
            ("model_comparison", self.phase9_root / "model_comparison.csv"),
            ("dataset_and_split", self.phase9_root / "dataset_and_split.json"),
            ("registry_verification", self.phase9_root / "registry_verification.json"),
            ("calibration", self.phase9_root / "selected" / "calibration.json"),
            ("threshold_policy_comparisons", self.phase9_root / "selected" / "threshold_policy_comparisons.json"),
            ("oof_predictions", self.phase9_root / "selected" / "oof_predictions.json"),
            ("calibrator", self.phase9_root / "selected" / "calibrator_isotonic.joblib"),
        )
        artifacts.extend(
            self._artifact(name, self._trusted_evidence_path(path))
            for name, path in evidence_paths
        )
        return artifacts

    def _phase9_summary(self, row: dict[str, Any]) -> HistoricalRunSummary:
        _final_candidate, validation_metrics, _, _ = self._phase9_payloads()
        selected = validation_metrics.get("selected_candidate", {})
        frozen = selected.get("calibrated_internal_min_cost_threshold", {}) if isinstance(selected, dict) else {}
        artifacts = self._phase9_artifacts()
        lifecycle = _dict(row.get("lifecycle_metadata_json"))
        search_results = _list(row.get("search_results_json"))
        cv_candidates = [
            item
            for item in search_results
            if isinstance(item, dict)
            and item.get("model_name") == row.get("model_name")
            and item.get("representative_strategy") == row.get("imbalance_strategy")
        ]
        cv_candidate = max(
            cv_candidates,
            key=lambda item: _number(item.get("mean_cv_pr_auc")) or -1,
            default={},
        )
        calibration_method = (
            _final_candidate.get("calibration", {}).get("selected_method")
            if isinstance(_final_candidate, dict)
            else None
        )
        return HistoricalRunSummary(
            reference_type="experiment",
            reference_id=row["experiment_id"],
            phase="phase9",
            model_name=row["model_name"],
            model_version=row["model_version"],
            imbalance_strategy=row.get("imbalance_strategy"),
            preprocessing_strategy=row.get("preprocessing_strategy"),
            dataset_id=row["dataset_id"],
            dataset_fingerprint=row.get("dataset_fingerprint"),
            status=row["status"],
            lifecycle_status=row.get("registry_status") or lifecycle.get("phase9_status") or "evaluated",
            threshold=_number(row.get("threshold")) or _number(frozen.get("threshold")),
            created_at=_datetime(row.get("created_at")),
            completed_at=_datetime(row.get("completed_at")),
            primary_metric=_number(frozen.get("pr_auc")),
            validation_metrics=_metric(frozen, scope="validation", label="External validation / frozen threshold 0.115", source_reference="artifacts/phase9/phase9-final-validation/validation_metrics.json") if frozen else None,
            cross_validation=HistoricalCrossValidation(
                pr_auc_mean=_number(cv_candidate.get("mean_cv_pr_auc")),
                pr_auc_std=_number(cv_candidate.get("std_cv_pr_auc")),
                folds=_int(cv_candidate.get("cv_folds")) or _int(row.get("cv_folds")),
                search_budget=_int(row.get("search_budget")),
                source_reference="data/phase9_validation.db:search_results_json",
            ) if cv_candidate else None,
            artifact_integrity_status=row.get("artifact_integrity_status") or "verified",
            artifact_available=all(item.exists for item in artifacts),
            feature_importance_available=any(item.logical_name == "feature_importance" and item.exists for item in artifacts),
            hyperparameters=_dict(row.get("best_parameters_json")),
            source_database="data/phase9_validation.db",
            candidate_label="Final validation candidate — not production approved",
            curves=_dict(row.get("curves_json")) or None,
            training_duration_seconds=_number(row.get("training_duration_seconds")),
            inference_duration_seconds=_number(row.get("inference_duration_seconds")),
            calibration_method=calibration_method,
        )

    def _phase9_summary_if_available(self) -> HistoricalRunSummary | None:
        row = self._phase9_row("phase9-final-validation-candidate")
        if row is None:
            return None
        return self._phase9_summary(row)

    def overview(self) -> HistoricalEvidenceOverview:
        training = [self._phase3_summary(row) for row in self._phase3_rows()]
        experiments = [self._phase4_summary(row) for row in self._phase4_rows()]
        candidate = self._phase9_summary_if_available()
        comparison = experiments + ([candidate] if candidate else [])
        availability = [
            HistoricalAvailability(
                name="phase3_registry",
                status="available" if training else "unavailable",
                message="Phase 3 historical training metadata is available." if training else "Phase 3 historical registry is unavailable.",
            ),
            HistoricalAvailability(
                name="phase4_registry",
                status="available" if experiments else "unavailable",
                message="Phase 4 historical experiment metadata is available." if experiments else "Phase 4 historical registry is unavailable.",
            ),
            HistoricalAvailability(
                name="phase9_candidate",
                status="available" if candidate else "unavailable",
                message="The persisted Phase 9 candidate is available." if candidate else "The Phase 9 candidate registry record is unavailable.",
            ),
        ]
        return HistoricalEvidenceOverview(
            evidence_version=EVIDENCE_VERSION,
            training_runs=training,
            experiments=experiments,
            validation_comparison=comparison,
            candidate_reference_id=candidate.reference_id if candidate else None,
            candidate_lifecycle_status=candidate.lifecycle_status if candidate else None,
            candidate_label=candidate.candidate_label if candidate else None,
            availability=availability,
        )

    @staticmethod
    def _paginate(items: list[HistoricalRunSummary], page: int, page_size: int) -> list[HistoricalRunSummary]:
        start = (page - 1) * page_size
        return items[start : start + page_size]

    def training_runs(self, page: int, page_size: int) -> HistoricalRunListResponse:
        items = [self._phase3_summary(row) for row in self._phase3_rows()]
        return HistoricalRunListResponse(
            items=self._paginate(items, page, page_size), total=len(items), page=page, page_size=page_size,
            availability=[HistoricalAvailability(name="phase3_registry", status="available" if items else "unavailable", message="Read-only Phase 3 historical training evidence.")],
        )

    def experiments(self, page: int, page_size: int) -> HistoricalRunListResponse:
        items = [self._phase4_summary(row) for row in self._phase4_rows()]
        candidate = self._phase9_summary_if_available()
        if candidate:
            items.append(candidate)
        items.sort(key=lambda item: item.created_at or datetime.min, reverse=True)
        return HistoricalRunListResponse(
            items=self._paginate(items, page, page_size), total=len(items), page=page, page_size=page_size,
            availability=[HistoricalAvailability(name="historical_experiments", status="available" if items else "unavailable", message="Read-only Phase 4 and Phase 9 historical experiment evidence.")],
        )

    def _detail_from_phase3(self, row: dict[str, Any]) -> HistoricalRunDetail:
        summary = self._phase3_summary(row)
        artifacts = self._canonical_artifacts(
            "training_run",
            row["run_id"],
            self._stored_checksums(row),
            {
                "model": row.get("model_artifact_path"),
                "preprocessor": row.get("preprocessor_artifact_path"),
                "metadata": row.get("metadata_artifact_path"),
                "splits": row.get("split_metadata_path"),
            },
        )
        return HistoricalRunDetail(
            **summary.model_dump(),
            configuration=_dict(row.get("preprocessing_configuration_json")),
            metrics=[summary.validation_metrics] if summary.validation_metrics else [],
            artifacts=artifacts,
            availability=[self._availability("artifacts", artifacts)],
            provenance=["Read from data/phase3_smoke.db and canonical training artifact paths."],
            error_message=row.get("error_message"),
        )

    def _detail_from_phase4(self, row: dict[str, Any]) -> HistoricalRunDetail:
        summary = self._phase4_summary(row)
        artifacts = self._canonical_artifacts(
            "experiment",
            row["experiment_id"],
            self._stored_checksums(row),
            {
                "pipeline": row.get("pipeline_artifact_path"),
                "preprocessor": row.get("preprocessor_artifact_path"),
                "metadata": row.get("metadata_artifact_path"),
                "splits": row.get("split_metadata_path"),
                "curves": row.get("curves_artifact_path"),
                "feature_importance": row.get("feature_importance_artifact_path"),
                "confusion_matrix": row.get("confusion_matrix_visualization_path"),
            },
        )
        availability = [self._availability("artifacts", artifacts)]
        if row["status"] == "failed":
            availability.append(HistoricalAvailability(name="execution", status="failed", message=row.get("error_message") or "Historical experiment failed without complete artifacts."))
        return HistoricalRunDetail(
            **summary.model_dump(),
            configuration=_dict(row.get("configuration_json")),
            search_results=_list(row.get("search_results_json")),
            feature_importance=[item for item in _list(row.get("feature_importance_json")) if isinstance(item, dict)],
            metrics=[summary.validation_metrics] if summary.validation_metrics else [],
            artifacts=artifacts,
            availability=availability,
            provenance=["Read from data/phase4_smoke.db and canonical experiment artifact paths."],
            error_message=row.get("error_message"),
        )

    def experiment_detail(self, reference_id: str) -> HistoricalRunDetail:
        reference_id = _safe_component(reference_id)
        if reference_id == "phase9-final-validation-candidate":
            conn9 = self._connect_required("phase9_validation.db")
            try:
                row = self._row(conn9, "SELECT * FROM experiment_runs WHERE experiment_id = ?", (reference_id,))
                if row is not None:
                    summary = self._phase9_summary(row)
                    _, validation_metrics, _, _ = self._phase9_payloads()
                    selected = validation_metrics.get("selected_candidate", {})
                    frozen = selected.get("calibrated_internal_min_cost_threshold", {})
                    artifacts = self._phase9_artifacts()
                    return HistoricalRunDetail(
                        **summary.model_dump(),
                        configuration=_dict(row.get("configuration_json")),
                        search_results=_list(row.get("search_results_json")),
                        feature_importance=[item for item in _list(row.get("feature_importance_json")) if isinstance(item, dict)],
                        metrics=[_metric(frozen, scope="validation", label="External validation / frozen threshold 0.115", source_reference="artifacts/phase9/phase9-final-validation/validation_metrics.json")],
                        artifacts=artifacts,
                        availability=[self._availability("phase9_artifacts", artifacts)],
                        provenance=[
                            "Read from data/phase9_validation.db.",
                            "Metrics normalized from the selected_candidate.calibrated_internal_min_cost_threshold scope.",
                            "Production approval and promotion are not present.",
                        ],
                        error_message=row.get("error_message"),
                    )
                raise ResourceNotFoundError(f"Historical experiment '{reference_id}' was not found.")
            finally:
                conn9.close()

        if reference_id.startswith("phase9-"):
            for summary_item in self._phase9_comparison_rows():
                if summary_item.reference_id == reference_id:
                    return HistoricalRunDetail(
                        **summary_item.model_dump(),
                        configuration={
                            "preprocessing_strategy": summary_item.preprocessing_strategy,
                            "imbalance_strategy": summary_item.imbalance_strategy,
                        },
                        search_results=[],
                        feature_importance=[],
                        metrics=[summary_item.validation_metrics] if summary_item.validation_metrics else [],
                        artifacts=[],
                        availability=[
                            HistoricalAvailability(
                                name="artifacts",
                                status="unavailable",
                                message="Serialized pipeline artifacts were not retained for non-candidate comparison rows.",
                            ),
                            HistoricalAvailability(
                                name="feature_importance",
                                status="unavailable",
                                message="Feature importance artifact is not available for this comparison summary row.",
                            ),
                        ],
                        provenance=[
                            "Read from artifacts/phase9/phase9-final-validation/model_comparison.csv.",
                            "Evaluated on frozen validation split at threshold 0.5.",
                            "Historical summary record; individual model binaries not retained.",
                        ],
                        error_message=None,
                    )

        conn4 = self._connect_required("phase4_smoke.db")
        try:
            row = self._row(conn4, "SELECT * FROM experiment_runs WHERE experiment_id = ?", (reference_id,))
            if row is not None:
                return self._detail_from_phase4(row)
            raise ResourceNotFoundError(f"Historical experiment '{reference_id}' was not found.")
        finally:
            conn4.close()

    def training_run_detail(self, reference_id: str) -> HistoricalRunDetail:
        reference_id = _safe_component(reference_id)
        conn = self._connect_required("phase3_smoke.db")
        try:
            row = self._row(conn, "SELECT * FROM model_training_runs WHERE run_id = ?", (reference_id,))
            if row is not None:
                return self._detail_from_phase3(row)
            raise ResourceNotFoundError(f"Historical training run '{reference_id}' was not found.")
        finally:
            conn.close()

    def get_historical_detail(self, reference_type: str, reference_id: str) -> HistoricalRunDetail:
        clean_id = _safe_component(reference_id)

        if reference_type == "training_run":
            conn = self._connect_required("phase3_smoke.db")
            try:
                row = self._row(conn, "SELECT * FROM model_training_runs WHERE run_id = ?", (clean_id,))
                if row is not None:
                    return self._detail_from_phase3(row)
            finally:
                conn.close()

            if self._database_path("phase4_smoke.db").is_file():
                conn4 = self._connect_required("phase4_smoke.db")
                try:
                    row4 = self._row(conn4, "SELECT * FROM experiment_runs WHERE experiment_id = ?", (clean_id,))
                    if row4 is not None:
                        return self._detail_from_phase4(row4)
                finally:
                    conn4.close()

            raise ResourceNotFoundError(f"Historical training run '{reference_id}' was not found.")

        if reference_type == "experiment":
            if clean_id == "phase9-final-validation-candidate":
                return self.experiment_detail(clean_id)

            if clean_id.startswith("exp-"):
                return self.experiment_detail(clean_id)

            for comp_summary in self._phase9_comparison_rows():
                if comp_summary.reference_id == clean_id:
                    return HistoricalRunDetail(
                        **comp_summary.model_dump(),
                        configuration={},
                        hyperparameters=comp_summary.cross_validation.model_dump() if comp_summary.cross_validation else {},
                        metrics=[comp_summary.validation_metrics] if comp_summary.validation_metrics else [],
                        artifacts=[],
                        availability=[HistoricalAvailability(name="phase9_comparison", status="available", message="Phase 9 model comparison record.")],
                        provenance=["Read from artifacts/phase9/phase9-final-validation/model_comparison.csv."],
                        error_message=None,
                    )

            if self._database_path("phase4_smoke.db").is_file():
                conn4 = self._connect_required("phase4_smoke.db")
                try:
                    row4 = self._row(conn4, "SELECT * FROM experiment_runs WHERE experiment_id = ?", (clean_id,))
                    if row4 is not None:
                        return self._detail_from_phase4(row4)
                finally:
                    conn4.close()
            elif self._database_path("phase3_smoke.db").is_file():
                conn3 = self._connect_required("phase3_smoke.db")
                try:
                    row3 = self._row(conn3, "SELECT * FROM model_training_runs WHERE run_id = ?", (clean_id,))
                    if row3 is not None:
                        return self._detail_from_phase3(row3)
                finally:
                    conn3.close()

            raise ResourceNotFoundError(f"Historical experiment '{reference_id}' was not found.")

        raise ResourceNotFoundError(f"{reference_type} '{reference_id}' was not found.")

    def _phase9_comparison_rows(self) -> list[HistoricalRunSummary]:
        path = self.phase9_root / "model_comparison.csv"
        if not path.is_file():
            return []
        rows: list[HistoricalRunSummary] = []
        with path.open("r", encoding="utf-8", newline="") as stream:
            for item in csv.DictReader(stream):
                metrics = {
                    "threshold": 0.5,
                    "pr_auc": item.get("validation_pr_auc"),
                    "roc_auc": item.get("validation_roc_auc"),
                    "precision": item.get("validation_precision"),
                    "recall": item.get("validation_recall"),
                    "f1_score": item.get("validation_f1"),
                    "specificity": item.get("validation_specificity"),
                    "balanced_accuracy": item.get("validation_balanced_accuracy"),
                    "true_negative": item.get("validation_true_negative"),
                    "false_positive": item.get("validation_false_positive"),
                    "false_negative": item.get("validation_false_negative"),
                    "true_positive": item.get("validation_true_positive"),
                    "estimated_business_cost": item.get("validation_business_cost_default"),
                    "false_positive_cost": 1.0,
                    "false_negative_cost": 10.0,
                    "business_cost_note": "Illustrative Phase 9 assumption; external validation default threshold.",
                }
                parsed_metrics = {key: (_number(value) if key not in {"business_cost_note"} else value) for key, value in metrics.items()}
                parsed_metrics["true_negative"] = _int(item.get("validation_true_negative"))
                parsed_metrics["false_positive"] = _int(item.get("validation_false_positive"))
                parsed_metrics["false_negative"] = _int(item.get("validation_false_negative"))
                parsed_metrics["true_positive"] = _int(item.get("validation_true_positive"))
                validation = _metric(parsed_metrics, scope="validation", label="External validation / default threshold", source_reference="artifacts/phase9/phase9-final-validation/model_comparison.csv")
                hyperparameters = _json(item.get("best_hyperparameters"), {})
                cv_mean = _number(item.get("cv_pr_auc_mean"))
                cv_std = _number(item.get("cv_pr_auc_std"))
                curve_path = self.phase9_root / "curves" / f"{item.get('model_family')}__{item.get('imbalance_strategy')}.json"
                curves = self._read_json_file(curve_path, "Phase 9 validation curve") if curve_path.is_file() else None
                rows.append(
                    HistoricalRunSummary(
                        reference_type="experiment",
                        reference_id=item.get("experiment_reference_id", ""),
                        phase="phase9",
                        model_name=item.get("model_family", "unknown"),
                        model_version="phase9",
                        imbalance_strategy=item.get("imbalance_strategy"),
                        preprocessing_strategy=item.get("preprocessing_strategy"),
                        dataset_id=item.get("dataset_id", ""),
                        dataset_fingerprint=item.get("dataset_fingerprint"),
                        status="completed",
                        lifecycle_status="evaluated" if item.get("selected") == "True" else "historical",
                        threshold=validation.threshold,
                        primary_metric=validation.pr_auc,
                        validation_metrics=validation,
                        cross_validation=HistoricalCrossValidation(
                            pr_auc_mean=cv_mean,
                            pr_auc_std=cv_std,
                            folds=3,
                            search_budget=6,
                            source_reference="artifacts/phase9/phase9-final-validation/model_comparison.csv",
                        ),
                        artifact_integrity_status="verified" if item.get("selected") == "True" else "not_recorded",
                        artifact_available=False,
                        feature_importance_available=False,
                        hyperparameters=hyperparameters,
                        source_database="artifacts/phase9/phase9-final-validation/model_comparison.csv",
                        candidate_label="Final validation candidate — not production approved" if item.get("selected") == "True" else None,
                        curves=curves or None,
                        training_duration_seconds=_number(item.get("training_duration_seconds")),
                        inference_duration_seconds=_number(item.get("inference_duration_seconds")),
                        calibration_method=None,
                    )
                )
        return rows

    def validation_comparison(self, page: int, page_size: int) -> HistoricalValidationComparisonResponse:
        phase9_rows = self._phase9_comparison_rows()
        candidate = self._phase9_summary_if_available()
        # The comparison CSV contains a default-threshold row for the selected
        # candidate. Replace that row with the persisted frozen candidate
        # summary so the live comparison never displays threshold 0.5 for the
        # final candidate or ranks a different operating point as final.
        phase9_comparison = [
            item for item in phase9_rows
            if item.reference_id != "phase9-final-validation-candidate"
        ]
        if candidate:
            phase9_comparison.append(candidate)
        items = [self._phase4_summary(row) for row in self._phase4_rows()] + phase9_comparison
        items.sort(key=lambda item: (item.primary_metric is not None, item.primary_metric or -1), reverse=True)
        availability = [
            HistoricalAvailability(
                name="validation_metrics",
                status="available" if items else "unavailable",
                message="Persisted validation comparisons are available; cross-validation remains a separate field." if items else "No persisted validation comparisons are available.",
            )
        ]
        return HistoricalValidationComparisonResponse(
            evidence_version=EVIDENCE_VERSION,
            normalization_version=NORMALIZATION_VERSION,
            items=self._paginate(items, page, page_size),
            total=len(items),
            page=page,
            page_size=page_size,
            availability=availability,
        )

    def validation_detail(self, reference_id: str) -> HistoricalValidationResponse:
        detail = self.experiment_detail(reference_id)
        dataset_and_split = None
        if reference_id == "phase9-final-validation-candidate":
            payload = self._read_json_file(self.phase9_root / "dataset_and_split.json", "Phase 9 dataset and split")
            dataset_and_split = payload or None
        return HistoricalValidationResponse(
            evidence_version=EVIDENCE_VERSION,
            normalization_version=NORMALIZATION_VERSION,
            reference=detail,
            metrics=detail.metrics,
            cross_validation=detail.cross_validation,
            dataset_and_split=dataset_and_split,
            curves=detail.curves,
            feature_importance=detail.feature_importance,
            artifacts=detail.artifacts,
            availability=detail.availability,
            provenance=detail.provenance,
        )

    def _phase9_threshold_data(self) -> tuple[HistoricalThresholdResponse, HistoricalCalibrationResponse]:
        row = self._phase9_row("phase9-final-validation-candidate")
        if row is None:
            raise ResourceNotFoundError("Historical Phase 9 candidate was not found.")
        final_candidate, validation_metrics, threshold, calibration = self._phase9_payloads()
        selected_candidate = validation_metrics.get("selected_candidate", {})
        frozen = selected_candidate.get("calibrated_internal_min_cost_threshold", {})
        policy = threshold.get("external_validation", {}).get("calibrated_internal_min_cost_threshold", {})
        if not isinstance(policy, dict):
            policy = frozen
        calibration_method = str(calibration.get("selected_method") or final_candidate.get("configuration", {}).get("calibration", {}).get("selected_method") or "isotonic")
        calibration_external = calibration.get("external_validation_comparison", {}).get(calibration_method, {})
        if not isinstance(calibration_external, dict):
            calibration_external = {}
        selected_threshold = _number(threshold.get("selected_threshold")) or 0.115
        artifacts = self._phase9_artifacts()
        validation = _metric(
            policy,
            scope="validation",
            label="External validation / frozen threshold 0.115",
            source_reference="artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
        )
        points: list[HistoricalThresholdPoint] = []
        raw_points = threshold.get("points")
        if isinstance(raw_points, list) and raw_points:
            for item in raw_points:
                if isinstance(item, dict) and _number(item.get("threshold")) is not None:
                    points.append(
                        HistoricalThresholdPoint(
                            threshold=float(item["threshold"]),
                            precision=_number(item.get("precision")),
                            recall=_number(item.get("recall")),
                            f1_score=_number(item.get("f1_score")),
                            specificity=_number(item.get("specificity")),
                            false_positive=_int(item.get("false_positive")),
                            false_negative=_int(item.get("false_negative")),
                            true_positive=_int(item.get("true_positive")),
                            true_negative=_int(item.get("true_negative")),
                            business_cost=_number(item.get("business_cost")),
                            source_reference="artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
                            scope="validation",
                            scope_label="External validation",
                        )
                    )
        else:
            for key in ("internal_min_cost", "internal_max_f1", "internal_recall_constrained"):
                value = threshold.get(key)
                if isinstance(value, dict) and _number(value.get("threshold")) is not None:
                    points.append(
                        HistoricalThresholdPoint(
                            threshold=float(value["threshold"]),
                            precision=_number(value.get("precision")),
                            recall=_number(value.get("recall")),
                            f1_score=_number(value.get("f1_score")),
                            specificity=_number(value.get("specificity")),
                            false_positive=_int(value.get("false_positive")),
                            false_negative=_int(value.get("false_negative")),
                            true_positive=_int(value.get("true_positive")),
                            true_negative=_int(value.get("true_negative")),
                            business_cost=_number(value.get("business_cost")),
                            source_reference="artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
                            scope="internal_selection",
                            scope_label="Internal policy selection (OOF CV)",
                        )
                    )

        internal_points: list[HistoricalThresholdPoint] = []
        for key in ("internal_min_cost", "internal_max_f1", "internal_recall_constrained"):
            value = threshold.get(key)
            if isinstance(value, dict) and _number(value.get("threshold")) is not None:
                internal_points.append(
                    HistoricalThresholdPoint(
                        threshold=float(value["threshold"]),
                        precision=_number(value.get("precision")),
                        recall=_number(value.get("recall")),
                        f1_score=_number(value.get("f1_score")),
                        specificity=_number(value.get("specificity")),
                        false_positive=_int(value.get("false_positive")),
                        false_negative=_int(value.get("false_negative")),
                        true_positive=_int(value.get("true_positive")),
                        true_negative=_int(value.get("true_negative")),
                        business_cost=_number(value.get("business_cost")),
                        source_reference="artifacts/phase9/phase9-final-validation/selected/threshold_policy_comparisons.json",
                        scope="internal_selection",
                        scope_label="Internal policy selection (OOF CV)",
                    )
                )

        availability = [self._availability("phase9_artifacts", artifacts)]
        threshold_response = HistoricalThresholdResponse(
            evidence_version=EVIDENCE_VERSION,
            reference_id=row["experiment_id"],
            model_name=row["model_name"],
            model_version=row["model_version"],
            calibration_method=calibration_method,
            frozen_threshold=selected_threshold,
            selection_objective=str(threshold.get("selected_objective") or "minimum_cost"),
            selection_scope=str(threshold.get("selection_scope") or "Internal OOF policy subset derived from the training partition"),
            validation=validation,
            threshold_points=points,
            internal_points=internal_points,
            calibration_metrics={
                "brier_score": _number(calibration_external.get("brier_score")),
                "log_loss": _number(calibration_external.get("log_loss")),
                "expected_calibration_error": _number(calibration_external.get("expected_calibration_error")),
            },
            artifacts=artifacts,
            availability=availability,
            provenance=[
                "Calibration fit scope: OOF predictions from training-partition folds.",
                "Threshold selection scope: internal OOF policy subset.",
                "Validation metrics are external validation results; they are not production approval.",
            ],
        )
        calibration_response = HistoricalCalibrationResponse(
            evidence_version=EVIDENCE_VERSION,
            reference_id=row["experiment_id"],
            model_name=row["model_name"],
            model_version=row["model_version"],
            selected_method=calibration_method,
            evaluation_scope="External validation comparison for the frozen candidate",
            metrics={
                "brier_score": _number(calibration_external.get("brier_score")),
                "log_loss": _number(calibration_external.get("log_loss")),
                "expected_calibration_error": _number(calibration_external.get("expected_calibration_error")),
                "pr_auc": _number(calibration_external.get("pr_auc")),
                "roc_auc": _number(calibration_external.get("roc_auc")),
            },
            reliability_curve=calibration_external.get("reliability_curve", []) if isinstance(calibration_external.get("reliability_curve", []), list) else [],
            artifacts=artifacts,
            availability=availability,
            provenance=[
                "Selected calibration method is isotonic.",
                "The calibrator is presented as persisted evidence and is not refit or loaded for display.",
            ],
        )
        return threshold_response, calibration_response

    def thresholds(self, reference_id: str) -> HistoricalThresholdResponse:
        if reference_id != "phase9-final-validation-candidate":
            raise ResourceNotFoundError(f"Historical threshold evidence '{reference_id}' was not found.")
        return self._phase9_threshold_data()[0]

    def calibration(self, reference_id: str) -> HistoricalCalibrationResponse:
        if reference_id != "phase9-final-validation-candidate":
            raise ResourceNotFoundError(f"Historical calibration evidence '{reference_id}' was not found.")
        return self._phase9_threshold_data()[1]

    def official_test(self) -> OfficialTestEvidenceResponse:
        """Return persisted Phase 10 evidence without opening the raw test CSV."""

        required_files = [
            (self.phase10_root / "official_test_metrics.json", "official test metrics"),
            (self.phase10_root / "official_test_calibration.json", "official test calibration"),
            (self.phase10_root / "official_test_reliability.json", "official test reliability"),
            (self.phase10_root / "official_test_integrity.json", "official test integrity"),
            (self.phase10_root / "pre_evaluation_audit.json", "official test pre-evaluation audit"),
        ]
        for path, label in required_files:
            if not path.is_file():
                raise ArtifactUnavailableError(f"Persisted {label} evidence is unavailable.")

        metrics_payload = self._read_json_file(self.phase10_root / "official_test_metrics.json", "official test metrics")
        calibration_payload = self._read_json_file(self.phase10_root / "official_test_calibration.json", "official test calibration")
        reliability_payload = self._read_json_file(self.phase10_root / "official_test_reliability.json", "official test reliability")
        integrity_payload = self._read_json_file(self.phase10_root / "official_test_integrity.json", "official test integrity")
        pre_audit_payload = self._read_json_file(self.phase10_root / "pre_evaluation_audit.json", "official test pre-evaluation audit")

        primary = metrics_payload.get("primary_policy", {})
        if not isinstance(primary, dict):
            raise ArtifactCompatibilityError("Persisted official-test primary policy has an incompatible schema.")
        confusion = _metric(
            primary,
            scope="official_test",
            label="Official test / frozen threshold 0.115",
            source_reference="artifacts/phase10/official-test-evaluation/official_test_metrics.json",
        )
        intervals_payload = metrics_payload.get("confidence_intervals", {}).get("intervals", {})
        intervals = {
            name: OfficialTestConfidenceInterval(
                lower=float(value["lower"]),
                upper=float(value["upper"]),
            )
            for name, value in intervals_payload.items()
            if isinstance(value, dict) and _number(value.get("lower")) is not None and _number(value.get("upper")) is not None
        }
        final_candidate, _, _, _ = self._phase9_payloads()
        model_class = str(pre_audit_payload.get("model", {}).get("class", "CatBoostClassifier"))
        model_name = "catboost" if model_class.lower().startswith("catboost") else model_class.removesuffix("Classifier").lower()
        stored_hashes = integrity_payload.get("output_artifact_sha256", {})
        if not isinstance(stored_hashes, dict):
            stored_hashes = {}
        artifact_names = (
            "official_test_calibration.json",
            "official_test_comparison.csv",
            "official_test_confusion_matrix.json",
            "official_test_integrity.json",
            "official_test_metrics.json",
            "official_test_predictions.csv",
            "official_test_pr_curve.json",
            "official_test_reliability.json",
            "official_test_report.md",
            "official_test_roc_curve.json",
            "pre_evaluation_audit.json",
        )
        artifacts = [
            self._artifact(
                name,
                self._trusted_evidence_path(self.phase10_root / name, self.phase10_root),
                stored_hashes.get(name) if isinstance(stored_hashes.get(name), str) else None,
            )
            for name in artifact_names
        ]
        confidence_config = metrics_payload.get("confidence_intervals", {})
        integrity_flags = {
            "official_test_evaluated": bool(metrics_payload.get("official_test_evaluated") and integrity_payload.get("official_test_evaluated")),
            "retraining_performed": bool(metrics_payload.get("retraining_performed") or integrity_payload.get("model_retrained")),
            "calibration_refit": bool(metrics_payload.get("calibration_refit") or integrity_payload.get("calibrator_refit")),
            "threshold_changed": bool(metrics_payload.get("threshold_changed") or integrity_payload.get("threshold_changed")),
            "promotion_performed": bool(integrity_payload.get("promotion_performed")),
            "label_reconciliation_passed": bool(integrity_payload.get("label_reconciliation_passed")),
        }
        return OfficialTestEvidenceResponse(
            evidence_version=OFFICIAL_TEST_EVIDENCE_VERSION,
            evaluation_id=str(metrics_payload.get("evaluation_id", "phase10-official-test-evaluation")),
            candidate_id=str(metrics_payload.get("candidate_id", "phase9-final-validation-candidate")),
            candidate_label="Final validation candidate — not production approved",
            model_name=model_name,
            imbalance_strategy=str(final_candidate.get("imbalance_strategy", "unavailable")),
            calibration_method=str(metrics_payload.get("calibration_method") or calibration_payload.get("calibration_method", "isotonic")),
            frozen_threshold=float(metrics_payload.get("frozen_threshold", primary.get("threshold", 0.115))),
            metrics=confusion,
            confidence_intervals=intervals,
            confidence_interval_method=str(confidence_config.get("method")) if confidence_config.get("method") else None,
            confidence_interval_replicates=_int(confidence_config.get("replicates")),
            calibration_metrics={
                "brier_score": _number(calibration_payload.get("brier_score")),
                "log_loss": _number(calibration_payload.get("log_loss")),
                "expected_calibration_error": _number(calibration_payload.get("expected_calibration_error", reliability_payload.get("expected_calibration_error"))),
            },
            reliability_curve=calibration_payload.get("reliability_curve", reliability_payload.get("reliability_curve", [])) if isinstance(calibration_payload.get("reliability_curve", reliability_payload.get("reliability_curve", [])), list) else [],
            precision_recall_curve=self._read_json_file(self.phase10_root / "official_test_pr_curve.json", "official test precision-recall curve"),
            roc_curve=self._read_json_file(self.phase10_root / "official_test_roc_curve.json", "official test ROC curve"),
            integrity_flags=integrity_flags,
            artifacts=artifacts,
            availability=[self._availability("official_test_evidence", artifacts)],
            provenance=[
                "Persisted Phase 10 official-test evaluation evidence; the raw official test CSV is not read by this endpoint.",
                "The candidate, CatBoost class-weighting strategy, isotonic calibration and threshold 0.115 were frozen before evaluation.",
                "These are historical official-test results, not production monitoring metrics.",
            ],
        )
