"""Phase 5 orchestration for validation-only threshold and calibration analysis."""

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.exceptions import InvalidRequestError, ResourceNotFoundError
from app.models.experiment import ExperimentRun
from app.models.training import ModelTrainingRun
from app.schemas.phase5 import (
    CalibrationComparisonRequest,
    CalibrationComparisonResponse,
    CalibrationMethod,
    CalibrationMethodResult,
    CalibrationMetricsResponse,
    DecisionPolicyComparisonRequest,
    DecisionPolicyComparisonResponse,
    DecisionPolicyRow,
    Phase5ArtifactReferences,
    Phase5Reference,
    ThresholdAnalysisResponse,
    ThresholdOptimizationRequest,
    ThresholdPoint,
    ThresholdPolicyCompareRequest,
    ThresholdPolicyComparisonResponse,
)
from app.services.dataset.service import DatasetService
from app.services.dataset.splitting import prepare_training_validation_splits
from app.services.model_training.artifacts import (
    load_joblib,
    load_json,
    phase5_artifact_paths,
    save_joblib,
    save_json,
)
from app.services.probability_calibration import CalibrationFit, fit_calibration_methods
from app.services.threshold_optimization import evaluate_threshold_point, optimize_thresholds


@dataclass(frozen=True)
class Phase5Context:
    reference: Phase5Reference
    base_estimator: Any
    training_x: pd.DataFrame
    training_y: np.ndarray
    validation_x: pd.DataFrame
    validation_y: np.ndarray


def _phase5_artifacts(settings: Settings, reference_id: str) -> Phase5ArtifactReferences:
    paths = phase5_artifact_paths(settings.report_storage_dir, reference_id)
    return Phase5ArtifactReferences(
        directory_key=f"phase5/{reference_id}",
        thresholds="thresholds.json",
        threshold_policy_comparisons="threshold_policy_comparisons.json",
        calibration="calibration.json",
        decision_policies="decision_policies.json",
        visualizations={
            "threshold_precision_recall": paths.threshold_precision_recall_visualization.name,
            "threshold_metrics": paths.threshold_metrics_visualization.name,
            "threshold_business_cost": paths.threshold_cost_visualization.name,
            "threshold_precision_recall_tradeoff": paths.threshold_tradeoff_visualization.name,
            "threshold_selected_confusion_matrix": paths.threshold_confusion_visualization.name,
            "calibration_reliability": paths.calibration_reliability_visualization.name,
        },
    )


def _make_binary_target(values: Any) -> np.ndarray:
    return values.map(lambda value: 0 if value == "neg" else 1).astype(int).to_numpy()


class Phase5Service:
    """Load completed Phase 3/4 artifacts and analyze only their validation split."""

    def __init__(self, settings: Settings, session: Session) -> None:
        self.settings = settings
        self.session = session
        self.datasets = DatasetService(settings, session)

    def _resolve_context(self, reference_id: str) -> Phase5Context:
        experiment = self.session.get(ExperimentRun, reference_id)
        training_run = None if experiment is not None else self.session.get(ModelTrainingRun, reference_id)
        if experiment is None and training_run is None:
            raise ResourceNotFoundError(f"Experiment or training run '{reference_id}' was not found.")
        run: ExperimentRun | ModelTrainingRun = experiment or training_run  # type: ignore[assignment]
        if run.status != "completed":
            raise InvalidRequestError(f"Artifacts for '{reference_id}' are available only after completion.")

        artifact_path = Path(run.pipeline_artifact_path) if isinstance(run, ExperimentRun) else Path(run.model_artifact_path)
        if not artifact_path.is_file():
            raise InvalidRequestError("The completed run is missing its model prediction artifact.")
        if isinstance(run, ModelTrainingRun) and not Path(run.preprocessor_artifact_path).is_file():
            raise InvalidRequestError("The completed training run is missing its preprocessing artifact.")

        # This call deliberately syncs and loads only the configured training
        # file. It never invokes the official testing path.
        self.datasets.sync_configured_datasets(include_testing=False)
        metadata = self.datasets.get_metadata(run.dataset_id, sync=False)
        if metadata.dataset_type != "training":
            raise InvalidRequestError("The official APS test dataset is isolated from Phase 5 analysis.")
        if metadata.fingerprint != run.dataset_fingerprint:
            raise InvalidRequestError("The dataset fingerprint changed after the run completed; analysis was rejected.")
        _, ingested = self.datasets.load(run.dataset_id, sync=False)
        prepared = prepare_training_validation_splits(
            ingested.frame,
            target_column=ingested.target_column,
            dataset_id=metadata.dataset_id,
            validation_ratio=run.validation_ratio,
            random_seed=run.random_seed,
        )
        features = list(ingested.feature_columns)
        training_x = pd.DataFrame(prepared.training[features])
        validation_x = pd.DataFrame(prepared.validation[features])
        training_y = _make_binary_target(prepared.training[ingested.target_column])
        validation_y = _make_binary_target(prepared.validation[ingested.target_column])

        try:
            if isinstance(run, ExperimentRun):
                base_estimator = load_joblib(artifact_path)
                reference_type = "experiment"
                imbalance_strategy = run.imbalance_strategy
                preprocessing_strategy = run.preprocessing_strategy
                model_version = run.model_version
            else:
                model = load_joblib(artifact_path)
                preprocessor = load_joblib(Path(run.preprocessor_artifact_path))
                base_estimator = Pipeline([("preprocessor", preprocessor), ("model", model)])
                reference_type = "training_run"
                imbalance_strategy = None
                preprocessing_configuration = json.loads(run.preprocessing_configuration_json)
                preprocessing_strategy = preprocessing_configuration.get("strategy")
                model_version = run.model_version
            # Fail early with a clear artifact error before writing any report.
            base_estimator.predict_proba(validation_x)
        except (OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
            raise InvalidRequestError(f"The model or preprocessing artifact could not produce validation probabilities: {exc}") from exc

        split_identifier = "|".join(summary.fingerprint for summary in prepared.summaries)
        reference = Phase5Reference(
            reference_id=reference_id,
            reference_type=reference_type,  # type: ignore[arg-type]
            model_name=run.model_name,
            model_version=model_version,
            imbalance_strategy=imbalance_strategy,
            preprocessing_strategy=preprocessing_strategy,
            dataset_id=metadata.dataset_id,
            dataset_fingerprint=metadata.fingerprint,
            validation_ratio=run.validation_ratio,
            random_seed=run.random_seed,
            validation_records=len(validation_x),
            split_identifier=split_identifier,
        )
        return Phase5Context(reference, base_estimator, training_x, training_y, validation_x, validation_y)

    def _probabilities(self, context: Phase5Context, estimator: Any | None = None) -> np.ndarray:
        source = estimator or context.base_estimator
        probabilities = np.asarray(source.predict_proba(context.validation_x)[:, 1], dtype=float)
        if len(probabilities) != context.reference.validation_records or np.any(~np.isfinite(probabilities)):
            raise InvalidRequestError("The prediction artifact returned invalid validation probabilities.")
        if np.any((probabilities < 0.0) | (probabilities > 1.0)):
            raise InvalidRequestError("The prediction artifact returned probabilities outside [0, 1].")
        return probabilities

    def _resolved_costs(self, false_positive_cost: float | None, false_negative_cost: float | None) -> tuple[float, float]:
        fp = self.settings.false_positive_cost if false_positive_cost is None else false_positive_cost
        fn = self.settings.false_negative_cost if false_negative_cost is None else false_negative_cost
        if fp < 0 or fn < 0:
            raise InvalidRequestError("false_positive_cost and false_negative_cost must be non-negative.")
        return float(fp), float(fn)

    def threshold_analysis(self, reference_id: str, request: ThresholdOptimizationRequest) -> ThresholdAnalysisResponse:
        context = self._resolve_context(reference_id)
        false_positive_cost, false_negative_cost = self._resolved_costs(request.false_positive_cost, request.false_negative_cost)
        probabilities = self._probabilities(context)
        candidates, selected = optimize_thresholds(
            context.validation_y,
            probabilities,
            request,
            false_positive_cost=false_positive_cost,
            false_negative_cost=false_negative_cost,
        )
        default_point = evaluate_threshold_point(
            context.validation_y,
            probabilities,
            request.default_threshold,
            false_positive_cost=false_positive_cost,
            false_negative_cost=false_negative_cost,
        )
        response = ThresholdAnalysisResponse(
            reference=context.reference,
            default_threshold=default_point,
            selected=selected,
            candidates=candidates,
            objective=request.objective,
            objective_parameters=selected.objective_parameters,
            false_positive_cost=false_positive_cost,
            false_negative_cost=false_negative_cost,
            configuration=request.model_dump(mode="json"),
            validation_selection_note=(
                "Threshold selection used validation predictions and labels only. "
                "The selected validation result may be optimistic; freeze the policy before a later official-test evaluation."
            ),
            artifacts=_phase5_artifacts(self.settings, reference_id),
        )
        self._save_threshold_artifacts(response)
        return response

    def _save_threshold_artifacts(self, response: ThresholdAnalysisResponse) -> None:
        paths = phase5_artifact_paths(self.settings.report_storage_dir, response.reference.reference_id)
        save_json(response.model_dump(mode="json"), paths.thresholds)
        self._plot_threshold_artifacts(response, paths)

    @staticmethod
    def _plot_threshold_artifacts(response: ThresholdAnalysisResponse, paths: Any) -> None:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        paths.directory.mkdir(parents=True, exist_ok=True)
        thresholds = [point.threshold for point in response.candidates]
        precision = [point.precision for point in response.candidates]
        recall = [point.recall for point in response.candidates]
        f1 = [point.f1_score for point in response.candidates]
        cost = [point.business_cost for point in response.candidates]

        figure, axis = plt.subplots(figsize=(7, 4))
        axis.plot(thresholds, precision, label="Precision")
        axis.plot(thresholds, recall, label="Recall")
        axis.axvline(response.selected.threshold, color="black", linestyle="--", label="Selected")
        axis.set(xlabel="Threshold", ylabel="Score", title="Validation precision and recall by threshold")
        axis.legend()
        figure.tight_layout()
        figure.savefig(paths.threshold_precision_recall_visualization, format="svg")
        plt.close(figure)

        figure, axis = plt.subplots(figsize=(7, 4))
        axis.plot(thresholds, f1, color="tab:purple")
        axis.axvline(response.selected.threshold, color="black", linestyle="--")
        axis.set(xlabel="Threshold", ylabel="F1-score", title="Validation F1-score by threshold")
        figure.tight_layout()
        figure.savefig(paths.threshold_metrics_visualization, format="svg")
        plt.close(figure)

        figure, axis = plt.subplots(figsize=(7, 4))
        axis.plot(thresholds, cost, color="tab:red")
        axis.axvline(response.selected.threshold, color="black", linestyle="--")
        axis.set(xlabel="Threshold", ylabel="Expected business cost", title="Validation business cost by threshold")
        figure.tight_layout()
        figure.savefig(paths.threshold_cost_visualization, format="svg")
        plt.close(figure)

        figure, axis = plt.subplots(figsize=(5, 4))
        axis.plot(recall, precision, color="tab:green")
        axis.scatter([response.selected.recall], [response.selected.precision], color="black", label="Selected")
        axis.set(xlabel="Recall", ylabel="Precision", title="Validation precision-recall trade-off")
        axis.legend()
        figure.tight_layout()
        figure.savefig(paths.threshold_tradeoff_visualization, format="svg")
        plt.close(figure)

        matrix = [[response.selected.true_negative, response.selected.false_positive], [response.selected.false_negative, response.selected.true_positive]]
        figure, axis = plt.subplots(figsize=(4, 4))
        image = axis.imshow(matrix, cmap="Blues")
        figure.colorbar(image, ax=axis)
        axis.set(xticks=[0, 1], yticks=[0, 1], xticklabels=["neg", "pos"], yticklabels=["neg", "pos"], xlabel="Predicted", ylabel="Actual", title="Selected validation threshold")
        for row in range(2):
            for column in range(2):
                axis.text(column, row, str(matrix[row][column]), ha="center", va="center")
        figure.tight_layout()
        figure.savefig(paths.threshold_confusion_visualization, format="svg")
        plt.close(figure)

    def get_threshold_analysis(self, reference_id: str) -> ThresholdAnalysisResponse:
        self._resolve_context(reference_id)
        path = phase5_artifact_paths(self.settings.report_storage_dir, reference_id).thresholds
        if not path.is_file():
            raise ResourceNotFoundError(f"No threshold analysis artifact exists for '{reference_id}'.")
        return ThresholdAnalysisResponse.model_validate(load_json(path))

    def _fit_calibration(self, context: Phase5Context, request: CalibrationComparisonRequest) -> list[CalibrationFit]:
        seed = context.reference.random_seed if request.random_seed is None else request.random_seed
        return fit_calibration_methods(
            context.base_estimator,
            context.training_x,
            context.training_y,
            context.validation_x,
            context.validation_y,
            methods=request.methods,
            calibration_ratio=request.calibration_ratio,
            random_seed=seed,
            minimum_calibration_records=request.minimum_calibration_records,
            minimum_calibration_positives=request.minimum_calibration_positives,
            minimum_calibration_negatives=request.minimum_calibration_negatives,
            reliability_bins=request.reliability_bins,
        )

    def calibration_comparison(self, reference_id: str, request: CalibrationComparisonRequest) -> CalibrationComparisonResponse:
        context = self._resolve_context(reference_id)
        fits = self._fit_calibration(context, request)
        paths = phase5_artifact_paths(self.settings.report_storage_dir, reference_id)
        paths.directory.mkdir(parents=True, exist_ok=True)
        results: list[CalibrationMethodResult] = []
        for fit in fits:
            result = fit.result
            if fit.calibrator is not None and result.status == "completed":
                artifact_name = f"calibrator_{result.method}.joblib"
                save_joblib(fit.calibrator, paths.directory / artifact_name)
                result = result.model_copy(update={"artifact_reference": artifact_name})
            results.append(result)
        response = CalibrationComparisonResponse(
            reference=context.reference,
            methods=results,
            calibration_fit_scope="Internal calibration split derived exclusively from the training partition; validation labels were not used for fitting.",
            validation_evaluation_scope="Validation split only; the official APS test dataset was not loaded.",
            ranking_metric_note="PR-AUC and ROC-AUC measure ranking; Brier score, log loss and the reliability curve measure probability quality. Calibration is not assumed to improve ranking. Expected calibration error uses uniform-width [0, 1] bins and weights each non-empty bin by its validation sample share.",
            configuration=request.model_dump(mode="json"),
            artifacts=_phase5_artifacts(self.settings, reference_id),
        )
        save_json(response.model_dump(mode="json"), paths.calibration)
        self._plot_reliability(response, paths)
        return response

    @staticmethod
    def _plot_reliability(response: CalibrationComparisonResponse, paths: Any) -> None:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        figure, axis = plt.subplots(figsize=(6, 5))
        axis.plot([0, 1], [0, 1], linestyle="--", color="grey", label="Perfect calibration")
        for method in response.methods:
            if method.status != "completed" or not method.reliability_curve:
                continue
            axis.plot(
                [point.predicted_probability for point in method.reliability_curve],
                [point.observed_failure_rate for point in method.reliability_curve],
                marker="o",
                label=method.method,
            )
        axis.set(xlabel="Mean predicted probability", ylabel="Observed failure rate", title="Validation reliability diagram")
        axis.legend()
        figure.tight_layout()
        figure.savefig(paths.calibration_reliability_visualization, format="svg")
        plt.close(figure)

    def get_calibration_comparison(self, reference_id: str) -> CalibrationComparisonResponse:
        self._resolve_context(reference_id)
        path = phase5_artifact_paths(self.settings.report_storage_dir, reference_id).calibration
        if not path.is_file():
            raise ResourceNotFoundError(f"No calibration comparison artifact exists for '{reference_id}'.")
        return CalibrationComparisonResponse.model_validate(load_json(path))

    def get_calibration_metrics(self, reference_id: str) -> CalibrationMetricsResponse:
        comparison = self.get_calibration_comparison(reference_id)
        return CalibrationMetricsResponse(reference=comparison.reference, methods=comparison.methods)

    def threshold_policy_comparison(self, reference_id: str, request: ThresholdPolicyCompareRequest) -> ThresholdPolicyComparisonResponse:
        context = self._resolve_context(reference_id)
        false_positive_cost, false_negative_cost = self._resolved_costs(request.false_positive_cost, request.false_negative_cost)
        probabilities = self._probabilities(context)
        if request.calibration_method != "uncalibrated":
            calibration_request = CalibrationComparisonRequest(methods=[request.calibration_method])
            fits = self._fit_calibration(context, calibration_request)
            fit = next(item for item in fits if item.result.method == request.calibration_method)
            if fit.result.status != "completed" or fit.calibrator is None:
                raise InvalidRequestError(f"Calibration method '{request.calibration_method}' is not available: {fit.result.reason}")
            probabilities = fit.probabilities
        rows = [
            evaluate_threshold_point(
                context.validation_y,
                probabilities,
                threshold,
                false_positive_cost=false_positive_cost,
                false_negative_cost=false_negative_cost,
            )
            for threshold in request.thresholds
        ]
        response = ThresholdPolicyComparisonResponse(
            reference=context.reference,
            calibration_method=request.calibration_method,
            false_positive_cost=false_positive_cost,
            false_negative_cost=false_negative_cost,
            configuration=request.model_dump(mode="json"),
            rows=rows,
            artifacts=_phase5_artifacts(self.settings, reference_id),
        )
        save_json(
            response.model_dump(mode="json"),
            phase5_artifact_paths(self.settings.report_storage_dir, reference_id).threshold_policy_comparisons,
        )
        return response

    def decision_policy_comparison(self, reference_id: str, request: DecisionPolicyComparisonRequest) -> DecisionPolicyComparisonResponse:
        context = self._resolve_context(reference_id)
        false_positive_cost, false_negative_cost = self._resolved_costs(request.false_positive_cost, request.false_negative_cost)
        calibration_request = CalibrationComparisonRequest(
            methods=request.calibration_methods,
            calibration_ratio=request.calibration_ratio,
            random_seed=request.random_seed,
            minimum_calibration_records=request.minimum_calibration_records,
            minimum_calibration_positives=request.minimum_calibration_positives,
            minimum_calibration_negatives=request.minimum_calibration_negatives,
            reliability_bins=request.reliability_bins,
        )
        fits = self._fit_calibration(context, calibration_request)
        fit_by_method = {fit.result.method: fit for fit in fits}
        rows: list[DecisionPolicyRow] = []
        included_policies: list[str] = []
        for method in request.calibration_methods:
            fit = fit_by_method.get(method)
            if fit is None or fit.result.status != "completed":
                continue
            probabilities = fit.probabilities
            default_point = evaluate_threshold_point(
                context.validation_y,
                probabilities,
                0.5,
                false_positive_cost=false_positive_cost,
                false_negative_cost=false_negative_cost,
            )
            cost_request = ThresholdOptimizationRequest(
                threshold_min=request.threshold_min,
                threshold_max=request.threshold_max,
                threshold_step=request.threshold_step,
                threshold_candidates=request.threshold_candidates,
                objective="minimum_cost",
                false_positive_cost=false_positive_cost,
                false_negative_cost=false_negative_cost,
            )
            _, cost_selected = optimize_thresholds(
                context.validation_y,
                probabilities,
                cost_request,
                false_positive_cost=false_positive_cost,
                false_negative_cost=false_negative_cost,
            )
            rows.append(self._policy_row(f"{method}_default_0.5", method, "default", default_point, fit.result))
            rows.append(self._policy_row(f"{method}_cost_optimal", method, "cost_optimal", cost_selected, fit.result))
            included_policies.extend([f"{method}_default_0.5", f"{method}_cost_optimal"])
            if request.include_recall_constrained and request.required_recall is not None:
                recall_request = cost_request.model_copy(update={"objective": "minimum_recall", "required_recall": request.required_recall})
                _, recall_selected = optimize_thresholds(
                    context.validation_y,
                    probabilities,
                    recall_request,
                    false_positive_cost=false_positive_cost,
                    false_negative_cost=false_negative_cost,
                )
                policy_name = f"{method}_recall_at_least_{request.required_recall:.3f}"
                rows.append(self._policy_row(policy_name, method, "recall_constrained", recall_selected, fit.result))
                included_policies.append(policy_name)
        if not rows:
            raise InvalidRequestError("No requested calibration method produced a usable validation probability source.")
        response = DecisionPolicyComparisonResponse(
            reference=context.reference,
            false_positive_cost=false_positive_cost,
            false_negative_cost=false_negative_cost,
            configuration=request.model_dump(mode="json"),
            rows=rows,
            included_policies=included_policies,
            validation_selection_note="All policies were evaluated on the existing validation split. These are validation-selected comparisons, not a final winning production policy.",
            artifacts=_phase5_artifacts(self.settings, reference_id),
        )
        save_json(response.model_dump(mode="json"), phase5_artifact_paths(self.settings.report_storage_dir, reference_id).decision_policies)
        return response

    def get_decision_policy_comparison(self, reference_id: str) -> DecisionPolicyComparisonResponse:
        self._resolve_context(reference_id)
        path = phase5_artifact_paths(self.settings.report_storage_dir, reference_id).decision_policies
        if not path.is_file():
            raise ResourceNotFoundError(f"No decision-policy comparison artifact exists for '{reference_id}'.")
        return DecisionPolicyComparisonResponse.model_validate(load_json(path))

    @staticmethod
    def _policy_row(
        policy_name: str,
        method: CalibrationMethod,
        threshold_source: str,
        point: ThresholdPoint,
        calibration: CalibrationMethodResult,
    ) -> DecisionPolicyRow:
        return DecisionPolicyRow(
            policy_name=policy_name,
            calibration_method=method,
            threshold_source=threshold_source,  # type: ignore[arg-type]
            decision_threshold=point.threshold,
            pr_auc=point.pr_auc,
            roc_auc=point.roc_auc,
            precision=point.precision,
            recall=point.recall,
            f1_score=point.f1_score,
            specificity=point.specificity,
            true_negative=point.true_negative,
            false_positive=point.false_positive,
            false_negative=point.false_negative,
            true_positive=point.true_positive,
            total_business_cost=point.business_cost,
            average_business_cost=point.average_business_cost,
            brier_score=calibration.brier_score,
            log_loss=calibration.log_loss,
            calibration_status=calibration.status,
            note=calibration.reason,
        )
