"""One-time official APS test evaluation for the frozen Phase 9 candidate.

The candidate audit runs before the test CSV is opened. This module never fits
the model, preprocessor, calibrator, or threshold policy and never writes back
to the Phase 9 registry record.
"""

from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import joblib
import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.database.session import create_database_engine, create_session_factory
from app.models.experiment import ExperimentRun
from app.models.registry import ModelPromotion
from app.services.dataset.ingestion import read_dataset
from app.services.reproducibility import dependency_versions
from scripts.phase9_validation import build_curve_data, metric_dict, probability_quality


CANDIDATE_ID = "phase9-final-validation-candidate"
EXPECTED_TEST_SHA256 = "2cdf6f7661c7b4c63333c93cdec36a3a82350176b604a2312cf82799fb2712f3"
FROZEN_THRESHOLD = 0.115
DEFAULT_THRESHOLD = 0.5
FP_COST = 1.0
FN_COST = 10.0
BOOTSTRAP_REPLICATES = 1000
BOOTSTRAP_SEED = 42


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, default=str), encoding="utf-8")


def candidate_audit(settings: Settings, output_dir: Path) -> tuple[dict[str, Any], Any, Any]:
    model_root = settings.model_artifact_dir / "experiments" / CANDIDATE_ID
    phase9_root = Path("artifacts/phase9/phase9-final-validation")
    metadata_path = model_root / "metadata.json"
    final_path = phase9_root / "final_candidate.json"
    calibration_path = phase9_root / "selected" / "calibration.json"
    calibrator_path = phase9_root / "selected" / "calibrator_isotonic.joblib"
    registry_path = phase9_root / "registry_verification.json"
    required_model_files = [
        "pipeline.joblib",
        "preprocessor.joblib",
        "metadata.json",
        "splits.json",
        "curves.json",
        "feature_importance.json",
        "confusion_matrix.svg",
    ]
    if not all((model_root / name).is_file() for name in required_model_files):
        raise RuntimeError("The frozen Phase 9 model artifact inventory is incomplete.")
    if not all(path.is_file() for path in (final_path, calibration_path, calibrator_path, registry_path)):
        raise RuntimeError("The frozen Phase 9 calibration or lineage evidence is incomplete.")

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    final_candidate = json.loads(final_path.read_text(encoding="utf-8"))
    calibration = json.loads(calibration_path.read_text(encoding="utf-8"))
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    pipeline = joblib.load(model_root / "pipeline.joblib")
    preprocessor = joblib.load(model_root / "preprocessor.joblib")
    calibrator = joblib.load(calibrator_path)

    configuration = metadata["configuration"]
    threshold = configuration["threshold_policy"]["selected_threshold"]
    model_config = configuration["hyperparameters"]
    model = pipeline.named_steps.get("model")
    fitted_preprocessor = pipeline.named_steps.get("preprocessor")
    if model is None or model.__class__.__name__ != "CatBoostClassifier":
        raise RuntimeError("The frozen pipeline does not contain the persisted CatBoost candidate.")
    if calibrator.__class__.__name__ != "IsotonicRegression":
        raise RuntimeError("The persisted calibration artifact is not isotonic regression.")
    if not hasattr(calibrator, "predict"):
        raise RuntimeError("The persisted calibrator cannot transform probabilities.")
    if fitted_preprocessor is None or fitted_preprocessor.__class__.__name__ != preprocessor.__class__.__name__:
        raise RuntimeError("The persisted preprocessor is incompatible with the fitted pipeline.")
    if threshold != FROZEN_THRESHOLD or final_candidate["threshold_policy"]["selected_threshold"] != FROZEN_THRESHOLD:
        raise RuntimeError("The frozen threshold does not match Phase 9 evidence.")
    if configuration["calibration"]["selected_method"] != "isotonic" or final_candidate["calibration"]["selected_method"] != "isotonic":
        raise RuntimeError("The frozen calibration method does not match Phase 9 evidence.")
    if configuration["dataset_fingerprint"] != final_candidate["dataset_fingerprint"]:
        raise RuntimeError("Candidate dataset fingerprints disagree.")
    if not registry["artifact_inventory"]["all_verified"] or not registry["reproducibility"]["reproducible"]:
        raise RuntimeError("Phase 9 registry integrity or reproducibility verification failed.")
    if registry["lifecycle_status"] != "evaluated" or registry["phase9_status"] != "final_validation_candidate":
        raise RuntimeError("The candidate lifecycle is not the frozen non-production status.")
    if registry["promotion"] != "not performed" or registry["official_test_evaluated"]:
        raise RuntimeError("The frozen candidate has already been promoted or test-evaluated.")

    engine = create_database_engine(settings)
    session_factory = create_session_factory(engine)
    session = session_factory()
    run = session.get(ExperimentRun, CANDIDATE_ID)
    promotions = list(session.query(ModelPromotion).all())
    session.close()
    engine.dispose()
    if run is None or run.registry_status != "evaluated":
        raise RuntimeError("The Phase 9 registry candidate row is missing or has an invalid lifecycle.")
    if any(promotion.status == "active" for promotion in promotions):
        raise RuntimeError("An active production promotion exists; the frozen candidate audit is blocked.")

    recorded_checksums = {
        item["logical_name"]: item["stored_checksum"]
        for item in registry["artifact_inventory"]["items"]
    }
    logical_to_file = {
        "pipeline": "pipeline.joblib",
        "preprocessor": "preprocessor.joblib",
        "metadata": "metadata.json",
        "splits": "splits.json",
        "curves": "curves.json",
        "feature_importance": "feature_importance.json",
        "confusion_matrix": "confusion_matrix.svg",
    }
    actual_checksums = {
        logical_name: sha256_file(model_root / file_name)
        for logical_name, file_name in logical_to_file.items()
    }
    checksum_results = {
        logical_name: {
            "file_name": logical_to_file[logical_name],
            "actual_sha256": actual_checksums[logical_name],
            "recorded_sha256": recorded_checksums.get(logical_name),
            "verified": actual_checksums[logical_name] == recorded_checksums.get(logical_name),
        }
        for logical_name in logical_to_file
    }
    if not all(item["verified"] for item in checksum_results.values()):
        raise RuntimeError("A frozen Phase 9 model artifact checksum does not match.")

    audit = {
        "audit_timestamp_utc": utc_now(),
        "candidate_id": CANDIDATE_ID,
        "candidate_artifact_directory": str(model_root),
        "model": {
            "class": model.__class__.__name__,
            "hyperparameters": model_config,
            "pipeline_steps": list(pipeline.named_steps),
            "preprocessor_class": preprocessor.__class__.__name__,
            "feature_names": [str(name) for name in getattr(preprocessor, "feature_names_in_", [])],
        },
        "calibration": {
            "method": "isotonic",
            "artifact_path": str(calibrator_path),
            "artifact_sha256": sha256_file(calibrator_path),
            "phase9_checksum_status": "no prior Phase 9 calibrator checksum was persisted; checksum computed during this pre-evaluation audit",
            "fit_scope": calibration["fit_scope"],
            "internal_method_comparison_is_independent_of_calibrator_fit": True,
            "external_validation_comparison_available": "external_validation_comparison" in calibration,
        },
        "frozen_policy": {
            "threshold": FROZEN_THRESHOLD,
            "objective": configuration["threshold_policy"]["selected_objective"],
            "false_positive_cost": FP_COST,
            "false_negative_cost": FN_COST,
        },
        "dataset_lineage": {
            "training_dataset_id": configuration["dataset_id"],
            "training_dataset_fingerprint": configuration["dataset_fingerprint"],
            "split_identifier": final_candidate["split_identifier"],
            "phase9_official_test_evaluated": False,
        },
        "registry": {
            "lifecycle_status": registry["lifecycle_status"],
            "phase9_status": registry["phase9_status"],
            "artifact_integrity": registry["artifact_inventory"]["artifact_integrity_status"],
            "reproducible": registry["reproducibility"]["reproducible"],
            "active_promotions": [],
        },
        "dependency_versions": dependency_versions(),
        "artifact_checksums": checksum_results,
        "audit_passed_before_test_access": True,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / "pre_evaluation_audit.json", audit)
    return audit, pipeline, calibrator


def bootstrap_confidence_intervals(
    truth: np.ndarray,
    probabilities: np.ndarray,
    threshold: float,
    *,
    replicates: int = BOOTSTRAP_REPLICATES,
    seed: int = BOOTSTRAP_SEED,
) -> dict[str, Any]:
    rng = np.random.default_rng(seed)
    negative_indices = np.flatnonzero(truth == 0)
    positive_indices = np.flatnonzero(truth == 1)
    values = {name: [] for name in ("pr_auc", "roc_auc", "precision", "recall", "f1_score")}
    for _ in range(replicates):
        sample_indices = np.concatenate(
            [
                rng.choice(negative_indices, size=len(negative_indices), replace=True),
                rng.choice(positive_indices, size=len(positive_indices), replace=True),
            ]
        )
        sample_truth = truth[sample_indices]
        sample_probabilities = probabilities[sample_indices]
        metrics = metric_dict(sample_truth, sample_probabilities, threshold)
        for name in values:
            values[name].append(float(metrics[name]))
    return {
        "method": "stratified percentile bootstrap",
        "replicates": replicates,
        "seed": seed,
        "strata": {"negative": len(negative_indices), "positive": len(positive_indices)},
        "confidence_level": 0.95,
        "intervals": {
            name: {
                "lower": float(np.percentile(scores, 2.5)),
                "upper": float(np.percentile(scores, 97.5)),
            }
            for name, scores in values.items()
        },
        "limitations": "Intervals reflect resampling uncertainty conditional on this fixed test sample and frozen policy; they do not represent external fleet uncertainty.",
    }


def metric_comparison_row(name: str, metrics: dict[str, Any], threshold: float) -> dict[str, Any]:
    return {
        "policy": name,
        "threshold": threshold,
        "pr_auc": metrics["pr_auc"],
        "roc_auc": metrics["roc_auc"],
        "precision": metrics["precision"],
        "recall": metrics["recall"],
        "f1_score": metrics["f1_score"],
        "specificity": metrics["specificity"],
        "balanced_accuracy": metrics["balanced_accuracy"],
        "accuracy_secondary": metrics["accuracy"],
        "true_negative": metrics["true_negative"],
        "false_positive": metrics["false_positive"],
        "false_negative": metrics["false_negative"],
        "true_positive": metrics["true_positive"],
        "illustrative_business_cost": metrics["estimated_business_cost"],
    }


def write_predictions(path: Path, truth: np.ndarray, raw: np.ndarray, calibrated: np.ndarray) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["row_number", "actual_label", "raw_probability", "calibrated_probability", "predicted_class"])
        writer.writeheader()
        for index, (actual, raw_probability, calibrated_probability) in enumerate(zip(truth, raw, calibrated), start=1):
            writer.writerow({
                "row_number": index,
                "actual_label": "pos" if actual else "neg",
                "raw_probability": float(raw_probability),
                "calibrated_probability": float(calibrated_probability),
                "predicted_class": "pos" if calibrated_probability >= FROZEN_THRESHOLD else "neg",
            })


def write_report(
    path: Path,
    audit: dict[str, Any],
    test_info: dict[str, Any],
    primary: dict[str, Any],
    diagnostic: dict[str, Any],
    intervals: dict[str, Any],
    calibration: dict[str, Any],
) -> None:
    validation = json.loads(Path("artifacts/phase9/phase9-final-validation/final_candidate.json").read_text(encoding="utf-8"))
    lines = [
        "# APS Intelligence Phase 10 — Official Test Evaluation",
        "",
        "This is the one-time official test evaluation of the frozen Phase 9 candidate. No fitting, retuning, recalibration, threshold adjustment, or model selection was performed.",
        "",
        "## Candidate and test integrity",
        "",
        f"- Candidate: `{CANDIDATE_ID}`.",
        f"- Model: `{audit['model']['class']}`; frozen calibration: isotonic; frozen threshold: `{FROZEN_THRESHOLD}`.",
        f"- Test file SHA-256: `{test_info['sha256']}`; expected hash matched: `{test_info['sha256_matches_expected']}`.",
        f"- Test records: `{test_info['record_count']}`; labels: `{test_info['class_counts']}`.",
        f"- Candidate artifact integrity: `{audit['registry']['artifact_integrity']}`; reproducible: `{audit['registry']['reproducible']}`.",
        "",
        "## Primary frozen calibrated policy",
        "",
        f"- Threshold: `{FROZEN_THRESHOLD}`.",
        f"- PR-AUC: `{primary['pr_auc']:.6f}`; ROC-AUC: `{primary['roc_auc']:.6f}`.",
        f"- Precision: `{primary['precision']:.6f}`; recall: `{primary['recall']:.6f}`; F1: `{primary['f1_score']:.6f}`.",
        f"- Specificity: `{primary['specificity']:.6f}`; balanced accuracy: `{primary['balanced_accuracy']:.6f}`; accuracy secondary: `{primary['accuracy']:.6f}`.",
        f"- Confusion matrix TN/FP/FN/TP: `{primary['true_negative']}/{primary['false_positive']}/{primary['false_negative']}/{primary['true_positive']}`.",
        f"- Illustrative cost: `{primary['estimated_business_cost']:.1f}` using FP=1 and FN=10; not operational Scania cost.",
        "",
        "## Predeclared diagnostic comparison",
        "",
        "| Policy | Threshold | PR-AUC | Precision | Recall | F1 | TN/FP/FN/TP | Illustrative cost |",
        "|---|---:|---:|---:|---:|---:|---|---:|",
        f"| Frozen calibrated | {FROZEN_THRESHOLD:.3f} | {primary['pr_auc']:.6f} | {primary['precision']:.6f} | {primary['recall']:.6f} | {primary['f1_score']:.6f} | {primary['true_negative']}/{primary['false_positive']}/{primary['false_negative']}/{primary['true_positive']} | {primary['estimated_business_cost']:.1f} |",
        f"| Uncalibrated diagnostic | {DEFAULT_THRESHOLD:.3f} | {diagnostic['pr_auc']:.6f} | {diagnostic['precision']:.6f} | {diagnostic['recall']:.6f} | {diagnostic['f1_score']:.6f} | {diagnostic['true_negative']}/{diagnostic['false_positive']}/{diagnostic['false_negative']}/{diagnostic['true_positive']} | {diagnostic['estimated_business_cost']:.1f} |",
        "",
        "The diagnostic row was predeclared and was not used to change the frozen policy.",
        "",
        "## Confidence intervals",
        "",
        f"Stratified percentile bootstrap with `{intervals['replicates']}` replicates and seed `{intervals['seed']}`.",
        "",
    ]
    for metric, interval in intervals["intervals"].items():
        lines.append(f"- {metric}: `{interval['lower']:.6f}` to `{interval['upper']:.6f}` (95%).")
    lines.extend([
        "",
        "## Calibration",
        "",
        f"- Brier score: `{calibration['brier_score']:.6f}`.",
        f"- Log loss: `{calibration['log_loss']:.6f}`.",
        f"- ECE: `{calibration['expected_calibration_error']:.6f}`.",
        "- These values are official-test calibration results. Phase 9 OOF and validation calibration values remain separately recorded.",
        "",
        "## Validation versus official test",
        "",
        f"- Phase 9 frozen-policy validation PR-AUC: `{validation['validation_metrics']['calibrated_internal_min_cost_threshold']['pr_auc']:.6f}`.",
        f"- Phase 10 frozen-policy official-test PR-AUC: `{primary['pr_auc']:.6f}`.",
        f"- Phase 9 frozen-policy validation recall: `{validation['validation_metrics']['calibrated_internal_min_cost_threshold']['recall']:.6f}`.",
        f"- Phase 10 frozen-policy official-test recall: `{primary['recall']:.6f}`.",
        "Earlier Phase 3/4 results were exploratory validation-only evidence: examples included Random Forest/original PR-AUC 0.877629, XGBoost/class-weight PR-AUC 0.843751, and CatBoost/class-weight PR-AUC 0.709412, produced with smoke-test search budgets. They are not official-test results and are not merged into the Phase 10 ranking.",
        "Phase 9 replaced those exploratory comparisons with a complete 4x3 matrix and froze this CatBoost/class-weight candidate before test access. Phase 10 now reports the first official-test measurement of that unchanged candidate and policy.",
        "",
        "## Scientific interpretation and limitations",
        "",
        "The official test result measures generalization of one frozen model and policy. It cannot be used to justify retuning or a different candidate. Severe class imbalance makes accuracy secondary and makes precision/recall and the confusion matrix more informative. The FP/FN cost is illustrative model-selection metadata, not a measured fleet operating cost. Test calibration is assessed on this finite sample and does not establish fleet-level probability reliability or production readiness.",
        "",
        "No production promotion was performed. Frontend and deployment work were not started.",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the frozen Phase 9 candidate once on the official APS test CSV.")
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/phase10/official-test-evaluation"))
    args = parser.parse_args()
    output_dir = args.output_dir
    if output_dir.exists() and any(output_dir.iterdir()):
        raise SystemExit(f"Refusing to overwrite existing Phase 10 output directory: {output_dir}")
    output_dir.mkdir(parents=True, exist_ok=True)

    settings = Settings(database_url="sqlite:///./data/phase9_validation.db")
    audit, pipeline, calibrator = candidate_audit(settings, output_dir)

    # This is the first point in the script where the official test CSV is
    # opened. All candidate checks above must pass before this statement.
    test_path = settings.raw_dataset_dir / settings.official_test_dataset_filename
    test_hash = sha256_file(test_path)
    test = read_dataset(
        test_path,
        dataset_type="testing",
        target_column=settings.target_column,
        expected_feature_count=settings.expected_feature_count,
    )
    test_frame = test.frame
    feature_names = list(test.feature_columns)
    if test.info.fingerprint != EXPECTED_TEST_SHA256:
        raise RuntimeError("The official test file hash does not match the previously verified hash.")
    if len(test_frame) != 16_000 or len(feature_names) != 170:
        raise RuntimeError("The official test shape does not match the verified contract.")
    class_counts = {str(key): int(value) for key, value in test_frame[settings.target_column].value_counts().items()}
    if class_counts != {"neg": 15_625, "pos": 375}:
        raise RuntimeError(f"The official test class counts changed: {class_counts}")

    test_x = test_frame[feature_names]
    truth = test_frame[settings.target_column].map({"neg": 0, "pos": 1}).astype(int).to_numpy()
    raw_probabilities = np.asarray(pipeline.predict_proba(test_x)[:, 1], dtype=float)
    calibrated_probabilities = np.asarray(calibrator.predict(raw_probabilities), dtype=float)
    if np.any(~np.isfinite(raw_probabilities)) or np.any(~np.isfinite(calibrated_probabilities)):
        raise RuntimeError("Frozen candidate produced non-finite official-test probabilities.")
    if np.any((raw_probabilities < 0) | (raw_probabilities > 1)) or np.any((calibrated_probabilities < 0) | (calibrated_probabilities > 1)):
        raise RuntimeError("Frozen candidate produced probabilities outside [0, 1].")

    primary = metric_dict(truth, calibrated_probabilities, FROZEN_THRESHOLD)
    diagnostic = metric_dict(truth, raw_probabilities, DEFAULT_THRESHOLD)
    calibration_metrics = probability_quality(truth, calibrated_probabilities)
    intervals = bootstrap_confidence_intervals(truth, calibrated_probabilities, FROZEN_THRESHOLD)
    comparison = [
        metric_comparison_row("calibrated_frozen_threshold_0.115", primary, FROZEN_THRESHOLD),
        metric_comparison_row("uncalibrated_default_threshold_0.5_diagnostic", diagnostic, DEFAULT_THRESHOLD),
    ]
    test_info = {
        "path": str(test_path),
        "sha256": test_hash,
        "expected_sha256": EXPECTED_TEST_SHA256,
        "sha256_matches_expected": test_hash == EXPECTED_TEST_SHA256,
        "record_count": len(test_frame),
        "feature_count": len(feature_names),
        "target_column": settings.target_column,
        "class_counts": class_counts,
        "feature_schema_matches_training_candidate": feature_names == audit["model"]["feature_names"],
        "official_test_accessed_after_audit": True,
    }
    if not test_info["feature_schema_matches_training_candidate"]:
        raise RuntimeError("Official test feature ordering does not match the frozen pipeline schema.")

    write_json(output_dir / "official_test_metrics.json", {
        "evaluation_id": "phase10-official-test-evaluation",
        "candidate_id": CANDIDATE_ID,
        "evaluation_scope": "official_test",
        "frozen_threshold": FROZEN_THRESHOLD,
        "primary_policy": primary,
        "diagnostic_policy": diagnostic,
        "confidence_intervals": intervals,
        "official_test_evaluated": True,
        "retraining_performed": False,
        "calibration_refit": False,
        "threshold_changed": False,
    })
    write_json(output_dir / "official_test_confusion_matrix.json", {
        "primary_calibrated_frozen": primary["confusion_matrix"],
        "diagnostic_uncalibrated_default": diagnostic["confusion_matrix"],
    })
    with (output_dir / "official_test_comparison.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(comparison[0]))
        writer.writeheader()
        writer.writerows(comparison)
    write_json(output_dir / "official_test_calibration.json", {
        "evaluation_scope": "official_test",
        "candidate_id": CANDIDATE_ID,
        "calibration_method": "isotonic",
        **calibration_metrics,
    })
    write_json(output_dir / "official_test_reliability.json", {
        "evaluation_scope": "official_test",
        "calibration_method": "isotonic",
        "reliability_curve": calibration_metrics["reliability_curve"],
        "expected_calibration_error": calibration_metrics["expected_calibration_error"],
    })
    write_json(output_dir / "official_test_pr_curve.json", build_curve_data(truth.tolist(), calibrated_probabilities.tolist())["precision_recall"])
    write_json(output_dir / "official_test_roc_curve.json", build_curve_data(truth.tolist(), calibrated_probabilities.tolist())["roc"])
    write_predictions(output_dir / "official_test_predictions.csv", truth, raw_probabilities, calibrated_probabilities)
    write_report(output_dir / "official_test_report.md", audit, test_info, primary, diagnostic, intervals, calibration_metrics)

    output_hashes = {
        str(path.relative_to(output_dir)): sha256_file(path)
        for path in output_dir.iterdir()
        if path.is_file()
    }
    integrity = {
        "evaluation_id": "phase10-official-test-evaluation",
        "candidate_id": CANDIDATE_ID,
        "pre_evaluation_audit": audit,
        "official_test": test_info,
        "output_artifact_sha256": output_hashes,
        "prediction_count": len(truth),
        "label_reconciliation_passed": class_counts == {"neg": 15_625, "pos": 375},
        "official_test_evaluated": True,
        "model_retrained": False,
        "preprocessor_refit": False,
        "calibrator_refit": False,
        "threshold_changed": False,
        "promotion_performed": False,
    }
    write_json(output_dir / "official_test_integrity.json", integrity)
    print(json.dumps({
        "output_dir": str(output_dir.resolve()),
        "candidate_id": CANDIDATE_ID,
        "records_evaluated": len(truth),
        "class_counts": class_counts,
        "primary_pr_auc": primary["pr_auc"],
        "primary_roc_auc": primary["roc_auc"],
        "primary_threshold": FROZEN_THRESHOLD,
        "official_test_evaluated": True,
    }, indent=2))


if __name__ == "__main__":
    main()
