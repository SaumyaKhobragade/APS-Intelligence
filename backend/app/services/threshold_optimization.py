"""Leakage-safe threshold-grid evaluation and deterministic policy selection."""

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

from app.core.exceptions import InvalidRequestError
from app.schemas.phase5 import (
    ThresholdObjective,
    ThresholdOptimizationRequest,
    ThresholdPoint,
    ThresholdSelectedResult,
)


def build_threshold_candidates(
    threshold_min: float,
    threshold_max: float,
    *,
    threshold_step: float | None = None,
    threshold_candidates: int | None = None,
) -> list[float]:
    """Build a bounded, deterministic threshold grid including both endpoints."""

    if not 0.0 <= threshold_min < threshold_max <= 1.0:
        raise InvalidRequestError("Threshold bounds must satisfy 0 <= threshold_min < threshold_max <= 1.")
    if (threshold_step is None) == (threshold_candidates is None):
        raise InvalidRequestError("Provide exactly one of threshold_step or threshold_candidates.")
    if threshold_candidates is not None:
        if threshold_candidates < 2 or threshold_candidates > 10_001:
            raise InvalidRequestError("threshold_candidates must be between 2 and 10001.")
        values = np.linspace(threshold_min, threshold_max, threshold_candidates)
    else:
        if threshold_step is None or threshold_step <= 0:
            raise InvalidRequestError("threshold_step must be greater than zero.")
        if threshold_step > 1:
            raise InvalidRequestError("threshold_step must not exceed 1.")
        count = int(np.floor((threshold_max - threshold_min) / threshold_step))
        if count > 10_000:
            raise InvalidRequestError("The threshold grid is too large; use a larger step or threshold_candidates.")
        values = threshold_min + np.arange(count + 1, dtype=float) * threshold_step
        values = np.concatenate([values, np.asarray([threshold_max], dtype=float)])
    return sorted({round(float(value), 12) for value in values})


def _safe_ranking_metric(metric: str, y_true: np.ndarray, probabilities: np.ndarray) -> float | None:
    if len(np.unique(y_true)) < 2:
        return None
    if metric == "pr_auc":
        return float(average_precision_score(y_true, probabilities))
    return float(roc_auc_score(y_true, probabilities))


def evaluate_threshold_point(
    y_true: Sequence[int] | np.ndarray,
    probabilities: Sequence[float] | np.ndarray,
    threshold: float,
    *,
    false_positive_cost: float,
    false_negative_cost: float,
) -> ThresholdPoint:
    """Calculate one operating point without fitting or selecting a threshold."""

    truth = np.asarray(y_true, dtype=int)
    scores = np.asarray(probabilities, dtype=float)
    if truth.ndim != 1 or scores.ndim != 1 or len(truth) != len(scores) or len(truth) == 0:
        raise InvalidRequestError("y_true and probabilities must be non-empty one-dimensional arrays of equal length.")
    if np.any(~np.isfinite(scores)) or np.any((scores < 0.0) | (scores > 1.0)):
        raise InvalidRequestError("Probabilities must be finite values in the inclusive range [0, 1].")
    if not 0.0 <= threshold <= 1.0:
        raise InvalidRequestError("threshold must be between 0 and 1.")
    if false_positive_cost < 0 or false_negative_cost < 0:
        raise InvalidRequestError("Business costs must be non-negative.")

    predictions = (scores >= threshold).astype(int)
    matrix = confusion_matrix(truth, predictions, labels=[0, 1])
    true_negative, false_positive, false_negative, true_positive = (int(value) for value in matrix.ravel())
    actual_negative = true_negative + false_positive
    actual_positive = false_negative + true_positive
    business_cost = (false_positive * false_positive_cost) + (false_negative * false_negative_cost)
    return ThresholdPoint(
        threshold=float(threshold),
        precision=float(precision_score(truth, predictions, zero_division=0)),  # type: ignore[arg-type]
        recall=float(recall_score(truth, predictions, zero_division=0)),  # type: ignore[arg-type]
        f1_score=float(f1_score(truth, predictions, zero_division=0)),  # type: ignore[arg-type]
        specificity=float(true_negative / actual_negative) if actual_negative else 0.0,
        false_positive_rate=float(false_positive / actual_negative) if actual_negative else 0.0,
        false_negative_rate=float(false_negative / actual_positive) if actual_positive else 0.0,
        true_negative=true_negative,
        false_positive=false_positive,
        false_negative=false_negative,
        true_positive=true_positive,
        predicted_positive_count=int(predictions.sum()),
        total_records=len(truth),
        pr_auc=_safe_ranking_metric("pr_auc", truth, scores),
        roc_auc=_safe_ranking_metric("roc_auc", truth, scores),
        business_cost=float(business_cost),
        average_business_cost=float(business_cost / len(truth)),
    )


def _select_minimum_cost(points: list[ThresholdPoint], tie_breaker: str) -> ThresholdPoint:
    if tie_breaker == "higher_recall_then_lower_threshold":
        return min(points, key=lambda point: (point.business_cost, -point.recall, point.threshold))
    return min(points, key=lambda point: (point.business_cost, point.threshold))


def _select_maximum_f1(points: list[ThresholdPoint]) -> ThresholdPoint:
    return min(points, key=lambda point: (-point.f1_score, -point.recall, point.threshold))


def select_threshold(
    points: list[ThresholdPoint],
    *,
    objective: ThresholdObjective,
    required_recall: float | None,
    tie_breaker: str,
) -> ThresholdPoint:
    """Select a point while keeping each configured objective semantically distinct."""

    if not points:
        raise InvalidRequestError("At least one threshold candidate is required.")
    if objective == "minimum_cost":
        return _select_minimum_cost(points, tie_breaker)
    if objective == "maximum_f1":
        return _select_maximum_f1(points)
    if required_recall is None:
        raise InvalidRequestError(f"required_recall is required for the {objective} objective.")
    eligible = [point for point in points if point.recall >= required_recall]
    if not eligible:
        raise InvalidRequestError(f"No threshold candidate satisfies required_recall={required_recall:.6f}.")
    if objective == "minimum_recall":
        return min(eligible, key=lambda point: (point.threshold, -point.precision, -point.recall))
    return min(eligible, key=lambda point: (-point.precision, -point.recall, point.threshold))


def optimize_thresholds(
    y_true: Sequence[int] | np.ndarray,
    probabilities: Sequence[float] | np.ndarray,
    request: ThresholdOptimizationRequest,
    *,
    false_positive_cost: float,
    false_negative_cost: float,
) -> tuple[list[ThresholdPoint], ThresholdSelectedResult]:
    """Evaluate a bounded grid and return all points plus the selected policy."""

    candidates = build_threshold_candidates(
        request.threshold_min,
        request.threshold_max,
        threshold_step=request.threshold_step,
        threshold_candidates=request.threshold_candidates,
    )
    points = [
        evaluate_threshold_point(
            y_true,
            probabilities,
            candidate,
            false_positive_cost=false_positive_cost,
            false_negative_cost=false_negative_cost,
        )
        for candidate in candidates
    ]
    selected_point = select_threshold(
        points,
        objective=request.objective,
        required_recall=request.required_recall,
        tie_breaker=request.tie_breaker,
    )
    return points, ThresholdSelectedResult(
        **selected_point.model_dump(),
        objective=request.objective,
        objective_parameters={
            "required_recall": request.required_recall,
            "threshold_min": request.threshold_min,
            "threshold_max": request.threshold_max,
            "threshold_step": request.threshold_step,
            "threshold_candidates": request.threshold_candidates,
        },
        tie_breaker=request.tie_breaker,
    )
