import { APS_SENSOR_FEATURE_IDS } from "@/lib/prediction-mock-data";
import { getDemonstrationModelComparison } from "@/lib/model-comparison-mock-data";
import { getThresholdOptimizationSnapshot, evaluateThreshold } from "@/lib/threshold-mock-data";
import type { BusinessImpactSummary, CostWeights, ExperimentDetails, ExperimentEvaluationResults, ExperimentHistoryRecord, ExperimentModelConfiguration, ExperimentRegistrySnapshot, ExperimentType, ModelEvaluation } from "@/types";

const demoCostWeights: CostWeights = { falsePositive: 10, falseNegative: 500 };
const comparisonSnapshot = getDemonstrationModelComparison();
const thresholdSnapshot = getThresholdOptimizationSnapshot(demoCostWeights);

function findModel(modelId: string): ModelEvaluation {
  return comparisonSnapshot.models.find((model) => model.modelId === modelId) ?? comparisonSnapshot.models[0];
}

function thresholdResults(modelId: string, threshold: number): ExperimentEvaluationResults {
  const model = thresholdSnapshot.models.find((candidate) => candidate.modelId === modelId) ?? thresholdSnapshot.models[0];
  const metrics = evaluateThreshold(model, threshold, demoCostWeights);
  const businessImpact: BusinessImpactSummary = {
    falsePositiveCount: metrics.falsePositiveCount,
    falseNegativeCount: metrics.falseNegativeCount,
    falsePositiveCost: metrics.falsePositiveCost,
    falseNegativeCost: metrics.falseNegativeCost,
    estimatedCost: metrics.businessCost,
  };
  return {
    prAuc: model.prAuc,
    precision: metrics.precision,
    recall: metrics.recall,
    f1Score: metrics.f1Score,
    classificationThreshold: metrics.threshold,
    confusionMatrix: { truePositive: metrics.truePositiveCount, trueNegative: metrics.trueNegativeCount, falsePositive: metrics.falsePositiveCount, falseNegative: metrics.falseNegativeCount },
    businessImpact,
    trainingDurationSeconds: findModel(modelId).trainingDurationSeconds,
  };
}

function modelResults(modelId: string): ExperimentEvaluationResults {
  const model = findModel(modelId);
  return {
    prAuc: model.prAuc,
    precision: model.precision,
    recall: model.recall,
    f1Score: model.f1Score,
    classificationThreshold: model.threshold,
    confusionMatrix: { ...model.confusionMatrix },
    businessImpact: { ...model.businessImpact },
    trainingDurationSeconds: model.trainingDurationSeconds,
  };
}

function modelConfiguration(modelId: string, runNumber: number): ExperimentModelConfiguration {
  const model = findModel(modelId);
  return {
    modelId: model.modelId,
    modelName: model.modelName,
    modelVersion: `demo-${model.modelId}-2026.10.${runNumber}`,
    trainingConfiguration: `${model.modelType} / demonstration training configuration`,
    randomSeed: 4200 + runNumber,
    hyperparameters: { ...model.hyperparameters },
  };
}

function details(modelId: string, runNumber: number, evaluationProtocol: string, compatibilityKey: string, unavailableFields: string[] = []): ExperimentDetails {
  const model = findModel(modelId);
  const modelConfig = modelConfiguration(modelId, runNumber);
  return {
    modelConfiguration: modelConfig,
    datasetInformation: {
      datasetId: compatibilityKey === "aps-test-v2" ? "aps-test-v2" : "aps-training-v1",
      datasetName: compatibilityKey === "aps-test-v2" ? "APS test holdout / demonstration" : "APS failure training set / demonstration",
      datasetVersion: `demo-dataset-2026.10.${runNumber}`,
      fingerprint: `sha256:demo-${compatibilityKey}-${runNumber}`,
      trainingRecords: 240_000,
      validationRecords: 60_000,
      testRecords: compatibilityKey === "aps-test-v2" ? 60_000 : undefined,
      featureCount: APS_SENSOR_FEATURE_IDS.length,
      missingValueStrategy: "Median imputation / demonstration configuration",
      classImbalanceRatio: "59:1 normal-to-failure / demonstration split",
      evaluationProtocol,
      compatibilityKey,
    },
    preprocessing: {
      missingValueHandling: "Median imputation with schema-preserving null audit",
      featureSelection: "All 170 APS sensor identifiers retained",
      scalingOrTransformations: modelId === "logistic-regression" ? "Standard scaling / demonstration configuration" : "No scaling / tree-compatible inputs",
      classWeightingOrResampling: modelId === "logistic-regression" ? "Balanced class weights" : "Model-specific class weighting",
    },
    execution: {
      startedAt: `2026-10-25T${String(7 + runNumber).padStart(2, "0")}:00:00Z`,
      endedAt: `2026-10-25T${String(7 + runNumber).padStart(2, "0")}:${String(model.trainingDurationSeconds).padStart(2, "0")}:00Z`,
      durationSeconds: model.trainingDurationSeconds,
      status: "completed",
    },
    configurationSnapshot: {
      modelIdentifier: model.modelId,
      modelVersion: modelConfig.modelVersion,
      datasetIdentifier: compatibilityKey,
      datasetVersion: `demo-dataset-2026.10.${runNumber}`,
      datasetFingerprint: `sha256:demo-${compatibilityKey}-${runNumber}`,
      featureSchema: [...APS_SENSOR_FEATURE_IDS],
      preprocessing: {
        missingValueHandling: "Median imputation with schema-preserving null audit",
        featureSelection: "All 170 APS sensor identifiers retained",
        scalingOrTransformations: modelId === "logistic-regression" ? "Standard scaling / demonstration configuration" : "No scaling / tree-compatible inputs",
        classWeightingOrResampling: modelId === "logistic-regression" ? "Balanced class weights" : "Model-specific class weighting",
      },
      classImbalanceStrategy: modelId === "logistic-regression" ? "Balanced class weights" : "Model-specific class weighting",
      hyperparameters: { ...model.hyperparameters },
      classificationThreshold: model.threshold,
      costWeights: { ...demoCostWeights },
      evaluationSplit: evaluationProtocol,
      randomSeed: modelConfig.randomSeed,
      unavailableFields,
    },
    compatibility: compatibilityKey === "aps-test-v2" ? "incompatible" : "compatible",
    compatibilityNote: compatibilityKey === "aps-test-v2" ? "Different dataset fingerprint and test protocol; compare only with an explicit compatibility warning." : "Same demonstration dataset family and validation protocol.",
  };
}

function createRecord(id: string, name: string, modelId: string, datasetId: string, datasetName: string, createdAt: string, status: ExperimentHistoryRecord["status"], experimentType: ExperimentType, evaluationResults: ExperimentEvaluationResults, experimentDetails: ExperimentDetails): ExperimentHistoryRecord {
  return { id, name, modelId, modelName: findModel(modelId).modelName, datasetId, datasetName, createdAt, status, experimentType, isDemonstration: true, evaluationResults, details: experimentDetails };
}

const demonstrationExperiments: ExperimentHistoryRecord[] = [
  createRecord("EXP-2026-1025-001", "XGBoost validation baseline", "xgboost", "aps-training-v1", "APS failure training set / demonstration", "2026-10-25T09:24:00Z", "completed", "model_evaluation", modelResults("xgboost"), details("xgboost", 1, "Validation split / 20% of training file", "aps-validation-v1")),
  createRecord("EXP-2026-1025-002", "Random Forest cost operating point", "random-forest", "aps-training-v1", "APS failure training set / demonstration", "2026-10-25T09:12:00Z", "completed", "threshold_evaluation", thresholdResults("random-forest", 0.05), details("random-forest", 2, "Validation split / threshold selection", "aps-validation-v1")),
  createRecord("EXP-2026-1025-003", "CatBoost calibration review", "catboost", "aps-training-v1", "APS failure training set / demonstration", "2026-10-25T08:58:00Z", "completed", "calibration", modelResults("catboost"), details("catboost", 3, "Validation split / calibration review", "aps-validation-v1")),
  createRecord("EXP-2026-1025-004", "Logistic regression benchmark", "logistic-regression", "aps-training-v1", "APS failure training set / demonstration", "2026-10-25T08:42:00Z", "completed", "model_evaluation", modelResults("logistic-regression"), details("logistic-regression", 4, "Validation split / 20% of training file", "aps-validation-v1")),
  createRecord("EXP-2026-1024-005", "XGBoost lower-cost threshold", "xgboost", "aps-training-v1", "APS failure training set / demonstration", "2026-10-24T16:30:00Z", "completed", "threshold_evaluation", thresholdResults("xgboost", 0.12), details("xgboost", 5, "Validation split / threshold selection", "aps-validation-v1")),
  createRecord("EXP-2026-1024-006", "Random Forest held-out check", "random-forest", "aps-test-v2", "APS test holdout / demonstration", "2026-10-24T14:05:00Z", "completed", "model_evaluation", modelResults("random-forest"), details("random-forest", 6, "Final test holdout / demonstration only", "aps-test-v2")),
  createRecord("EXP-2026-1024-007", "CatBoost threshold sweep / queued", "catboost", "aps-training-v1", "APS failure training set / demonstration", "2026-10-24T11:20:00Z", "queued", "threshold_evaluation", {}, { ...details("catboost", 7, "Unavailable / queued", "aps-validation-v1", ["evaluationResults", "endedAt", "businessCost"]), execution: { status: "queued" } }),
  createRecord("EXP-2026-1023-008", "Calibration artifact retry", "logistic-regression", "aps-training-v1", "APS failure training set / demonstration", "2026-10-23T17:45:00Z", "failed", "calibration", {}, { ...details("logistic-regression", 8, "Unavailable / failed", "aps-validation-v1", ["evaluationResults", "endedAt", "brierScore"]), execution: { status: "failed" } }),
];

export const demonstrationExperimentRegistry: ExperimentRegistrySnapshot = {
  experiments: demonstrationExperiments,
  lastUpdated: "Demo registry / 25 Oct 2026 · 10:30 UTC",
  sourceLabel: "Demonstration records / backend registry not connected",
};

export function getDemonstrationExperimentRegistry(): ExperimentRegistrySnapshot {
  return {
    ...demonstrationExperimentRegistry,
    experiments: demonstrationExperimentRegistry.experiments.map((experiment) => ({
      ...experiment,
      evaluationResults: { ...experiment.evaluationResults, confusionMatrix: experiment.evaluationResults.confusionMatrix ? { ...experiment.evaluationResults.confusionMatrix } : undefined, businessImpact: experiment.evaluationResults.businessImpact ? { ...experiment.evaluationResults.businessImpact } : undefined },
      details: {
        ...experiment.details,
        modelConfiguration: { ...experiment.details.modelConfiguration, hyperparameters: { ...experiment.details.modelConfiguration.hyperparameters } },
        datasetInformation: { ...experiment.details.datasetInformation },
        preprocessing: { ...experiment.details.preprocessing },
        execution: { ...experiment.details.execution },
        configurationSnapshot: { ...experiment.details.configurationSnapshot, featureSchema: [...experiment.details.configurationSnapshot.featureSchema], preprocessing: { ...experiment.details.configurationSnapshot.preprocessing }, hyperparameters: { ...experiment.details.configurationSnapshot.hyperparameters }, costWeights: experiment.details.configurationSnapshot.costWeights ? { ...experiment.details.configurationSnapshot.costWeights } : undefined, unavailableFields: [...experiment.details.configurationSnapshot.unavailableFields] },
      },
    })),
  };
}
