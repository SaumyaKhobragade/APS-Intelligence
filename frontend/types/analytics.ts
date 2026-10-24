export interface DatasetMetadata {
  id: string;
  name: string;
  source: string;
  featureCount: number;
  rowCount: number;
  positiveClassLabel: string;
  missingValueCount: number;
  updatedAt: string;
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
