"""Standardized validation metrics for binary failure classification."""

from collections.abc import Sequence

import numpy as np
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)

from app.schemas.models import ConfusionMatrixResponse, EvaluationMetricsResponse


def _safe_average_precision(y_true: Sequence[int], probabilities: Sequence[float]) -> float | None:
    if len(set(y_true)) < 2:
        return None
    return float(average_precision_score(y_true, probabilities))


def _safe_roc_auc(y_true: Sequence[int], probabilities: Sequence[float]) -> float | None:
    if len(set(y_true)) < 2:
        return None
    return float(roc_auc_score(y_true, probabilities))


def evaluate_binary_classifier(
    y_true: Sequence[int],
    probabilities: Sequence[float],
    *,
    threshold: float = 0.5,
    false_positive_cost: float = 1.0,
    false_negative_cost: float = 10.0,
) -> EvaluationMetricsResponse:
    """Evaluate one frozen validation operating point without threshold tuning."""

    truth = np.asarray(y_true, dtype=int)
    scores = np.asarray(probabilities, dtype=float)
    predictions = (scores >= threshold).astype(int)
    matrix = confusion_matrix(truth, predictions, labels=[0, 1])
    true_negative, false_positive, false_negative, true_positive = (int(value) for value in matrix.ravel())
    return EvaluationMetricsResponse(
        threshold=threshold,
        pr_auc=_safe_average_precision(truth.tolist(), scores.tolist()),
        roc_auc=_safe_roc_auc(truth.tolist(), scores.tolist()),
        precision=float(precision_score(truth, predictions, zero_division=0)),
        recall=float(recall_score(truth, predictions, zero_division=0)),
        f1_score=float(f1_score(truth, predictions, zero_division=0)),
        confusion_matrix=ConfusionMatrixResponse(
            true_negative=true_negative,
            false_positive=false_positive,
            false_negative=false_negative,
            true_positive=true_positive,
            matrix=matrix.tolist(),
        ),
        false_positive_cost=false_positive_cost,
        false_negative_cost=false_negative_cost,
        estimated_business_cost=(false_positive * false_positive_cost) + (false_negative * false_negative_cost),
        business_cost_note="Initial validation estimate at the configured default threshold; not final optimized business cost.",
    )
