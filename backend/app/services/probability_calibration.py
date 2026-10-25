"""Training-only probability calibration and reliability metrics."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import train_test_split

from app.schemas.phase5 import CalibrationMethod, CalibrationMethodResult, ReliabilityPoint


@dataclass(frozen=True)
class CalibrationFit:
    """One calibration method, its validation probabilities and serializable model."""

    result: CalibrationMethodResult
    probabilities: np.ndarray
    calibrator: Any | None


def _ranking_metric(y_true: np.ndarray, probabilities: np.ndarray, *, roc: bool = False) -> float | None:
    if len(np.unique(y_true)) < 2:
        return None
    return float(roc_auc_score(y_true, probabilities) if roc else average_precision_score(y_true, probabilities))


def reliability_points(
    y_true: Sequence[int] | np.ndarray,
    probabilities: Sequence[float] | np.ndarray,
    *,
    bins: int = 10,
) -> tuple[list[ReliabilityPoint], float]:
    """Return uniform-bin reliability data and a documented expected calibration error."""

    truth = np.asarray(y_true, dtype=int)
    scores = np.asarray(probabilities, dtype=float)
    edges = np.linspace(0.0, 1.0, bins + 1)
    points: list[ReliabilityPoint] = []
    weighted_error = 0.0
    for index in range(bins):
        lower = float(edges[index])
        upper = float(edges[index + 1])
        include = (scores >= lower) & ((scores <= upper) if index == bins - 1 else (scores < upper))
        count = int(include.sum())
        if count == 0:
            continue
        predicted = float(scores[include].mean())
        observed = float(truth[include].mean())
        weighted_error += (count / len(truth)) * abs(predicted - observed)
        points.append(
            ReliabilityPoint(
                bin_lower=lower,
                bin_upper=upper,
                bin_label=f"{lower:.2f}-{upper:.2f}",
                predicted_probability=predicted,
                observed_failure_rate=observed,
                sample_count=count,
            )
        )
    return points, float(weighted_error)


def _result(
    method: CalibrationMethod,
    status: str,
    y_true: np.ndarray,
    probabilities: np.ndarray | None,
    *,
    calibration_records: int,
    calibration_positive_records: int,
    calibration_negative_records: int,
    reliability_bins: int,
    artifact_reference: str | None = None,
    reason: str | None = None,
) -> CalibrationMethodResult:
    if probabilities is None:
        return CalibrationMethodResult(
            method=method,
            status=status,  # type: ignore[arg-type]
            calibration_records=calibration_records,
            calibration_positive_records=calibration_positive_records,
            calibration_negative_records=calibration_negative_records,
            validation_records=len(y_true),
            pr_auc=None,
            roc_auc=None,
            brier_score=None,
            log_loss=None,
            expected_calibration_error=None,
            reliability_curve=[],
            artifact_reference=artifact_reference,
            reason=reason,
        )
    curve, ece = reliability_points(y_true, probabilities, bins=reliability_bins)
    return CalibrationMethodResult(
        method=method,
        status=status,  # type: ignore[arg-type]
        calibration_records=calibration_records,
        calibration_positive_records=calibration_positive_records,
        calibration_negative_records=calibration_negative_records,
        validation_records=len(y_true),
        pr_auc=_ranking_metric(y_true, probabilities),
        roc_auc=_ranking_metric(y_true, probabilities, roc=True),
        brier_score=float(brier_score_loss(y_true, probabilities)),
        log_loss=float(log_loss(y_true, np.clip(probabilities, 1e-15, 1 - 1e-15), labels=[0, 1])),
        expected_calibration_error=ece,
        reliability_curve=curve,
        artifact_reference=artifact_reference,
        reason=reason,
    )


def fit_calibration_methods(
    base_estimator: Any,
    training_x: Any,
    training_y: Sequence[int] | np.ndarray,
    validation_x: Any,
    validation_y: Sequence[int] | np.ndarray,
    *,
    methods: Sequence[CalibrationMethod],
    calibration_ratio: float,
    random_seed: int,
    minimum_calibration_records: int,
    minimum_calibration_positives: int,
    minimum_calibration_negatives: int,
    reliability_bins: int,
) -> list[CalibrationFit]:
    """Fit calibration mappings using only an internal split of training records.

    The base estimator is loaded from the completed training/experiment
    artifact.  ``CalibratedClassifierCV(cv='prefit')`` fits only the mapping on
    the internal training calibration records; validation labels are passed
    solely to metric calculation after fitting.
    """

    train_truth = np.asarray(training_y, dtype=int)
    validation_truth = np.asarray(validation_y, dtype=int)
    base_validation_probabilities = np.asarray(base_estimator.predict_proba(validation_x)[:, 1], dtype=float)
    results: list[CalibrationFit] = []

    if "uncalibrated" in methods:
        results.append(
            CalibrationFit(
                result=_result(
                    "uncalibrated",
                    "completed",
                    validation_truth,
                    base_validation_probabilities,
                    calibration_records=0,
                    calibration_positive_records=0,
                    calibration_negative_records=0,
                    reliability_bins=reliability_bins,
                    reason="Base artifact probabilities; no calibrator was fitted.",
                ),
                probabilities=base_validation_probabilities,
                calibrator=None,
            )
        )

    calibration_x = None
    calibration_y: np.ndarray | None = None
    calibration_error: str | None = None
    needs_calibration = any(method in {"sigmoid", "isotonic"} for method in methods)
    if needs_calibration:
        try:
            _, calibration_x, _, raw_calibration_y = train_test_split(
                training_x,
                train_truth,
                test_size=calibration_ratio,
                random_state=random_seed,
                stratify=train_truth,
            )
            calibration_y = np.asarray(raw_calibration_y, dtype=int)
        except ValueError as exc:
            calibration_error = f"The internal training calibration split could not be created: {exc}"

    calibration_records = len(calibration_y) if calibration_y is not None else 0
    calibration_positive_records = int((calibration_y == 1).sum()) if calibration_y is not None else 0
    calibration_negative_records = int((calibration_y == 0).sum()) if calibration_y is not None else 0

    for method in ("sigmoid", "isotonic"):
        if method not in methods:
            continue
        if calibration_error:
            results.append(
                CalibrationFit(
                    result=_result(
                        method,
                        "insufficient_sample",
                        validation_truth,
                        None,
                        calibration_records=calibration_records,
                        calibration_positive_records=calibration_positive_records,
                        calibration_negative_records=calibration_negative_records,
                        reliability_bins=reliability_bins,
                        reason=calibration_error,
                    ),
                    probabilities=base_validation_probabilities,
                    calibrator=None,
                )
            )
            continue
        if (
            calibration_records < minimum_calibration_records
            or calibration_positive_records < minimum_calibration_positives
            or calibration_negative_records < minimum_calibration_negatives
        ):
            reason = (
                "Calibration was skipped because the internal training calibration split has "
                f"{calibration_records} records ({calibration_positive_records} positive, "
                f"{calibration_negative_records} negative); required at least "
                f"{minimum_calibration_records} records, {minimum_calibration_positives} positives "
                f"and {minimum_calibration_negatives} negatives."
            )
            results.append(
                CalibrationFit(
                    result=_result(
                        method,
                        "insufficient_sample",
                        validation_truth,
                        None,
                        calibration_records=calibration_records,
                        calibration_positive_records=calibration_positive_records,
                        calibration_negative_records=calibration_negative_records,
                        reliability_bins=reliability_bins,
                        reason=reason,
                    ),
                    probabilities=base_validation_probabilities,
                    calibrator=None,
                )
            )
            continue
        try:
            calibrator = CalibratedClassifierCV(estimator=base_estimator, method=method, cv="prefit")
            calibrator.fit(calibration_x, calibration_y)
            probabilities = np.asarray(calibrator.predict_proba(validation_x)[:, 1], dtype=float)
            results.append(
                CalibrationFit(
                    result=_result(
                        method,
                        "completed",
                        validation_truth,
                        probabilities,
                        calibration_records=calibration_records,
                        calibration_positive_records=calibration_positive_records,
                        calibration_negative_records=calibration_negative_records,
                        reliability_bins=reliability_bins,
                    ),
                    probabilities=probabilities,
                    calibrator=calibrator,
                )
            )
        except (ValueError, TypeError) as exc:
            results.append(
                CalibrationFit(
                    result=_result(
                        method,
                        "failed",
                        validation_truth,
                        None,
                        calibration_records=calibration_records,
                        calibration_positive_records=calibration_positive_records,
                        calibration_negative_records=calibration_negative_records,
                        reliability_bins=reliability_bins,
                        reason=f"Calibration fitting failed safely: {exc}",
                    ),
                    probabilities=base_validation_probabilities,
                    calibrator=None,
                )
            )
    return results
