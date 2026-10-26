"""Controlled Phase 9 APS validation using the training file only.

This runner deliberately does not resolve, open, or pass the official test CSV
to any code path. It reuses the Phase 2 split/preprocessing helpers, Phase 3
trainer registry, Phase 4 evaluation helpers, Phase 5 threshold/calibration
metrics, and Phase 7 checksum/registry services. Generated outputs live under
the ignored ``backend/artifacts/phase9`` directory.
"""

from __future__ import annotations

import argparse
import csv
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import itertools
import json
import math
from pathlib import Path
import random
import sys
import time
from typing import Any, Iterable

import joblib
import numpy as np
import pandas as pd
from imblearn.pipeline import Pipeline as ImbalancedPipeline
from imblearn.over_sampling import SMOTE
from sklearn.isotonic import IsotonicRegression
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    log_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, train_test_split

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.database.base import Base
from app.database.session import create_database_engine, create_session_factory
from app.models.dataset import DatasetMetadata
from app.models.experiment import ExperimentRun
from app.schemas.phase5 import ThresholdOptimizationRequest
from app.services.dataset.ingestion import read_dataset
from app.services.dataset.preprocessing import build_preprocessing_pipeline
from app.services.dataset.splitting import prepare_training_validation_splits
from app.services.model_training.artifacts import (
    experiment_artifact_paths,
    save_json,
)
from app.services.model_training.evaluation import build_curve_data
from app.services.model_training.trainers.base import ImbalanceSettings
from app.services.model_training.trainers.registry import get_trainer
from app.services.reproducibility import (
    checksum_paths,
    configuration_fingerprint,
    dependency_versions,
    sha256_file,
)
from app.services.registry import ModelRegistryService
from app.services.threshold_optimization import (
    build_threshold_candidates,
    evaluate_threshold_point,
)
from app.services.probability_calibration import reliability_points


SEED = 42
VALIDATION_RATIO = 0.2
CV_FOLDS = 3
# The initial ten-configuration run exceeded the measured local runtime bound
# during XGBoost search. Six configurations per family retain three-fold
# stratified comparison while keeping the validation job bounded.
SEARCH_BUDGET = 6
FP_COST = 1.0
FN_COST = 10.0
TARGET = "class"
MODEL_NAMES = ("logistic_regression", "random_forest", "xgboost", "catboost")
STRATEGIES = ("original", "class_weight", "smote")
PREPROCESSING = {
    "logistic_regression": {"original": "median", "class_weight": "median", "smote": "median"},
    "random_forest": {"original": "median", "class_weight": "median", "smote": "median"},
    "xgboost": {"original": "native", "class_weight": "native", "smote": "median"},
    "catboost": {"original": "native", "class_weight": "native", "smote": "median"},
}

# Search is performed once per model family with class weighting as the
# representative imbalance policy. The selected family parameters are then
# applied unchanged to original/class-weighted/SMOTE variants so the strategy
# comparison is not confounded by a different hyperparameter budget.
BASE_PARAMETERS: dict[str, dict[str, Any]] = {
    "logistic_regression": {"max_iter": 1000, "solver": "lbfgs", "penalty": "l2"},
    "random_forest": {"n_jobs": 2, "max_features": "sqrt"},
    "xgboost": {"n_jobs": 2, "min_child_weight": 1.0, "reg_lambda": 1.0},
    "catboost": {"thread_count": 2},
}
SEARCH_SPACES: dict[str, dict[str, list[Any]]] = {
    "logistic_regression": {
        "C": [0.03, 0.1, 0.3, 1.0, 3.0, 10.0, 30.0],
    },
    "random_forest": {
        "n_estimators": [50, 100, 150],
        "max_depth": [None, 12, 24],
        "min_samples_leaf": [1, 2, 5],
        "max_features": ["sqrt", "log2"],
    },
    "xgboost": {
        "n_estimators": [50, 100],
        "max_depth": [3, 5],
        "learning_rate": [0.05, 0.1],
        "subsample": [0.8, 1.0],
        "colsample_bytree": [0.8, 1.0],
    },
    "catboost": {
        "iterations": [50, 100, 150],
        "depth": [4, 6],
        "learning_rate": [0.05, 0.1],
        "l2_leaf_reg": [1.0, 3.0],
    },
}


@dataclass(frozen=True)
class ValidationData:
    dataset_id: str
    dataset_fingerprint: str
    feature_names: list[str]
    training_frame: pd.DataFrame
    validation_frame: pd.DataFrame
    training_x: pd.DataFrame
    validation_x: pd.DataFrame
    training_y: np.ndarray
    validation_y: np.ndarray
    split_identifier: str
    split_payload: dict[str, Any]


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]
    if isinstance(value, np.ndarray):
        return [json_safe(item) for item in value.tolist()]
    if hasattr(value, "item"):
        return json_safe(value.item())
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_safe(value), indent=2, ensure_ascii=False), encoding="utf-8")


def slug(model_name: str, strategy: str) -> str:
    return f"{model_name}__{strategy}"


def load_training_data(settings: Settings) -> ValidationData:
    """Load only the configured training CSV and derive the existing split."""

    training_path = settings.raw_dataset_dir / settings.training_dataset_filename
    ingested = read_dataset(
        training_path,
        dataset_type="training",
        target_column=settings.target_column,
        expected_feature_count=settings.expected_feature_count,
    )
    dataset_id = f"training-{ingested.info.fingerprint[:16]}"
    prepared = prepare_training_validation_splits(
        ingested.frame,
        target_column=ingested.target_column,
        dataset_id=dataset_id,
        validation_ratio=VALIDATION_RATIO,
        random_seed=SEED,
    )
    feature_names = list(ingested.feature_columns)
    training_frame = prepared.training[feature_names + [TARGET]].reset_index(drop=True)
    validation_frame = prepared.validation[feature_names + [TARGET]].reset_index(drop=True)
    training_x = training_frame[feature_names]
    validation_x = validation_frame[feature_names]
    training_y = training_frame[TARGET].map({"neg": 0, "pos": 1}).astype(int).to_numpy()
    validation_y = validation_frame[TARGET].map({"neg": 0, "pos": 1}).astype(int).to_numpy()
    split_payload = {
        "dataset_id": dataset_id,
        "dataset_fingerprint": ingested.info.fingerprint,
        "validation_ratio": VALIDATION_RATIO,
        "random_seed": SEED,
        "training_records": len(training_frame),
        "validation_records": len(validation_frame),
        "training_class_counts": {str(k): int(v) for k, v in training_frame[TARGET].value_counts().items()},
        "validation_class_counts": {str(k): int(v) for k, v in validation_frame[TARGET].value_counts().items()},
        "splits": [summary.model_dump(mode="json") for summary in prepared.summaries],
        "test_isolation_note": "The official APS test dataset was not loaded, fitted, transformed or used in Phase 9.",
    }
    split_identifier = "|".join(summary.fingerprint for summary in prepared.summaries)
    return ValidationData(
        dataset_id=dataset_id,
        dataset_fingerprint=ingested.info.fingerprint,
        feature_names=feature_names,
        training_frame=training_frame,
        validation_frame=validation_frame,
        training_x=training_x,
        validation_x=validation_x,
        training_y=training_y,
        validation_y=validation_y,
        split_identifier=split_identifier,
        split_payload=split_payload,
    )


def sample_candidates(model_name: str, budget: int = SEARCH_BUDGET) -> list[dict[str, Any]]:
    space = SEARCH_SPACES[model_name]
    keys = list(space)
    candidates = [dict(zip(keys, values)) for values in itertools.product(*(space[key] for key in keys))]
    random.Random(SEED).shuffle(candidates)
    return candidates[: min(budget, len(candidates))]


def make_hyperparameters(model_name: str, candidate: dict[str, Any] | None = None) -> dict[str, Any]:
    values = dict(BASE_PARAMETERS[model_name])
    if candidate:
        values.update(candidate)
    return values


def imbalance_settings(frame: pd.DataFrame, strategy: str) -> ImbalanceSettings:
    if strategy != "class_weight":
        return ImbalanceSettings(mode="none")
    negatives = int((frame[TARGET] == "neg").sum())
    positives = int((frame[TARGET] == "pos").sum())
    if negatives == 0 or positives == 0:
        raise ValueError("Both target classes are required for class weighting.")
    ratio = negatives / positives
    return ImbalanceSettings(mode="balanced", negative_weight=1.0, positive_weight=ratio, scale_pos_weight=ratio)


def build_pipeline(
    model_name: str,
    strategy: str,
    preprocessing_strategy: str,
    hyperparameters: dict[str, Any],
    weight_frame: pd.DataFrame,
) -> ImbalancedPipeline:
    trainer = get_trainer(model_name)
    config = trainer.validate_hyperparameters(hyperparameters)
    imbalance = imbalance_settings(weight_frame, strategy)
    estimator = trainer.build_estimator(config, imbalance=imbalance, random_seed=SEED)
    phase2_pipeline = build_preprocessing_pipeline(
        feature_names=list(weight_frame.columns.drop(TARGET)),
        strategy=preprocessing_strategy,  # type: ignore[arg-type]
        model_kind=model_name,  # type: ignore[arg-type]
    )
    steps: list[tuple[str, Any]] = [("preprocessor", phase2_pipeline.named_steps["features"])]
    if strategy == "smote":
        steps.append(("sampler", SMOTE(random_state=SEED, k_neighbors=5)))
    steps.append(("model", estimator))
    return ImbalancedPipeline(steps=steps)


def metric_dict(y_true: np.ndarray, probabilities: np.ndarray, threshold: float) -> dict[str, Any]:
    predictions = (probabilities >= threshold).astype(int)
    matrix = confusion_matrix(y_true, predictions, labels=[0, 1])
    tn, fp, fn, tp = (int(value) for value in matrix.ravel())
    actual_negative = tn + fp
    return {
        "threshold": float(threshold),
        "pr_auc": float(average_precision_score(y_true, probabilities)),
        "roc_auc": float(roc_auc_score(y_true, probabilities)),
        "precision": float(precision_score(y_true, predictions, zero_division=0)),
        "recall": float(recall_score(y_true, predictions, zero_division=0)),
        "f1_score": float(f1_score(y_true, predictions, zero_division=0)),
        "specificity": float(tn / actual_negative) if actual_negative else 0.0,
        "balanced_accuracy": float(balanced_accuracy_score(y_true, predictions)),
        "accuracy": float(accuracy_score(y_true, predictions)),
        "true_negative": tn,
        "false_positive": fp,
        "false_negative": fn,
        "true_positive": tp,
        "confusion_matrix": [[tn, fp], [fn, tp]],
        "false_positive_cost": FP_COST,
        "false_negative_cost": FN_COST,
        "estimated_business_cost": float(fp * FP_COST + fn * FN_COST),
        "business_cost_note": "Illustrative Phase 9 assumption: FP=1 and FN=10; not measured Scania operational cost.",
    }


def threshold_points(y_true: np.ndarray, probabilities: np.ndarray) -> list[dict[str, Any]]:
    candidates = build_threshold_candidates(0.0, 1.0, threshold_candidates=201)
    return [
        evaluate_threshold_point(
            y_true,
            probabilities,
            threshold,
            false_positive_cost=FP_COST,
            false_negative_cost=FN_COST,
        ).model_dump(mode="json")
        for threshold in candidates
    ]


def choose_min_cost(points: list[dict[str, Any]]) -> dict[str, Any]:
    return min(points, key=lambda point: (point["business_cost"], -point["recall"], point["threshold"]))


def choose_max_f1(points: list[dict[str, Any]]) -> dict[str, Any]:
    return min(points, key=lambda point: (-point["f1_score"], -point["recall"], point["threshold"]))


def choose_recall_constrained(points: list[dict[str, Any]], required_recall: float = 0.90) -> dict[str, Any] | None:
    eligible = [point for point in points if point["recall"] >= required_recall]
    return min(eligible, key=lambda point: (point["threshold"], -point["precision"])) if eligible else None


def save_plot_set(output_dir: Path, key: str, y_true: np.ndarray, probabilities: np.ndarray, points: list[dict[str, Any]]) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import precision_recall_curve, roc_curve

    plot_dir = output_dir / "plots"
    plot_dir.mkdir(parents=True, exist_ok=True)
    precision, recall, _ = precision_recall_curve(y_true, probabilities)
    figure, axis = plt.subplots(figsize=(6, 5))
    axis.plot(recall, precision)
    axis.set(xlabel="Recall", ylabel="Precision", title=f"Phase 9 validation PR curve: {key}")
    figure.tight_layout()
    figure.savefig(plot_dir / f"{key}-pr.svg", format="svg")
    plt.close(figure)

    false_positive_rate, true_positive_rate, _ = roc_curve(y_true, probabilities)
    figure, axis = plt.subplots(figsize=(6, 5))
    axis.plot(false_positive_rate, true_positive_rate)
    axis.plot([0, 1], [0, 1], linestyle="--", color="grey")
    axis.set(xlabel="False-positive rate", ylabel="True-positive rate", title=f"Phase 9 validation ROC curve: {key}")
    figure.tight_layout()
    figure.savefig(plot_dir / f"{key}-roc.svg", format="svg")
    plt.close(figure)

    thresholds = [point["threshold"] for point in points]
    figure, axis = plt.subplots(figsize=(7, 4))
    axis.plot(thresholds, [point["precision"] for point in points], label="Precision")
    axis.plot(thresholds, [point["recall"] for point in points], label="Recall")
    axis.plot(thresholds, [point["f1_score"] for point in points], label="F1")
    axis.set(xlabel="Threshold", ylabel="Metric", title=f"Phase 9 validation threshold curves: {key}")
    axis.legend()
    figure.tight_layout()
    figure.savefig(plot_dir / f"{key}-threshold-metrics.svg", format="svg")
    plt.close(figure)

    figure, axis = plt.subplots(figsize=(7, 4))
    axis.plot(thresholds, [point["business_cost"] for point in points], color="tab:red")
    axis.set(xlabel="Threshold", ylabel="Illustrative total cost", title=f"Phase 9 validation cost curve: {key}")
    figure.tight_layout()
    figure.savefig(plot_dir / f"{key}-threshold-cost.svg", format="svg")
    plt.close(figure)

    default = metric_dict(y_true, probabilities, 0.5)
    matrix = default["confusion_matrix"]
    figure, axis = plt.subplots(figsize=(4, 4))
    image = axis.imshow(matrix, cmap="Blues")
    figure.colorbar(image, ax=axis)
    axis.set(xticks=[0, 1], yticks=[0, 1], xticklabels=["neg", "pos"], yticklabels=["neg", "pos"], xlabel="Predicted", ylabel="Actual", title=f"Phase 9 validation confusion: {key}")
    for row in range(2):
        for column in range(2):
            axis.text(column, row, str(matrix[row][column]), ha="center", va="center")
    figure.tight_layout()
    figure.savefig(plot_dir / f"{key}-confusion.svg", format="svg")
    plt.close(figure)


def run_family_search(data: ValidationData, model_name: str, output_dir: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Tune one model family on the 48k outer training partition only."""

    preprocessing_strategy = PREPROCESSING[model_name]["class_weight"]
    splitter = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=SEED)
    cv_splits = list(splitter.split(data.training_x, data.training_y))
    rows: list[dict[str, Any]] = []
    for candidate_index, candidate in enumerate(sample_candidates(model_name), start=1):
        hyperparameters = make_hyperparameters(model_name, candidate)
        fold_scores: list[float] = []
        fold_durations: list[float] = []
        started = time.perf_counter()
        failure: str | None = None
        for fold_index, (fit_indices, holdout_indices) in enumerate(cv_splits, start=1):
            fold_started = time.perf_counter()
            try:
                fit_frame = data.training_frame.iloc[fit_indices]
                pipeline = build_pipeline(
                    model_name,
                    "class_weight",
                    preprocessing_strategy,
                    hyperparameters,
                    fit_frame,
                )
                pipeline.fit(data.training_x.iloc[fit_indices], data.training_y[fit_indices])
                probabilities = pipeline.predict_proba(data.training_x.iloc[holdout_indices])[:, 1]
                fold_scores.append(float(average_precision_score(data.training_y[holdout_indices], probabilities)))
                fold_durations.append(time.perf_counter() - fold_started)
            except Exception as exc:  # preserve failed candidates as evidence
                failure = f"{type(exc).__name__}: {exc}"
                break
        row = {
            "model_name": model_name,
            "representative_strategy": "class_weight",
            "preprocessing_strategy": preprocessing_strategy,
            "candidate_index": candidate_index,
            "parameters": hyperparameters,
            "candidate_parameters": candidate,
            "fold_pr_auc": fold_scores,
            "mean_cv_pr_auc": float(np.mean(fold_scores)) if fold_scores else None,
            "std_cv_pr_auc": float(np.std(fold_scores, ddof=0)) if fold_scores else None,
            "fold_durations_seconds": fold_durations,
            "duration_seconds": time.perf_counter() - started,
            "cv_folds": CV_FOLDS,
            "random_seed": SEED,
            "status": "failed" if failure else "completed",
            "failure": failure,
        }
        rows.append(row)
        write_json(output_dir / "search" / f"{model_name}-candidate-{candidate_index:02d}.json", row)
    successful = [row for row in rows if row["status"] == "completed" and row["mean_cv_pr_auc"] is not None]
    if not successful:
        raise RuntimeError(f"All Phase 9 search candidates failed for {model_name}.")
    best = max(successful, key=lambda row: (row["mean_cv_pr_auc"], -(row["std_cv_pr_auc"] or 0.0)))
    best_payload = {
        "model_name": model_name,
        "preprocessing_strategy": preprocessing_strategy,
        "best_parameters": best["parameters"],
        "best_candidate_parameters": best["candidate_parameters"],
        "mean_cv_pr_auc": best["mean_cv_pr_auc"],
        "std_cv_pr_auc": best["std_cv_pr_auc"],
        "search_budget": len(rows),
        "cv_folds": CV_FOLDS,
        "random_seed": SEED,
        "selection_metric": "average_precision / PR-AUC",
    }
    write_json(output_dir / "search" / f"{model_name}-summary.json", {"best": best_payload, "candidates": rows})
    return best_payload, rows


def write_search_csv(output_dir: Path, search_rows: Iterable[dict[str, Any]]) -> None:
    rows = list(search_rows)
    path = output_dir / "hyperparameter_search.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "model_name", "representative_strategy", "preprocessing_strategy", "candidate_index",
        "candidate_parameters", "parameters", "fold_pr_auc", "mean_cv_pr_auc", "std_cv_pr_auc",
        "fold_durations_seconds", "duration_seconds", "cv_folds", "random_seed", "status", "failure",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: json.dumps(row[field], sort_keys=True) if isinstance(row[field], (dict, list)) else row.get(field) for field in fields})


def run_comparison_matrix(
    settings: Settings,
    data: ValidationData,
    output_dir: Path,
) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    search_summaries: dict[str, Any] = {}
    all_search_rows: list[dict[str, Any]] = []
    for model_name in MODEL_NAMES:
        summary, rows = run_family_search(data, model_name, output_dir)
        search_summaries[model_name] = summary
        all_search_rows.extend(rows)
        write_json(output_dir / "search_summaries.json", search_summaries)
        write_search_csv(output_dir, all_search_rows)

    comparison_rows: list[dict[str, Any]] = []
    validation_metrics: dict[str, Any] = {}
    for model_name in MODEL_NAMES:
        best_parameters = search_summaries[model_name]["best_parameters"]
        for strategy in STRATEGIES:
            key = slug(model_name, strategy)
            preprocessing_strategy = PREPROCESSING[model_name][strategy]
            started = time.perf_counter()
            pipeline = build_pipeline(
                model_name,
                strategy,
                preprocessing_strategy,
                best_parameters,
                data.training_frame,
            )
            pipeline.fit(data.training_x, data.training_y)
            training_duration = time.perf_counter() - started
            inference_started = time.perf_counter()
            probabilities = pipeline.predict_proba(data.validation_x)[:, 1]
            inference_duration = time.perf_counter() - inference_started
            default_metrics = metric_dict(data.validation_y, probabilities, 0.5)
            points = threshold_points(data.validation_y, probabilities)
            min_cost = choose_min_cost(points)
            max_f1 = choose_max_f1(points)
            recall_constrained = choose_recall_constrained(points)
            curves = build_curve_data(data.validation_y.tolist(), probabilities.tolist())
            write_json(output_dir / "curves" / f"{key}.json", curves)
            write_json(output_dir / "thresholds" / f"{key}.json", {
                "evaluation_scope": "validation",
                "threshold_source": "validation labels for exploratory comparison only",
                "default": default_metrics,
                "minimum_cost": min_cost,
                "maximum_f1": max_f1,
                "recall_constrained": recall_constrained,
                "points": points,
                "false_positive_cost": FP_COST,
                "false_negative_cost": FN_COST,
            })
            save_plot_set(output_dir, key, data.validation_y, probabilities, points)
            row = {
                "experiment_reference_id": f"phase9-{key}",
                "model_family": model_name,
                "imbalance_strategy": strategy,
                "preprocessing_strategy": preprocessing_strategy,
                "best_hyperparameters": best_parameters,
                "cv_pr_auc_mean": search_summaries[model_name]["mean_cv_pr_auc"],
                "cv_pr_auc_std": search_summaries[model_name]["std_cv_pr_auc"],
                "validation_pr_auc": default_metrics["pr_auc"],
                "validation_roc_auc": default_metrics["roc_auc"],
                "validation_precision": default_metrics["precision"],
                "validation_recall": default_metrics["recall"],
                "validation_f1": default_metrics["f1_score"],
                "validation_specificity": default_metrics["specificity"],
                "validation_balanced_accuracy": default_metrics["balanced_accuracy"],
                "validation_true_negative": default_metrics["true_negative"],
                "validation_false_positive": default_metrics["false_positive"],
                "validation_false_negative": default_metrics["false_negative"],
                "validation_true_positive": default_metrics["true_positive"],
                "validation_business_cost_default": default_metrics["estimated_business_cost"],
                "validation_min_cost_threshold": min_cost["threshold"],
                "validation_min_cost": min_cost["business_cost"],
                "validation_max_f1_threshold": max_f1["threshold"],
                "validation_max_f1": max_f1["f1_score"],
                "validation_recall_constrained_threshold": recall_constrained["threshold"] if recall_constrained else None,
                "validation_recall_constrained_precision": recall_constrained["precision"] if recall_constrained else None,
                "training_duration_seconds": training_duration,
                "inference_duration_seconds": inference_duration,
                "evaluation_scope": "validation",
                "dataset_id": data.dataset_id,
                "dataset_fingerprint": data.dataset_fingerprint,
                "split_identifier": data.split_identifier,
                "official_test_evaluated": False,
                "selected": False,
            }
            comparison_rows.append(row)
            validation_metrics[key] = {
                "reference_id": row["experiment_reference_id"],
                "model_family": model_name,
                "imbalance_strategy": strategy,
                "preprocessing_strategy": preprocessing_strategy,
                "best_hyperparameters": best_parameters,
                "default_threshold_metrics": default_metrics,
                "validation_threshold_analysis": {
                    "minimum_cost": min_cost,
                    "maximum_f1": max_f1,
                    "recall_constrained": recall_constrained,
                },
                "curves_reference": f"curves/{key}.json",
                "official_test_evaluated": False,
            }
            write_json(output_dir / "validation_metrics" / f"{key}.json", validation_metrics[key])
            write_comparison_csv(output_dir, comparison_rows)
    write_json(output_dir / "validation_metrics.json", validation_metrics)
    return comparison_rows, search_summaries, all_search_rows


def write_comparison_csv(output_dir: Path, rows: list[dict[str, Any]]) -> None:
    path = output_dir / "model_comparison.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "experiment_reference_id", "model_family", "imbalance_strategy", "preprocessing_strategy",
        "best_hyperparameters", "cv_pr_auc_mean", "cv_pr_auc_std", "validation_pr_auc",
        "validation_roc_auc", "validation_precision", "validation_recall", "validation_f1",
        "validation_specificity", "validation_balanced_accuracy", "validation_true_negative",
        "validation_false_positive", "validation_false_negative", "validation_true_positive",
        "validation_business_cost_default", "validation_min_cost_threshold", "validation_min_cost",
        "validation_max_f1_threshold", "validation_max_f1", "validation_recall_constrained_threshold",
        "validation_recall_constrained_precision", "training_duration_seconds", "inference_duration_seconds",
        "evaluation_scope", "dataset_id", "dataset_fingerprint", "split_identifier", "official_test_evaluated", "selected",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: json.dumps(row[field], sort_keys=True) if isinstance(row.get(field), dict) else row.get(field) for field in fields})


def fit_oof_probabilities(data: ValidationData, model_name: str, strategy: str, hyperparameters: dict[str, Any]) -> np.ndarray:
    splitter = StratifiedKFold(n_splits=CV_FOLDS, shuffle=True, random_state=SEED)
    oof = np.full(len(data.training_y), np.nan, dtype=float)
    for fit_indices, holdout_indices in splitter.split(data.training_x, data.training_y):
        fit_frame = data.training_frame.iloc[fit_indices]
        pipeline = build_pipeline(
            model_name,
            strategy,
            PREPROCESSING[model_name][strategy],
            hyperparameters,
            fit_frame,
        )
        pipeline.fit(data.training_x.iloc[fit_indices], data.training_y[fit_indices])
        oof[holdout_indices] = pipeline.predict_proba(data.training_x.iloc[holdout_indices])[:, 1]
    if np.any(~np.isfinite(oof)):
        raise RuntimeError("OOF probability generation did not fill every training record.")
    return oof


def fit_sigmoid(probabilities: np.ndarray, truth: np.ndarray) -> LogisticRegression:
    clipped = np.clip(probabilities, 1e-6, 1 - 1e-6)
    logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    calibrator = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000, random_state=SEED)
    calibrator.fit(logits, truth)
    return calibrator


def apply_calibrator(method: str, calibrator: Any, probabilities: np.ndarray) -> np.ndarray:
    if method == "sigmoid":
        clipped = np.clip(probabilities, 1e-6, 1 - 1e-6)
        logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
        return np.asarray(calibrator.predict_proba(logits)[:, 1], dtype=float)
    if method == "isotonic":
        return np.asarray(calibrator.predict(probabilities), dtype=float)
    return np.asarray(probabilities, dtype=float)


def probability_quality(truth: np.ndarray, probabilities: np.ndarray) -> dict[str, Any]:
    curve, ece = reliability_points(truth, probabilities, bins=10)
    return {
        "brier_score": float(np.mean((probabilities - truth) ** 2)),
        "log_loss": float(log_loss(truth, np.clip(probabilities, 1e-15, 1 - 1e-15), labels=[0, 1])),
        "expected_calibration_error": float(ece),
        "pr_auc": float(average_precision_score(truth, probabilities)),
        "roc_auc": float(roc_auc_score(truth, probabilities)),
        "reliability_curve": [point.model_dump(mode="json") for point in curve],
    }


def save_reliability_plot(output_dir: Path, method_probabilities: dict[str, np.ndarray], truth: np.ndarray) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figure, axis = plt.subplots(figsize=(6, 5))
    axis.plot([0, 1], [0, 1], linestyle="--", color="grey", label="Perfect calibration")
    for method, probabilities in method_probabilities.items():
        curve, _ = reliability_points(truth, probabilities, bins=10)
        if curve:
            axis.plot(
                [point.predicted_probability for point in curve],
                [point.observed_failure_rate for point in curve],
                marker="o",
                label=method,
            )
    axis.set(xlabel="Mean predicted probability", ylabel="Observed failure rate", title="Phase 9 validation reliability")
    axis.legend()
    figure.tight_layout()
    figure.savefig(output_dir / "plots" / "selected-reliability.svg", format="svg")
    plt.close(figure)


def save_selected_threshold_plot(output_dir: Path, points: list[dict[str, Any]], selected_threshold: float) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    figure, axis = plt.subplots(figsize=(7, 4))
    thresholds = [point["threshold"] for point in points]
    axis.plot(thresholds, [point["precision"] for point in points], label="Precision")
    axis.plot(thresholds, [point["recall"] for point in points], label="Recall")
    axis.plot(thresholds, [point["f1_score"] for point in points], label="F1")
    axis.axvline(selected_threshold, color="black", linestyle="--", label="Selected threshold")
    axis.set(xlabel="Threshold", ylabel="Metric", title="Phase 9 selected-policy threshold curves")
    axis.legend()
    figure.tight_layout()
    figure.savefig(output_dir / "plots" / "selected-threshold-curves.svg", format="svg")
    plt.close(figure)


def register_final_candidate(
    settings: Settings,
    data: ValidationData,
    candidate_id: str,
    row: dict[str, Any],
    search_rows: list[dict[str, Any]],
    final_payload: dict[str, Any],
    output_dir: Path,
    pipeline: Any,
    validation_curves: dict[str, Any],
    feature_importance: list[dict[str, Any]],
) -> dict[str, Any]:
    """Register the final validation candidate as evaluated, never approved."""

    paths = experiment_artifact_paths(settings.model_artifact_dir, candidate_id)
    paths.directory.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, paths.pipeline)
    joblib.dump(pipeline.named_steps["preprocessor"], paths.preprocessor)
    save_json(validation_curves, paths.curves)
    save_json(feature_importance, paths.feature_importance)
    confusion = row["default_validation_metrics"]["confusion_matrix"]
    save_confusion_artifact(paths.confusion_matrix_visualization, confusion, candidate_id)
    save_json(data.split_payload | {"candidate_id": candidate_id}, paths.split_metadata)

    configuration = {
        "phase": 9,
        "model_name": row["model_family"],
        "imbalance_strategy": row["imbalance_strategy"],
        "preprocessing_strategy": row["preprocessing_strategy"],
        "hyperparameters": row["best_hyperparameters"],
        "dataset_id": data.dataset_id,
        "dataset_fingerprint": data.dataset_fingerprint,
        "validation_ratio": VALIDATION_RATIO,
        "random_seed": SEED,
        "cv_folds": CV_FOLDS,
        "search_budget": SEARCH_BUDGET,
        "fit_scope": "48,000-record training partition only",
        "cv_scope": "three stratified folds within the 48,000-record training partition",
        "resampling_scope": "training folds/partition only" if row["imbalance_strategy"] == "smote" else "none",
        "calibration": final_payload["calibration"],
        "threshold_policy": final_payload["threshold_policy"],
        "cost_assumptions": {"false_positive_cost": FP_COST, "false_negative_cost": FN_COST, "note": "Illustrative, not operational Scania cost."},
        "selection_rationale": final_payload["selection_rationale"],
        "official_test_evaluated": False,
        "test_isolation_note": "The official APS test dataset was not loaded, fitted, transformed or used in Phase 9.",
    }
    metadata_payload = {
        "experiment_id": candidate_id,
        "phase": 9,
        "configuration": configuration,
        "best_parameters": row["best_hyperparameters"],
        "search_results": search_rows,
        "validation_metrics": final_payload["validation_metrics"],
        "curves": validation_curves,
        "feature_importance": feature_importance,
        "training_duration_seconds": row["training_duration_seconds"],
        "inference_duration_seconds": row["inference_duration_seconds"],
        "library_versions": dependency_versions(),
        "configuration_fingerprint": configuration_fingerprint(configuration),
        "selection_status": "final_validation_candidate",
        "official_test_evaluated": False,
    }
    checksums = checksum_paths({
        "pipeline": paths.pipeline,
        "preprocessor": paths.preprocessor,
        "splits": paths.split_metadata,
        "curves": paths.curves,
        "feature_importance": paths.feature_importance,
        "confusion_matrix": paths.confusion_matrix_visualization,
    })
    metadata_payload["artifact_checksums"] = checksums
    save_json(metadata_payload, paths.metadata)
    checksums["metadata"] = sha256_file(paths.metadata)

    engine = create_database_engine(settings)
    Base.metadata.create_all(engine)
    session_factory = create_session_factory(engine)
    session = session_factory()
    try:
        dataset = session.get(DatasetMetadata, data.dataset_id)
        if dataset is None:
            dataset = DatasetMetadata(
                dataset_id=data.dataset_id,
                dataset_name="aps_failure_training_set",
                dataset_type="training",
                source_file_name=settings.training_dataset_filename,
                source_path=str((settings.raw_dataset_dir / settings.training_dataset_filename).resolve()),
                fingerprint=data.dataset_fingerprint,
                file_size_bytes=(settings.raw_dataset_dir / settings.training_dataset_filename).stat().st_size,
                record_count=60_000,
                feature_count=len(data.feature_names),
                target_column=TARGET,
                status="ready",
                imported_at=utc_now(),
            )
            session.add(dataset)
            session.flush()
        run = session.get(ExperimentRun, candidate_id)
        if run is None:
            run = ExperimentRun(
                experiment_id=candidate_id,
                model_name=row["model_family"],
                model_version="phase9.1.0",
                dataset_id=data.dataset_id,
                dataset_fingerprint=data.dataset_fingerprint,
                status="completed",
                registry_status="evaluated",
                imbalance_strategy=row["imbalance_strategy"],
                preprocessing_strategy=row["preprocessing_strategy"],
                optimize_hyperparameters=True,
                random_seed=SEED,
                validation_ratio=VALIDATION_RATIO,
                threshold=final_payload["threshold_policy"]["selected_threshold"],
                false_positive_cost=FP_COST,
                false_negative_cost=FN_COST,
                search_budget=SEARCH_BUDGET,
                cv_folds=CV_FOLDS,
                artifact_directory=str(paths.directory),
                pipeline_artifact_path=str(paths.pipeline),
                preprocessor_artifact_path=str(paths.preprocessor),
                metadata_artifact_path=str(paths.metadata),
                split_metadata_path=str(paths.split_metadata),
                curves_artifact_path=str(paths.curves),
                feature_importance_artifact_path=str(paths.feature_importance),
                confusion_matrix_visualization_path=str(paths.confusion_matrix_visualization),
                configuration_json=json.dumps(configuration),
                best_parameters_json=json.dumps(row["best_hyperparameters"]),
                search_results_json=json.dumps(search_rows),
                metrics_json=json.dumps(final_payload["validation_metrics"]),
                curves_json=json.dumps(validation_curves),
                feature_importance_json=json.dumps(feature_importance),
                training_records=len(data.training_frame),
                validation_records=len(data.validation_frame),
                training_class_counts_json=json.dumps(data.split_payload["training_class_counts"]),
                validation_class_counts_json=json.dumps(data.split_payload["validation_class_counts"]),
                training_duration_seconds=row["training_duration_seconds"],
                inference_duration_seconds=row["inference_duration_seconds"],
                created_at=utc_now(),
                started_at=utc_now(),
                completed_at=utc_now(),
                configuration_fingerprint=metadata_payload["configuration_fingerprint"],
                split_identifier=data.split_identifier,
                library_versions_json=json.dumps(dependency_versions()),
                artifact_checksums_json=json.dumps(checksums),
                artifact_integrity_status="verified",
                lifecycle_metadata_json=json.dumps({
                    "phase9_status": "final_validation_candidate",
                    "selection_rationale": final_payload["selection_rationale"],
                    "genuine_aps_evaluation_completed": False,
                    "official_test_evaluated": False,
                }),
            )
            session.add(run)
        else:
            # Make reruns idempotent when the same dedicated Phase 9 database
            # already contains this candidate from an earlier artifact build.
            updates = {
                "model_name": row["model_family"],
                "model_version": "phase9.1.0",
                "dataset_id": data.dataset_id,
                "dataset_fingerprint": data.dataset_fingerprint,
                "status": "completed",
                "registry_status": "evaluated",
                "imbalance_strategy": row["imbalance_strategy"],
                "preprocessing_strategy": row["preprocessing_strategy"],
                "optimize_hyperparameters": True,
                "random_seed": SEED,
                "validation_ratio": VALIDATION_RATIO,
                "threshold": final_payload["threshold_policy"]["selected_threshold"],
                "false_positive_cost": FP_COST,
                "false_negative_cost": FN_COST,
                "search_budget": SEARCH_BUDGET,
                "cv_folds": CV_FOLDS,
                "artifact_directory": str(paths.directory),
                "pipeline_artifact_path": str(paths.pipeline),
                "preprocessor_artifact_path": str(paths.preprocessor),
                "metadata_artifact_path": str(paths.metadata),
                "split_metadata_path": str(paths.split_metadata),
                "curves_artifact_path": str(paths.curves),
                "feature_importance_artifact_path": str(paths.feature_importance),
                "confusion_matrix_visualization_path": str(paths.confusion_matrix_visualization),
                "configuration_json": json.dumps(configuration),
                "best_parameters_json": json.dumps(row["best_hyperparameters"]),
                "search_results_json": json.dumps(search_rows),
                "metrics_json": json.dumps(final_payload["validation_metrics"]),
                "curves_json": json.dumps(validation_curves),
                "feature_importance_json": json.dumps(feature_importance),
                "training_records": len(data.training_frame),
                "validation_records": len(data.validation_frame),
                "training_class_counts_json": json.dumps(data.split_payload["training_class_counts"]),
                "validation_class_counts_json": json.dumps(data.split_payload["validation_class_counts"]),
                "training_duration_seconds": row["training_duration_seconds"],
                "inference_duration_seconds": row["inference_duration_seconds"],
                "completed_at": utc_now(),
                "configuration_fingerprint": metadata_payload["configuration_fingerprint"],
                "split_identifier": data.split_identifier,
                "library_versions_json": json.dumps(dependency_versions()),
                "artifact_checksums_json": json.dumps(checksums),
                "artifact_integrity_status": "verified",
                "lifecycle_metadata_json": json.dumps({
                    "phase9_status": "final_validation_candidate",
                    "selection_rationale": final_payload["selection_rationale"],
                    "genuine_aps_evaluation_completed": False,
                    "official_test_evaluated": False,
                }),
            }
            for key, value in updates.items():
                setattr(run, key, value)
        session.commit()
        registry = ModelRegistryService(settings, session)
        inventory = registry.verify_artifacts("experiment", candidate_id, persist_backfill=False)
        reproducibility = registry.reproducibility("experiment", candidate_id)
        registry_payload = {
            "reference_type": "experiment",
            "reference_id": candidate_id,
            "lifecycle_status": "evaluated",
            "phase9_status": "final_validation_candidate",
            "artifact_inventory": inventory.model_dump(mode="json"),
            "reproducibility": reproducibility.model_dump(mode="json"),
            "promotion": "not performed",
            "official_test_evaluated": False,
        }
        write_json(output_dir / "registry_verification.json", registry_payload)
        return registry_payload
    finally:
        session.close()
        engine.dispose()


def save_confusion_artifact(path: Path, matrix: list[list[int]], candidate_id: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    path.parent.mkdir(parents=True, exist_ok=True)
    figure, axis = plt.subplots(figsize=(4, 4))
    image = axis.imshow(matrix, cmap="Blues")
    figure.colorbar(image, ax=axis)
    axis.set(xticks=[0, 1], yticks=[0, 1], xticklabels=["neg", "pos"], yticklabels=["neg", "pos"], xlabel="Predicted", ylabel="Actual", title=f"Phase 9 selected candidate: {candidate_id}")
    for row in range(2):
        for column in range(2):
            axis.text(column, row, str(matrix[row][column]), ha="center", va="center")
    figure.tight_layout()
    figure.savefig(path, format="svg")
    plt.close(figure)


def finalize_candidate(
    settings: Settings,
    data: ValidationData,
    output_dir: Path,
    comparison_rows: list[dict[str, Any]],
    search_summaries: dict[str, Any],
    search_rows: list[dict[str, Any]],
    candidate_key: str,
) -> None:
    selected = next((row for row in comparison_rows if slug(row["model_family"], row["imbalance_strategy"]) == candidate_key), None)
    if selected is None:
        raise ValueError(f"Candidate '{candidate_key}' is not in the Phase 9 comparison matrix.")
    model_name = selected["model_family"]
    strategy = selected["imbalance_strategy"]
    hyperparameters = selected["best_hyperparameters"]

    oof_started = time.perf_counter()
    oof_probabilities = fit_oof_probabilities(data, model_name, strategy, hyperparameters)
    oof_duration = time.perf_counter() - oof_started
    oof_fit_indices, oof_eval_indices = train_test_split(
        np.arange(len(data.training_y)),
        test_size=0.25,
        random_state=SEED,
        stratify=data.training_y,
    )
    internal_calibration = {}
    calibrators: dict[str, Any] = {}
    for method in ("sigmoid", "isotonic"):
        if method == "sigmoid":
            calibrator = fit_sigmoid(oof_probabilities[oof_fit_indices], data.training_y[oof_fit_indices])
        else:
            calibrator = IsotonicRegression(out_of_bounds="clip")
            calibrator.fit(oof_probabilities[oof_fit_indices], data.training_y[oof_fit_indices])
        calibrators[method] = calibrator
        internal_probabilities = apply_calibrator(method, calibrator, oof_probabilities[oof_eval_indices])
        internal_calibration[method] = probability_quality(data.training_y[oof_eval_indices], internal_probabilities)
    selected_calibration_method = min(
        internal_calibration,
        key=lambda method: (internal_calibration[method]["brier_score"], internal_calibration[method]["expected_calibration_error"], internal_calibration[method]["log_loss"]),
    )

    internal_calibrator = calibrators[selected_calibration_method]
    internal_policy_probabilities = apply_calibrator(
        selected_calibration_method,
        internal_calibrator,
        oof_probabilities[oof_eval_indices],
    )
    internal_policy_points = threshold_points(data.training_y[oof_eval_indices], internal_policy_probabilities)
    internal_min_cost = choose_min_cost(internal_policy_points)
    internal_max_f1 = choose_max_f1(internal_policy_points)
    internal_recall_constrained = choose_recall_constrained(internal_policy_points)

    final_started = time.perf_counter()
    final_pipeline = build_pipeline(
        model_name,
        strategy,
        PREPROCESSING[model_name][strategy],
        hyperparameters,
        data.training_frame,
    )
    final_pipeline.fit(data.training_x, data.training_y)
    training_duration = time.perf_counter() - final_started
    inference_started = time.perf_counter()
    uncalibrated_validation_probabilities = final_pipeline.predict_proba(data.validation_x)[:, 1]
    inference_duration = time.perf_counter() - inference_started

    # Refit the selected calibration mapping on every OOF prediction, then
    # apply it to the untouched 12k validation partition.
    if selected_calibration_method == "sigmoid":
        selected_calibrator = fit_sigmoid(oof_probabilities, data.training_y)
    else:
        selected_calibrator = IsotonicRegression(out_of_bounds="clip")
        selected_calibrator.fit(oof_probabilities, data.training_y)
    calibrated_validation_probabilities = apply_calibrator(
        selected_calibration_method,
        selected_calibrator,
        uncalibrated_validation_probabilities,
    )
    validation_metrics = {
        "uncalibrated_default": metric_dict(data.validation_y, uncalibrated_validation_probabilities, 0.5),
        "calibrated_default": metric_dict(data.validation_y, calibrated_validation_probabilities, 0.5),
        "calibrated_internal_min_cost_threshold": metric_dict(data.validation_y, calibrated_validation_probabilities, internal_min_cost["threshold"]),
        "calibrated_internal_max_f1_threshold": metric_dict(data.validation_y, calibrated_validation_probabilities, internal_max_f1["threshold"]),
    }
    if internal_recall_constrained:
        validation_metrics["calibrated_internal_recall_constrained_threshold"] = metric_dict(
            data.validation_y,
            calibrated_validation_probabilities,
            internal_recall_constrained["threshold"],
        )
    calibration_validation = {
        "uncalibrated": probability_quality(data.validation_y, uncalibrated_validation_probabilities),
        "sigmoid": probability_quality(data.validation_y, apply_calibrator("sigmoid", fit_sigmoid(oof_probabilities, data.training_y), uncalibrated_validation_probabilities)),
        "isotonic": probability_quality(data.validation_y, apply_calibrator("isotonic", IsotonicRegression(out_of_bounds="clip").fit(oof_probabilities, data.training_y), uncalibrated_validation_probabilities)),
    }
    validation_curves = build_curve_data(data.validation_y.tolist(), uncalibrated_validation_probabilities.tolist())
    selected_points = threshold_points(data.validation_y, calibrated_validation_probabilities)
    write_json(output_dir / "selected" / "oof_predictions.json", {
        "oof_records": len(oof_probabilities),
        "oof_duration_seconds": oof_duration,
        "internal_fit_records": len(oof_fit_indices),
        "internal_policy_records": len(oof_eval_indices),
        "split_random_seed": SEED,
        "calibration_method_selection": internal_calibration,
    })
    write_json(output_dir / "selected" / "calibration.json", {
        "fit_scope": "OOF predictions from three training-partition folds; external validation labels were not used for fitting.",
        "evaluation_scope": "12,000-record external validation partition",
        "selected_method": selected_calibration_method,
        "internal_method_comparison": internal_calibration,
        "external_validation_comparison": calibration_validation,
        "artifact_input": "OOF probabilities from the selected model/strategy",
        "official_test_evaluated": False,
    })
    write_json(output_dir / "selected" / "threshold_policy_comparisons.json", {
        "selection_scope": "Internal OOF policy subset derived from the 48,000-record training partition",
        "evaluation_scope": "12,000-record external validation partition",
        "false_positive_cost": FP_COST,
        "false_negative_cost": FN_COST,
        "selected_objective": "minimum_cost",
        "selected_threshold": internal_min_cost["threshold"],
        "default_threshold": 0.5,
        "internal_min_cost": internal_min_cost,
        "internal_max_f1": internal_max_f1,
        "internal_recall_constrained": internal_recall_constrained,
        "external_validation": validation_metrics,
        "points": selected_points,
        "official_test_evaluated": False,
    })
    joblib.dump(selected_calibrator, output_dir / "selected" / f"calibrator_{selected_calibration_method}.joblib")
    save_reliability_plot(output_dir, {
        "uncalibrated": uncalibrated_validation_probabilities,
        "sigmoid": apply_calibrator("sigmoid", fit_sigmoid(oof_probabilities, data.training_y), uncalibrated_validation_probabilities),
        "isotonic": apply_calibrator("isotonic", IsotonicRegression(out_of_bounds="clip").fit(oof_probabilities, data.training_y), uncalibrated_validation_probabilities),
    }, data.validation_y)
    save_selected_threshold_plot(output_dir, selected_points, internal_min_cost["threshold"])

    selected["selected"] = True
    selected["experiment_reference_id"] = "phase9-final-validation-candidate"
    selected["final_selected_threshold"] = internal_min_cost["threshold"]
    selected["selected_calibration_method"] = selected_calibration_method
    selected["final_validation_pr_auc"] = validation_metrics["calibrated_internal_min_cost_threshold"]["pr_auc"]
    write_comparison_csv(output_dir, comparison_rows)
    write_json(output_dir / "validation_metrics.json", {**json.loads((output_dir / "validation_metrics.json").read_text(encoding="utf-8")), "selected_candidate": validation_metrics})

    default_validation = validation_metrics["uncalibrated_default"]
    selection_rationale = (
        f"Selected {model_name} with {strategy} using the highest family-tuned CV PR-AUC among candidates with a defensible "
        f"recall/false-negative trade-off. CV mean PR-AUC={search_summaries[model_name]['mean_cv_pr_auc']:.6f}, "
        f"CV SD={search_summaries[model_name]['std_cv_pr_auc']:.6f}; external validation default recall="
        f"{default_validation['recall']:.4f}, default illustrative cost={default_validation['estimated_business_cost']:.1f}. "
        f"The final policy threshold was selected by minimum illustrative cost on an internal OOF policy subset, "
        f"then assessed once on the untouched 12,000-record validation partition. No production approval was performed."
    )
    final_payload = {
        "selection_rationale": selection_rationale,
        "calibration": {
            "selected_method": selected_calibration_method,
            "fit_scope": "OOF training-partition probabilities",
            "official_test_evaluated": False,
        },
        "threshold_policy": {
            "selected_objective": "minimum_cost",
            "selected_threshold": internal_min_cost["threshold"],
            "default_threshold": 0.5,
            "false_positive_cost": FP_COST,
            "false_negative_cost": FN_COST,
            "selection_scope": "internal OOF policy subset",
        },
        "validation_metrics": validation_metrics,
    }
    write_json(output_dir / "final_candidate.json", {
        "candidate_reference_id": "phase9-final-validation-candidate",
        "model_family": model_name,
        "imbalance_strategy": strategy,
        "preprocessing_strategy": PREPROCESSING[model_name][strategy],
        "best_hyperparameters": hyperparameters,
        "dataset_id": data.dataset_id,
        "dataset_fingerprint": data.dataset_fingerprint,
        "split_identifier": data.split_identifier,
        "selection_rationale": selection_rationale,
        "calibration": final_payload["calibration"],
        "threshold_policy": final_payload["threshold_policy"],
        "validation_metrics": validation_metrics,
        "calibration_validation": calibration_validation,
        "official_test_evaluated": False,
        "production_promoted": False,
    })

    feature_importance = extract_feature_importance(final_pipeline)
    final_candidate_row = {
        **selected,
        "default_validation_metrics": default_validation,
        "training_duration_seconds": training_duration,
        "inference_duration_seconds": inference_duration,
    }
    registry_payload = register_final_candidate(
        settings,
        data,
        "phase9-final-validation-candidate",
        final_candidate_row,
        search_rows,
        final_payload,
        output_dir,
        final_pipeline,
        validation_curves,
        feature_importance,
    )
    write_selection_report(output_dir, data, comparison_rows, search_summaries, final_payload, registry_payload)


def extract_feature_importance(pipeline: Any) -> list[dict[str, Any]]:
    preprocessor = pipeline.named_steps["preprocessor"]
    model = pipeline.named_steps["model"]
    names = [str(value) for value in preprocessor.get_feature_names_out()]
    if hasattr(model, "feature_importances_"):
        values = [float(value) for value in model.feature_importances_]
        kind = "feature_importance"
    elif hasattr(model, "coef_"):
        values = [abs(float(value)) for value in model.coef_[0]]
        kind = "absolute_coefficient"
    else:
        return []
    pairs = sorted(zip(names, values), key=lambda pair: pair[1], reverse=True)
    return [{"feature_name": name, "importance": value, "importance_type": kind} for name, value in pairs[:50]]


def write_selection_report(
    output_dir: Path,
    data: ValidationData,
    comparison_rows: list[dict[str, Any]],
    search_summaries: dict[str, Any],
    final_payload: dict[str, Any],
    registry_payload: dict[str, Any],
) -> None:
    selected = next(row for row in comparison_rows if row.get("selected"))
    lines = [
        "# APS Intelligence Phase 9 — Final Validation Candidate",
        "",
        "This is a controlled validation artifact, not an official APS test report, production approval, or literature review.",
        "",
        "## Scientific scope",
        "",
        f"- Training source: `aps_failure_training_set.csv` only.",
        f"- Dataset fingerprint: `{data.dataset_fingerprint}`.",
        f"- Outer split: 48,000 training / 12,000 validation, ratio `{VALIDATION_RATIO}`, seed `{SEED}`.",
        f"- Split identifier: `{data.split_identifier}`.",
        f"- Hyperparameter CV: `{CV_FOLDS}` stratified folds within the 48,000-record training partition.",
        f"- Search budget: `{SEARCH_BUDGET}` configurations per model family.",
        "- Official test CSV: not opened or used.",
        "",
        "## Completed comparison matrix",
        "",
        "| Model | Imbalance | Preprocessing | CV PR-AUC mean ± SD | Validation PR-AUC | Validation recall | Default cost | Min-cost threshold (validation exploratory) |",
        "|---|---|---|---:|---:|---:|---:|---:|",
    ]
    for row in sorted(comparison_rows, key=lambda item: item["validation_pr_auc"], reverse=True):
        marker = " **selected**" if row.get("selected") else ""
        lines.append(
            f"| {row['model_family']}{marker} | {row['imbalance_strategy']} | {row['preprocessing_strategy']} | "
            f"{row['cv_pr_auc_mean']:.4f} ± {row['cv_pr_auc_std']:.4f} | {row['validation_pr_auc']:.4f} | "
            f"{row['validation_recall']:.4f} | {row['validation_business_cost_default']:.1f} | {row['validation_min_cost_threshold']:.3f} |"
        )
    lines.extend([
        "",
        "The validation min-cost thresholds in the table are exploratory diagnostics. They were not used to choose the final candidate.",
        "",
        "## Preliminary audit conclusions",
        "",
        "- Earlier Phase 4 artifacts all use the verified training fingerprint and the same seed-42 80:20 split, but most used smoke-test search budgets of two trials and two folds.",
        "- Earlier artifacts do not provide a complete 4×3 final matrix or complete Phase 7 checksum evidence, so they were retained as exploratory baselines and not overwritten.",
        "- Phase 9 uses median imputation for Logistic Regression and Random Forest; native missing-value handling for XGBoost and CatBoost where no SMOTE is used; and median imputation before SMOTE because native missing-value handling is incompatible with SMOTE.",
        "- Class weights are computed from each fitting fold or the outer training partition only. SMOTE is inside the imbalanced-learn pipeline and is applied only to fitting data.",
        "",
        "## Final candidate",
        "",
        f"- Reference: `{selected['experiment_reference_id']}`.",
        f"- Model: `{selected['model_family']}`.",
        f"- Imbalance strategy: `{selected['imbalance_strategy']}`.",
        f"- Preprocessing: `{selected['preprocessing_strategy']}`.",
        f"- Hyperparameters: `{json.dumps(selected['best_hyperparameters'], sort_keys=True)}`.",
        f"- Calibration method: `{final_payload['calibration']['selected_method']}`.",
        f"- Threshold objective: `{final_payload['threshold_policy']['selected_objective']}`.",
        f"- Selected threshold: `{final_payload['threshold_policy']['selected_threshold']:.6f}`.",
        f"- Cost assumptions: FP=`{FP_COST}`, FN=`{FN_COST}`; illustrative only.",
        f"- Rationale: {final_payload['selection_rationale']}",
        "",
        "## Calibration and policy procedure",
        "",
        "OOF probabilities were generated from three training-partition folds. Calibration method comparison and threshold selection used only an internal OOF subset. The selected calibrator was then refit on all OOF probabilities and assessed once on the untouched 12,000-record validation partition.",
        "",
        "## Registry and integrity",
        "",
        f"- Lifecycle: `{registry_payload.get('lifecycle_status')}`.",
        "- Phase 9 status: `final_validation_candidate`.",
        "- Production promotion: not performed.",
        f"- Registry reproducible: `{registry_payload.get('reproducibility', {}).get('reproducible')}`.",
        f"- Artifact integrity: `{registry_payload.get('artifact_inventory', {}).get('artifact_integrity_status')}`.",
        "",
        "## Limitations",
        "",
        "- All reported performance is training-partition cross-validation or the fixed 12,000-record validation assessment.",
        "- Official APS test performance is unavailable because the official test CSV was intentionally not accessed.",
        "- Illustrative FP/FN costs are not operational Scania cost measurements.",
        "- The final candidate is not production-approved and must not be represented as official-test-validated.",
        "",
    ])
    (output_dir / "phase9_selection_report.md").write_text("\n".join(lines), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run leakage-safe APS Phase 9 validation using the training CSV only.")
    parser.add_argument("--mode", choices=("matrix", "final", "all"), default="matrix")
    parser.add_argument("--candidate", default=None, help="Candidate key such as random_forest__smote for --mode final/all.")
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/phase9/phase9-final-validation"))
    parser.add_argument("--database-url", default="sqlite:///./data/phase9_validation.db", help="Ignored local registry database used for Phase 9 lineage checks.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    settings = Settings(database_url=args.database_url)
    settings.ensure_storage_directories()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    data = load_training_data(settings)
    write_json(output_dir / "dataset_and_split.json", {
        "dataset_id": data.dataset_id,
        "dataset_fingerprint": data.dataset_fingerprint,
        "feature_count": len(data.feature_names),
        "training_records": len(data.training_frame),
        "validation_records": len(data.validation_frame),
        "training_class_counts": data.split_payload["training_class_counts"],
        "validation_class_counts": data.split_payload["validation_class_counts"],
        "split_identifier": data.split_identifier,
        "random_seed": SEED,
        "validation_ratio": VALIDATION_RATIO,
        "official_test_evaluated": False,
        "official_test_access_note": "The official test CSV was not opened by this runner.",
        "dependencies": dependency_versions(),
    })
    if args.mode in {"matrix", "all"}:
        comparison_rows, search_summaries, search_rows = run_comparison_matrix(settings, data, output_dir)
    else:
        comparison_rows = []
        search_summaries = json.loads((output_dir / "search_summaries.json").read_text(encoding="utf-8"))
        search_rows = []
        for model_name in MODEL_NAMES:
            payload = json.loads((output_dir / "search" / f"{model_name}-summary.json").read_text(encoding="utf-8"))
            search_rows.extend(payload["candidates"])
        comparison_path = output_dir / "model_comparison.csv"
        with comparison_path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                for field in ("best_hyperparameters",):
                    row[field] = json.loads(row[field])
                for field in ("cv_pr_auc_mean", "cv_pr_auc_std", "validation_pr_auc", "validation_roc_auc", "validation_precision", "validation_recall", "validation_f1", "validation_specificity", "validation_balanced_accuracy", "validation_business_cost_default", "validation_min_cost_threshold", "validation_min_cost", "validation_max_f1_threshold", "validation_max_f1", "training_duration_seconds", "inference_duration_seconds"):
                    row[field] = float(row[field]) if row[field] not in {"", "None"} else None
                for field in ("validation_true_negative", "validation_false_positive", "validation_false_negative", "validation_true_positive"):
                    row[field] = int(row[field])
                row["selected"] = row["selected"] == "True"
                comparison_rows.append(row)
    if args.mode in {"final", "all"}:
        candidate = args.candidate
        if not candidate:
            raise SystemExit("--candidate is required for --mode final/all after inspecting model_comparison.csv")
        finalize_candidate(settings, data, output_dir, comparison_rows, search_summaries, search_rows, candidate)
    print(json.dumps({
        "mode": args.mode,
        "output_dir": str(output_dir.resolve()),
        "comparison_rows": len(comparison_rows),
        "dataset_fingerprint": data.dataset_fingerprint,
        "split_identifier": data.split_identifier,
        "official_test_evaluated": False,
    }, indent=2))


if __name__ == "__main__":
    main()
