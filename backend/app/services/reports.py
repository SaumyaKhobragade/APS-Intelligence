"""Bounded JSON/CSV/PDF experiment and analytics exports."""

from __future__ import annotations

from io import BytesIO, StringIO
import csv
import json
import re
from typing import Any

from app.core.exceptions import InvalidRequestError
from app.schemas.analytics import ModelComparisonResponse, ThresholdAnalyticsResponse
from app.services.analytics import AnalyticsService
from app.services.registry import ModelRegistryService
from app.services.reproducibility import parse_json_object
from sqlalchemy.orm import Session


SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


def safe_component(value: str) -> str:
    if not SAFE_COMPONENT.fullmatch(value):
        raise InvalidRequestError("The requested export reference contains unsafe filename characters.")
    return value


class ReportService:
    def __init__(self, analytics: AnalyticsService, registry: ModelRegistryService) -> None:
        self.analytics = analytics
        self.registry = registry

    def experiment_json(self, reference_type: str, reference_id: str) -> bytes:
        detail = self.registry.detail(reference_type, reference_id)
        threshold = self.analytics.threshold(reference_id)
        payload = {
            "source": "persisted_backend_records",
            "evaluation_scope": "validation",
            "official_test_evaluation_available": False,
            "registry": detail.model_dump(mode="json"),
            "threshold_analytics": threshold.model_dump(mode="json"),
        }
        return json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")

    def experiment_csv(self, reference_type: str, reference_id: str) -> bytes:
        detail = self.registry.detail(reference_type, reference_id)
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(["reference_type", "reference_id", "model_name", "model_version", "dataset_id", "dataset_fingerprint", "evaluation_scope", "split_identifier", "pr_auc", "roc_auc", "precision", "recall", "f1_score", "estimated_business_cost", "configuration_fingerprint"])
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

        detail = self.registry.detail(reference_type, reference_id)
        threshold = self.analytics.threshold(reference_id)
        buffer = BytesIO()
        with PdfPages(buffer) as pdf:
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
                figure.text(0.08, 0.04, "APS Intelligence / persisted backend evidence", fontsize=8, color="grey")
                pdf.savefig(figure, bbox_inches="tight")
                plt.close(figure)
        return buffer.getvalue()


def _wrap(value: str, width: int) -> list[str]:
    return [value[index : index + width] for index in range(0, max(len(value), 1), width)]
