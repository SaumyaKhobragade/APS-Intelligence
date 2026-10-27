export interface DatasetMetadata {
  id: string;
  name: string;
  source: string;
  featureCount: number;
  rowCount: number;
  positiveClassLabel: string;
  missingValueCount?: number;
  updatedAt: string;
  datasetType?: DatasetType;
  targetColumn?: string;
  fileSizeBytes?: number;
  status?: DatasetStatus;
  uploadedAt?: string;
  fingerprint?: string;
}

export type DatasetType = "training" | "testing";

export type DatasetStatus = "ready" | "uploading" | "error" | "not_loaded";

export interface DatasetFile {
  fileName: string;
  datasetType: DatasetType;
  fileSizeBytes: number;
  uploadedAt: string;
  status: DatasetStatus;
}

export type FeatureDataType = "numeric" | "categorical" | "target";

export interface FeatureStatistics {
  name: string;
  dataType: FeatureDataType;
  missingCount: number;
  missingPercentage: number;
  nonNullCount: number;
  minimum?: number;
  maximum?: number;
  mean?: number;
  standardDeviation?: number;
}

export interface MissingValueSummary {
  featureName: string;
  missingCount: number;
  missingPercentage: number;
}

export interface DataQualitySummary {
  totalMissingValues: number;
  featuresWithMissingValues: number;
  duplicateRecordCount: number;
  completenessPercentage: number;
}

export interface ClassDistribution {
  totalRecords: number;
  normalRecords: number;
  failureRecords: number;
  normalPercentage: number;
  failurePercentage: number;
  imbalanceRatio: string;
}

export type PreprocessingStageStatus = "pending" | "completed" | "in_progress" | "not_applicable";

export interface PreprocessingStage {
  id: string;
  label: string;
  description: string;
  status: PreprocessingStageStatus;
  detail: string;
}

export interface DatasetUploadResponse {
  datasetId: string;
  fileName: string;
  datasetType: DatasetType;
  fileSizeBytes: number;
  uploadedAt: string;
  status: DatasetStatus;
  message: string;
}

export interface ModelMetrics {
  modelId: string;
  modelName: string;
  prAuc: number;
  precision: number;
  recall: number;
  f1Score: number;
  threshold: number;
  evaluatedAt: string;
  rocAuc?: number;
  specificity?: number;
  balancedAccuracy?: number;
  evaluationScope?: "validation" | "official_test" | "production" | "synthetic";
  candidateLabel?: string;
}

export type ModelEvaluationStatus = "completed" | "not_available";

export interface PrecisionRecallPoint {
  recall: number;
  precision: number;
  threshold: number;
}

export interface FeatureImportance {
  featureName: string;
  importance: number;
  methodology: "absolute_coefficient" | "gain" | "split_frequency";
}

export type HyperparameterValue = string | number | boolean;

export interface ModelEvaluation extends ModelMetrics {
  modelType: string;
  trainingDurationSeconds?: number;
  evaluationStatus: ModelEvaluationStatus;
  trainingDataset: string;
  evaluationDataset: string;
  hyperparameters: Record<string, HyperparameterValue>;
  confusionMatrix: ConfusionMatrix;
  businessImpact: BusinessImpactSummary;
  precisionRecallCurve: PrecisionRecallPoint[];
  rocCurve?: Array<{ falsePositiveRate: number; truePositiveRate: number; threshold: number }>;
  featureImportance?: FeatureImportance[];
  crossValidation?: { prAucMean?: number; prAucStd?: number; folds?: number; searchBudget?: number; sourceReference: string };
  artifactIntegrityStatus?: string;
  artifactAvailable?: boolean;
  sourceDatabase?: string;
  strategy?: string;
  curvesAvailable?: boolean;
}

export interface ModelComparisonSnapshot {
  models: ModelEvaluation[];
  evaluationSplit: string;
  lastUpdated: string;
}

export interface PredictionResult {
  predictionId: string;
  datasetRowId: string;
  predictedLabel: PredictionClass;
  failureProbability: number;
  threshold: number;
  modelId: string;
  createdAt: string;
  modelName?: string;
  status?: PredictionStatus;
  source?: PredictionSource;
  missingFeatureCount?: number;
  batchRowCount?: number;
  featureContributions?: FeatureContribution[];
}

export type PredictionClass = "normal" | "failure";

export type PredictionStatus = "queued" | "processing" | "completed" | "failed";

export type PredictionSource = "single" | "batch";

export type PredictionAvailability = "demo_only" | "not_loaded" | "available";

export interface SensorFeatureDefinition {
  id: string;
  group: string;
  order: number;
}

export interface PredictionModelOption {
  modelId: string;
  modelName: string;
  availability: PredictionAvailability;
  availabilityNote: string;
  prAuc?: number;
  defaultThreshold: number;
  referenceType?: "training_run" | "experiment";
  referenceId?: string;
  featureCount?: number;
  policyId?: string;
}

export interface FeatureContribution {
  featureId: string;
  contribution: number;
  direction: "increase_risk" | "decrease_risk";
  method: "backend_shap" | "backend_coefficient";
}

export interface PredictionRequest {
  modelId: string;
  readings: Record<string, number | null>;
}

export interface BatchUploadSummary {
  fileName: string;
  fileSizeBytes: number;
  rowCount: number;
  featureCount: number;
  missingFeatureCount: number;
  missingValueCount: number;
  status: "ready" | "error" | "processing" | "completed";
  errorMessage?: string;
}

export interface BatchPredictionResponse {
  batchId: string;
  status: PredictionStatus;
  rowCount: number;
  completedCount: number;
  failedCount: number;
  resultsFileName: string;
  completedAt?: string;
  firstPrediction?: PredictionResult;
}

export interface ConfusionMatrix {
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
}

export interface DatasetDistribution {
  normalRecords: number;
  failureRecords: number;
  imbalanceRatio: string;
}

export interface BusinessImpactSummary {
  falsePositiveCount: number;
  falseNegativeCount: number;
  falsePositiveCost: number;
  falseNegativeCost: number;
  estimatedCost: number;
  unitFalsePositiveCost?: number;
  unitFalseNegativeCost?: number;
}

export interface CostWeights {
  falsePositive: number;
  falseNegative: number;
}

export interface ThresholdMetrics {
  threshold: number;
  precision: number;
  recall: number;
  f1Score: number;
  falsePositiveCount: number;
  falseNegativeCount: number;
  truePositiveCount: number;
  trueNegativeCount: number;
  predictedFailureCount: number;
  totalSamples: number;
  falsePositiveCost: number;
  falseNegativeCost: number;
  businessCost: number;
}

export interface ThresholdCurvePoint extends ThresholdMetrics {
  source: "validation_checkpoint" | "internal_selection";
  scope?: "validation" | "internal_selection";
}

export type CalibrationStatus = "demonstration_calibrated" | "demonstration_overconfident" | "demonstration_underconfident" | "completed" | "insufficient_sample" | "failed" | "not_available";

export interface CalibrationPoint {
  binLabel: string;
  predictedProbability: number;
  observedFailureRate: number;
  sampleCount: number;
}

export interface ThresholdRecommendation {
  kind: "minimum_cost" | "maximum_f1" | "default";
  label: string;
  explanation: string;
  metrics: ThresholdMetrics;
}

export interface ThresholdModelEvaluation {
  modelId: string;
  modelName: string;
  modelType: string;
  prAuc: number;
  evaluationDataset: string;
  evaluationSplit: string;
  defaultThreshold: number;
  calibrationStatus: CalibrationStatus;
  calibrationStatusLabel: string;
  brierScore?: number;
  thresholdCurve: ThresholdCurvePoint[];
  calibrationCurve: CalibrationPoint[];
  recommendations: {
    minimumCost: ThresholdRecommendation;
    maximumF1: ThresholdRecommendation;
    default: ThresholdRecommendation;
  };
  costWeights?: CostWeights;
  methodologyNote?: string;
  readOnly?: boolean;
  frozenThreshold?: number;
  provenance?: string[];
  calibrationMetrics?: Record<string, number | null>;
}

export interface ThresholdOptimizationSnapshot {
  models: ThresholdModelEvaluation[];
  costWeights: CostWeights;
  evaluationDataset: string;
  methodologyNote: string;
  lastUpdated: string;
}

export interface ExperimentRecord {
  id: string;
  name: string;
  modelId: string;
  datasetId: string;
  status: "queued" | "running" | "completed" | "failed";
  metrics?: ModelMetrics;
  prAuc?: number;
  confusionMatrix?: ConfusionMatrix;
  createdAt: string;
  completedAt?: string;
}

export type ExperimentType = "model_evaluation" | "threshold_evaluation" | "calibration" | "prediction_evaluation";

export type ExperimentComparisonCompatibility = "compatible" | "incompatible" | "unknown";

export interface ExperimentDatasetInformation {
  datasetId: string;
  datasetName: string;
  datasetVersion?: string;
  fingerprint?: string;
  trainingRecords?: number;
  validationRecords?: number;
  testRecords?: number;
  featureCount?: number;
  missingValueStrategy?: string;
  classImbalanceRatio?: string;
  evaluationProtocol: string;
  compatibilityKey: string;
}

export interface ExperimentModelConfiguration {
  modelId: string;
  modelName: string;
  modelVersion?: string;
  trainingConfiguration: string;
  randomSeed?: number;
  hyperparameters: Record<string, HyperparameterValue>;
}

export interface ExperimentPreprocessingConfiguration {
  missingValueHandling?: string;
  featureSelection?: string;
  scalingOrTransformations?: string;
  classWeightingOrResampling?: string;
}

export interface ExperimentExecutionInformation {
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  status: ExperimentRecord["status"];
}

export interface ExperimentConfigurationSnapshot {
  modelIdentifier: string;
  modelVersion?: string;
  datasetIdentifier: string;
  datasetVersion?: string;
  datasetFingerprint?: string;
  featureSchema: string[];
  preprocessing: ExperimentPreprocessingConfiguration;
  classImbalanceStrategy?: string;
  hyperparameters: Record<string, HyperparameterValue>;
  classificationThreshold?: number;
  costWeights?: CostWeights;
  evaluationSplit?: string;
  randomSeed?: number;
  unavailableFields: string[];
}

export interface ExperimentEvaluationResults {
  prAuc?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  classificationThreshold?: number;
  confusionMatrix?: ConfusionMatrix;
  businessImpact?: BusinessImpactSummary;
  trainingDurationSeconds?: number;
}

export interface ExperimentHistoryRecord {
  id: string;
  name: string;
  modelId: string;
  modelName: string;
  datasetId: string;
  datasetName: string;
  createdAt: string;
  status: ExperimentRecord["status"];
  experimentType: ExperimentType;
  isDemonstration: boolean;
  evaluationResults: ExperimentEvaluationResults;
  details: ExperimentDetails;
  source?: "historical" | "active";
  phase?: "phase3" | "phase4" | "phase9";
  lifecycleStatus?: string;
  artifactIntegrityStatus?: string;
  artifactAvailable?: boolean;
  candidateLabel?: string;
  crossValidation?: { prAucMean?: number; prAucStd?: number; folds?: number; searchBudget?: number; sourceReference: string };
  errorMessage?: string;
  strategy?: string;
}

export interface ExperimentDetails {
  modelConfiguration: ExperimentModelConfiguration;
  datasetInformation: ExperimentDatasetInformation;
  preprocessing: ExperimentPreprocessingConfiguration;
  execution: ExperimentExecutionInformation;
  configurationSnapshot: ExperimentConfigurationSnapshot;
  compatibility: ExperimentComparisonCompatibility;
  compatibilityNote: string;
}

export interface ExperimentTrendPoint {
  experimentId: string;
  createdAt: string;
  modelId: string;
  modelName: string;
  prAuc?: number;
  recall?: number;
  businessCost?: number;
}

export interface ExperimentRegistrySnapshot {
  experiments: ExperimentHistoryRecord[];
  lastUpdated: string;
  sourceLabel: string;
}

export interface ExperimentCreationRequest {
  name: string;
  modelId: string;
  datasetId: string;
  missingValueStrategy: string;
  classImbalanceStrategy: string;
  classificationThreshold: number;
  costWeights: CostWeights;
}

export interface ExperimentComparisonRequest {
  experimentIds: string[];
}

export interface ExperimentReportResponse {
  experimentId: string;
  format: "pdf" | "json";
  source: "backend" | "demo";
  content?: string;
}

export interface DashboardSnapshot {
  dataset: DatasetMetadata | null;
  distribution: DatasetDistribution | null;
  models: ModelMetrics[];
  businessImpact: BusinessImpactSummary | null;
  recentExperiments: ExperimentRecord[];
  lastUpdated: string;
  availability?: { name: string; status: "available" | "unavailable" | "blocked" | "failed"; message: string }[];
  sourceLabel?: string;
  candidateStatus?: string;
  candidateLabel?: string;
  candidateThreshold?: number;
  candidateValidation?: ModelEvaluation;
  quality?: DataQualitySummary | null;
}

export interface DatasetExplorerSnapshot {
  dataset: DatasetMetadata;
  file: DatasetFile;
  quality: DataQualitySummary;
  missingValues: MissingValueSummary[];
  classDistribution: ClassDistribution;
  features: FeatureStatistics[];
  preprocessing: PreprocessingStage[];
  lastUpdated: string;
  profileAvailable?: boolean;
  fingerprint?: string;
  availability?: { name: string; status: "available" | "unavailable" | "blocked" | "failed"; message: string }[];
}
