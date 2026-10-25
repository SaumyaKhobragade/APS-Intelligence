export interface DatasetMetadata {
  id: string;
  name: string;
  source: string;
  featureCount: number;
  rowCount: number;
  positiveClassLabel: string;
  missingValueCount: number;
  updatedAt: string;
  datasetType?: DatasetType;
  targetColumn?: string;
  fileSizeBytes?: number;
  status?: DatasetStatus;
  uploadedAt?: string;
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
  trainingDurationSeconds: number;
  evaluationStatus: ModelEvaluationStatus;
  trainingDataset: string;
  evaluationDataset: string;
  hyperparameters: Record<string, HyperparameterValue>;
  confusionMatrix: ConfusionMatrix;
  businessImpact: BusinessImpactSummary;
  precisionRecallCurve: PrecisionRecallPoint[];
  featureImportance?: FeatureImportance[];
}

export interface ModelComparisonSnapshot {
  models: ModelEvaluation[];
  evaluationSplit: string;
  lastUpdated: string;
}

export interface PredictionResult {
  predictionId: string;
  datasetRowId: string;
  predictedLabel: string;
  failureProbability: number;
  threshold: number;
  modelId: string;
  createdAt: string;
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
}

export interface ExperimentRecord {
  id: string;
  name: string;
  modelId: string;
  datasetId: string;
  status: "queued" | "running" | "completed" | "failed";
  metrics?: ModelMetrics;
  confusionMatrix?: ConfusionMatrix;
  createdAt: string;
  completedAt?: string;
}

export interface DashboardSnapshot {
  dataset: DatasetMetadata;
  distribution: DatasetDistribution;
  models: ModelMetrics[];
  businessImpact: BusinessImpactSummary;
  recentExperiments: ExperimentRecord[];
  lastUpdated: string;
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
}
