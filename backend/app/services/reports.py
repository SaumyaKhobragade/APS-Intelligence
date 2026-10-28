"""Bounded JSON/CSV/PDF experiment and analytics exports."""

from __future__ import annotations

from io import BytesIO, StringIO
import csv
import json
import re
from typing import Any

from app.core.exceptions import InvalidRequestError, ResourceNotFoundError
from app.schemas.analytics import ModelComparisonResponse, ThresholdAnalyticsResponse
from app.services.analytics import AnalyticsService
from app.services.historical_evidence import HistoricalEvidenceService
from app.services.registry import ModelRegistryService
from app.services.reproducibility import parse_json_object
from sqlalchemy.orm import Session


SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def safe_component(value: str) -> str:
    if not SAFE_COMPONENT.fullmatch(value):
        raise InvalidRequestError("The requested export reference contains unsafe filename characters.")
    return value


class ReportService:
    def __init__(
        self,
        analytics: AnalyticsService,
        registry: ModelRegistryService,
        historical: HistoricalEvidenceService | None = None,
    ) -> None:
        self.analytics = analytics
        self.registry = registry
        self.historical = historical or HistoricalEvidenceService(registry.settings)

    def _resolve_record(self, reference_type: str, reference_id: str) -> tuple[Any, bool]:
        """Resolve record from active registry, falling back to historical evidence.

        Returns (detail, is_historical).
        """
        try:
            return self.registry.detail(reference_type, reference_id), False
        except ResourceNotFoundError:
            hist = self.historical.get_historical_detail(reference_type, reference_id)
            if hist is not None:
                return hist, True
            raise ResourceNotFoundError(f"{reference_type} '{reference_id}' was not found.")

    def experiment_json(self, reference_type: str, reference_id: str) -> bytes:
        detail, is_historical = self._resolve_record(reference_type, reference_id)
        if not is_historical:
            threshold = self.analytics.threshold(reference_id)
            payload = {
                "source": "persisted_backend_records",
                "evaluation_scope": "validation",
                "is_historical_evidence": False,
                "official_test_evaluation_available": False,
                "registry": detail.model_dump(mode="json"),
                "threshold_analytics": threshold.model_dump(mode="json"),
            }
            return json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")

        threshold_payload = None
        try:
            th = self.historical.thresholds(reference_id)
            threshold_payload = th.model_dump(mode="json")
        except Exception:
            threshold_payload = None

        payload = {
            "source": "historical_evidence_records",
            "evaluation_scope": "validation",
            "is_historical_evidence": True,
            "official_test_evaluation_available": reference_id == "phase9-final-validation-candidate",
            "registry": detail.model_dump(mode="json"),
            "threshold_analytics": threshold_payload,
            "provenance": detail.provenance,
        }
        return json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")

    def experiment_csv(self, reference_type: str, reference_id: str) -> bytes:
        detail, is_historical = self._resolve_record(reference_type, reference_id)
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "reference_type", "reference_id", "model_name", "model_version",
            "dataset_id", "dataset_fingerprint", "evaluation_scope", "split_identifier",
            "pr_auc", "roc_auc", "precision", "recall", "f1_score",
            "estimated_business_cost", "configuration_fingerprint",
        ])
        if not is_historical:
            metrics = detail.validation_metrics or {}
            writer.writerow([
                detail.model_reference_type,
                detail.model_reference_id,
                detail.model_name,
                detail.model_version,
                detail.dataset_id,
                detail.dataset_fingerprint,
                "validation",
                detail.split_identifier,
                metrics.get("pr_auc"),
                metrics.get("roc_auc"),
                metrics.get("precision"),
                metrics.get("recall"),
                metrics.get("f1_score"),
                metrics.get("estimated_business_cost"),
                detail.configuration_fingerprint,
            ])
        else:
            val = detail.validation_metrics
            writer.writerow([
                detail.reference_type,
                detail.reference_id,
                detail.model_name,
                detail.model_version,
                detail.dataset_id,
                detail.dataset_fingerprint,
                "validation",
                None,
                val.pr_auc if val else None,
                val.roc_auc if val else None,
                val.precision if val else None,
                val.recall if val else None,
                val.f1_score if val else None,
                val.estimated_business_cost if val else None,
                None,
            ])
        return output.getvalue().encode("utf-8")

    def comparison_csv(self, comparison: ModelComparisonResponse) -> bytes:
        output = StringIO()
        writer = csv.writer(output)
        fields = ["reference_type", "reference_id", "model_name", "model_version", "dataset_id", "dataset_fingerprint", "evaluation_scope", "evaluation_split", "imbalance_strategy", "preprocessing_strategy", "pr_auc", "roc_auc", "precision", "recall", "f1_score", "estimated_business_cost", "training_duration_seconds", "inference_duration_seconds"]
        writer.writerow(fields)
        for item in comparison.items:
            writer.writerow([getattr(item, field) for field in fields])
        return output.getvalue().encode("utf-8")

    def predictions_csv(self, records: list[Any]) -> bytes:
        output = StringIO()
        writer = csv.writer(output)
        fields = ["prediction_id", "model_reference_type", "model_reference_id", "model_version", "decision_policy_id", "decision_policy_version", "predicted_class", "failure_probability", "applied_threshold", "calibration_method", "prediction_timestamp", "inference_duration_ms"]
        writer.writerow(fields)
        for record in records:
            writer.writerow([getattr(record, field) for field in fields])
        return output.getvalue().encode("utf-8")

    def experiment_pdf(self, reference_type: str, reference_id: str) -> bytes:
        """Create a reusable evidence report from persisted metadata, not a final academic report."""

        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.backends.backend_pdf import PdfPages

        detail, is_historical = self._resolve_record(reference_type, reference_id)
        buffer = BytesIO()

        if not is_historical:
            threshold = self.analytics.threshold(reference_id)
            sections = [
                (
                    "APS Intelligence experiment report",
                    [
                        f"Reference: {detail.model_reference_type}/{detail.model_reference_id}",
                        f"Model: {detail.model_name} / {detail.model_version}",
                        f"Dataset fingerprint: {detail.dataset_fingerprint}",
                        f"Evaluation scope: validation only",
                        "Official APS test evaluation: unavailable",
                    ],
                ),
                (
                    "Dataset and reproducibility",
                    [
                        f"Dataset ID: {detail.dataset_id}",
                        f"Split identifier: {detail.split_identifier or 'unavailable'}",
                        f"Configuration fingerprint: {detail.configuration_fingerprint or 'unavailable'}",
                        f"Artifact integrity: {detail.artifact_integrity_status}",
                        f"Recorded dependency versions: {len(detail.library_versions)}",
                    ],
                ),
                (
                    "Model configuration",
                    [
                        f"Preprocessing: {json.dumps(detail.preprocessing_configuration, default=str)[:500]}",
                        f"Hyperparameters: {json.dumps(detail.hyperparameters, default=str)[:500]}",
                        f"Imbalance: {json.dumps(detail.imbalance_configuration, default=str)[:500]}",
                    ],
                ),
                (
                    "Validation results",
                    [json.dumps(detail.validation_metrics or {"status": "unavailable"}, indent=2, default=str)],
                ),
                (
                    "Threshold and calibration",
                    [
                        f"Threshold analysis: {'available' if threshold.threshold_analysis else 'unavailable'}",
                        f"Calibration comparison: {'available' if threshold.calibration else 'unavailable'}",
                        f"Decision-policy comparison: {'available' if threshold.decision_policies else 'unavailable'}",
                        "Business costs are illustrative configuration assumptions unless separately evidenced.",
                    ],
                ),
                (
                    "Limitations",
                    [
                        "This is a reusable experiment evidence export, not a fabricated final academic report.",
                        "No official APS test-set evaluation is included.",
                        "Synthetic fixtures, when present, are not APS evidence and cannot be production-approved.",
                    ],
                ),
            ]
            footer_text = "APS Intelligence / persisted backend evidence"
        else:
            threshold_data = None
            try:
                th = self.historical.thresholds(reference_id)
                threshold_data = th.model_dump(mode="json")
            except Exception:
                threshold_data = None

            val_dict = detail.validation_metrics.model_dump(mode="json") if detail.validation_metrics else {"status": "unavailable"}
            sections = [
                (
                    "APS Intelligence historical experiment report",
                    [
                        f"Reference: {detail.reference_type}/{detail.reference_id}",
                        f"Phase: {getattr(detail, 'phase', 'historical')}",
                        f"Model: {detail.model_name} / {detail.model_version}",
                        f"Dataset fingerprint: {detail.dataset_fingerprint or 'unavailable'}",
                        "Evaluation scope: validation only (historical evidence)",
                        f"Official APS test evaluation: {'available (Phase 10)' if detail.reference_id == 'phase9-final-validation-candidate' else 'unavailable'}",
                        "Record source: historical evidence database",
                    ],
                ),
                (
                    "Dataset and reproducibility",
                    [
                        f"Dataset ID: {detail.dataset_id}",
                        f"Artifact integrity: {detail.artifact_integrity_status}",
                        f"Artifact available: {detail.artifact_available}",
                    ] + [f"Provenance: {p}" for p in detail.provenance],
                ),
                (
                    "Model configuration",
                    [
                        f"Preprocessing: {json.dumps(detail.configuration, default=str)[:500]}",
                        f"Hyperparameters: {json.dumps(detail.hyperparameters, default=str)[:500]}",
                        f"Imbalance strategy: {getattr(detail, 'imbalance_strategy', 'not_recorded')}",
                    ],
                ),
                (
                    "Validation results",
                    [json.dumps(val_dict, indent=2, default=str)],
                ),
                (
                    "Threshold and calibration",
                    [
                        f"Threshold analysis: {'available' if threshold_data and threshold_data.get('threshold_analysis') else 'unavailable'}",
                        f"Calibration comparison: {'available' if threshold_data and threshold_data.get('calibration') else 'unavailable'}",
                        "Business costs are illustrative configuration assumptions (FP=1, FN=10) unless separately evidenced.",
                    ],
                ),
                (
                    "Limitations",
                    [
                        "This is a reusable historical experiment evidence export, not a fabricated final academic report.",
                        "This is an unpromoted historical evaluation record, not an active production model.",
                        "No official test-set data was used for threshold tuning or calibration.",
                    ],
                ),
            ]
            footer_text = "APS Intelligence / historical backend evidence"

        with PdfPages(buffer) as pdf:
            for title, lines in sections:
                figure = plt.figure(figsize=(8.27, 11.69))
                figure.text(0.08, 0.93, title, fontsize=18, weight="bold")
                y = 0.87
                for line in lines:
                    for wrapped in _wrap(str(line), 105):
                        figure.text(0.08, y, wrapped, fontsize=10, family="monospace", va="top")
                        y -= 0.028
                        if y < 0.08:
                            break
                    if y < 0.08:
                        break
                figure.text(0.08, 0.04, footer_text, fontsize=8, color="grey")
                pdf.savefig(figure, bbox_inches="tight")
                plt.close(figure)
        return buffer.getvalue()


def _wrap(value: str, width: int) -> list[str]:
    return [value[index : index + width] for index in range(0, max(len(value), 1), width)]
