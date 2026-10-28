import { apiFetch } from "@/services/api-client";
import { fetchHistoricalValidation } from "@/services/historical-evidence-service";
import type {
  BackendDatasetAnalyticsResponse,
  BackendDatasetListResponse,
  BackendDatasetSummary,
} from "@/services/backend-contracts";
import type {
  DatasetExplorerSnapshot,
  DatasetType,
  DatasetUploadResponse,
  FeatureStatistics,
  PreprocessingStage,
} from "@/types";

function mapDatasetType(value: BackendDatasetSummary["dataset_type"]): DatasetType {
  return value === "testing" ? "testing" : "training";
}

export function fetchDatasets(datasetType?: DatasetType): Promise<BackendDatasetListResponse> {
  const query = datasetType ? `?dataset_type=${encodeURIComponent(datasetType)}&page_size=100` : "?page_size=100";
  return apiFetch<BackendDatasetListResponse>(`/datasets${query}`);
}

export function fetchDatasetAnalytics(datasetId: string, page = 1, pageSize = 50): Promise<BackendDatasetAnalyticsResponse> {
  return apiFetch<BackendDatasetAnalyticsResponse>(`/analytics/datasets/${encodeURIComponent(datasetId)}?page=${page}&page_size=${pageSize}`);
}

export function fetchDatasetExplorer(datasetId: string, page = 1, pageSize = 50): Promise<DatasetExplorerSnapshot | null> {
  return fetchDatasetAnalytics(datasetId, page, pageSize).then((response) => mapDatasetAnalytics(response));
}

export async function fetchDatasetExplorerByType(datasetType: DatasetType, page = 1, pageSize = 50): Promise<DatasetExplorerSnapshot | null> {
  const datasets = await fetchDatasets(datasetType);
  const dataset = datasets.items.find((item) => item.dataset_type === datasetType);
  return dataset ? fetchDatasetExplorer(dataset.dataset_id, page, pageSize) : null;
}

export function uploadDataset(file: File): Promise<DatasetUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  return apiFetch<{
    dataset: BackendDatasetSummary;
    message: string;
  }>("/datasets/import?dataset_type=custom", { method: "POST", body }).then((response) => ({
    datasetId: response.dataset.dataset_id,
    fileName: response.dataset.source_file_name,
    datasetType: "training",
    fileSizeBytes: response.dataset.file_size_bytes,
    uploadedAt: response.dataset.imported_at,
    status: response.dataset.status === "error" ? "error" : "ready",
    message: response.message,
  }));
}

export function mapDatasetSummary(dataset: BackendDatasetSummary) {
  return {
    id: dataset.dataset_id,
    name: dataset.dataset_name,
    source: dataset.source_file_name,
    featureCount: dataset.feature_count,
    rowCount: dataset.record_count,
    positiveClassLabel: "pos",
    updatedAt: dataset.imported_at,
    datasetType: mapDatasetType(dataset.dataset_type),
    targetColumn: dataset.target_column ?? "class",
    fingerprint: dataset.fingerprint,
    fileSizeBytes: dataset.file_size_bytes,
    status: dataset.status === "error" ? "error" : "ready",
    uploadedAt: dataset.imported_at,
  } as const;
}

export interface DatasetEvidenceState {
  metadata: ReturnType<typeof mapDatasetSummary> | null;
  snapshot: DatasetExplorerSnapshot | null;
  splitEvidence: Record<string, unknown> | null;
  availability: Array<{ name: string; status: "available" | "unavailable" | "blocked" | "failed"; message: string }>;
}

export async function fetchDatasetEvidenceByType(datasetType: DatasetType): Promise<DatasetEvidenceState> {
  const datasets = await fetchDatasets(datasetType);
  const dataset = datasets.items.find((item) => item.dataset_type === datasetType);
  if (!dataset) {
    return {
      metadata: null,
      snapshot: null,
      splitEvidence: null,
      availability: [{ name: `${datasetType}_dataset`, status: "unavailable", message: `No persisted ${datasetType} dataset metadata is available.` }],
    };
  }
  const [snapshot, validation] = await Promise.all([
    fetchDatasetExplorer(dataset.dataset_id),
    datasetType === "training" ? fetchHistoricalValidation("phase9-final-validation-candidate") : Promise.resolve(null),
  ]);
  return {
    metadata: mapDatasetSummary(dataset),
    snapshot,
    splitEvidence: validation?.dataset_and_split ?? null,
    availability: [
      ...(snapshot ? [] : [{ name: "profile", status: "unavailable" as const, message: "No persisted dataset profile artifact is available; raw data was not reprofiled." }]),
      ...(validation?.availability ?? []),
    ],
  };
}

function mapFeature(feature: NonNullable<BackendDatasetAnalyticsResponse["feature_page"]>["items"][number]): FeatureStatistics {
  return {
    name: feature.feature_name,
    dataType: feature.data_type === "target" ? "target" : feature.data_type === "categorical" ? "categorical" : "numeric",
    missingCount: feature.missing_count,
    missingPercentage: feature.missing_percentage / 100,
    nonNullCount: feature.non_missing_count,
    minimum: feature.minimum ?? undefined,
    maximum: feature.maximum ?? undefined,
    mean: feature.mean ?? undefined,
    standardDeviation: feature.standard_deviation ?? undefined,
  };
}

export interface PreprocessingModelContext {
  modelName?: string;
  modelFamily?: string;
  imbalanceStrategy?: string;
  preprocessingStrategy?: string;
  hyperparameters?: Record<string, unknown>;
  configuration?: Record<string, unknown> | null;
  scalingApplied?: boolean;
  isExecutionRecord?: boolean;
}

export function isCompleteExecutionRecord(ctx?: PreprocessingModelContext | null): boolean {
  if (!ctx || typeof ctx !== "object") return false;
  if (ctx.isExecutionRecord === false) return false;
  const hasModel = Boolean(
    (ctx.modelName && ctx.modelName.trim().length > 0) ||
    (ctx.modelFamily && ctx.modelFamily.trim().length > 0)
  );
  const hasPreprocessing =
    typeof ctx.preprocessingStrategy === "string" && ctx.preprocessingStrategy.trim().length > 0;
  const hasImbalance =
    typeof ctx.imbalanceStrategy === "string" && ctx.imbalanceStrategy.trim().length > 0;
  return hasModel && hasPreprocessing && hasImbalance;
}

export function buildPreprocessingStages(
  response: BackendDatasetAnalyticsResponse,
  modelContext?: PreprocessingModelContext
): PreprocessingStage[] {
  const dataset = response.dataset;
  const profile = response.profile;
  const splits = response.splits;

  const hasSplits = Boolean(splits?.splits && splits.splits.length > 0);
  const splitsDetail = hasSplits
    ? splits!.splits.map((s) => `${s.split_name}: ${s.record_count.toLocaleString()} rows`).join(" · ")
    : "Holdout split metadata not persisted for this dataset profile";

  const totalMissing = profile?.quality.total_missing_values ?? 0;
  const missingFeatures = profile?.missing_values.features_with_missing_values ?? 0;
  const missingDetail = profile
    ? `${missingFeatures} features with missing values (${totalMissing.toLocaleString()} missing cells total)`
    : "Imputation learned strictly from training partition";

  const imbalanceRatio = profile?.class_distribution.imbalance_ratio ?? "1:59";

  const isComplete = isCompleteExecutionRecord(modelContext);
  const hasContext = Boolean(modelContext && Object.keys(modelContext).length > 0);

  // Check model context if provided
  const modelFamily = (modelContext?.modelFamily || "").toLowerCase();
  const modelName = (modelContext?.modelName || "").toLowerCase();
  const isTree =
    modelFamily === "catboost" ||
    modelFamily === "xgboost" ||
    modelFamily === "random_forest" ||
    modelFamily === "decision_tree" ||
    modelName.includes("catboost") ||
    modelName.includes("xgboost") ||
    modelName.includes("random_forest") ||
    modelName.includes("forest") ||
    modelName.includes("tree");

  const isLinear =
    modelFamily === "logistic_regression" ||
    modelFamily === "linear" ||
    modelName.includes("logistic");

  // Determine Stage 4: Missing-value handling
  let stage4Status: PreprocessingStage["status"] = "methodology_contract";
  let stage4Evidence: PreprocessingStage["evidenceType"] = "pipeline_contract";
  let stage4Desc =
    "Training pipeline contract: Median imputation for linear pipelines, native NaN routing for tree models. Imputation statistics learned strictly from training partition.";
  let stage4Detail = `Methodology contract · ${missingDetail}`;
  let stage4FittingType: PreprocessingStage["fittingType"] = "fitted_train_only";
  let stage4FittingLabel = "Training contract";

  if (isComplete) {
    stage4Evidence = "execution_evidence";
    const prepStrat = modelContext!.preprocessingStrategy;
    if (prepStrat === "native") {
      stage4Status = "not_applicable";
      stage4Desc =
        "Native NaN routing: Tree algorithm handles missing values directly in split branching without imputation.";
      stage4Detail = "Native missing-value routing · No imputation executed";
      stage4FittingType = "not_applicable";
      stage4FittingLabel = "Not applicable (native)";
    } else if (prepStrat === "median") {
      stage4Status = "applied";
      stage4Desc = "Median imputation fitted strictly on training partition records.";
      stage4Detail = "Median statistics learned from training partition only";
      stage4FittingType = "fitted_train_only";
      stage4FittingLabel = "Fitted on training only";
    } else {
      stage4Status = "applied";
      stage4Desc = `${prepStrat} imputation fitted on training partition.`;
      stage4Detail = `${prepStrat} fitted on training partition only`;
      stage4FittingType = "fitted_train_only";
      stage4FittingLabel = "Fitted on training only";
    }
  } else if (hasContext) {
    stage4Evidence = "pipeline_contract";
    const prepStrat = modelContext!.preprocessingStrategy;
    if (prepStrat === "native") {
      stage4Status = "not_applicable";
      stage4Desc =
        "Native NaN routing: Tree algorithm handles missing values directly in split branching without imputation.";
      stage4Detail = "Native missing-value routing · No imputation executed";
      stage4FittingType = "not_applicable";
      stage4FittingLabel = "Not applicable (native)";
    } else if (prepStrat === "median") {
      stage4Status = "applied";
      stage4Desc = "Median imputation fitted strictly on training partition records.";
      stage4Detail = "Median statistics learned from training partition only";
      stage4FittingType = "fitted_train_only";
      stage4FittingLabel = "Fitted on training only";
    } else if (prepStrat) {
      stage4Status = "applied";
      stage4Desc = `${prepStrat} imputation fitted on training partition.`;
      stage4Detail = `${prepStrat} fitted on training partition only`;
      stage4FittingType = "fitted_train_only";
      stage4FittingLabel = "Fitted on training only";
    } else if (modelContext!.configuration === null || modelContext!.configuration === undefined) {
      stage4Status = "unavailable";
      stage4Desc =
        "Missing-value handling configuration is not recorded in historical metadata for this experiment.";
      stage4Detail = "Evidence unavailable in historical metadata";
      stage4FittingType = "not_applicable";
      stage4FittingLabel = "Configuration unavailable";
    } else {
      stage4Status = "unavailable";
      stage4Desc = "Imputation configuration not recorded.";
      stage4Detail = "Evidence unavailable";
      stage4FittingType = "not_applicable";
      stage4FittingLabel = "Not recorded";
    }
  }

  // Determine Stage 5: Feature transformation & scaling
  let stage5Status: PreprocessingStage["status"] = "methodology_contract";
  let stage5Evidence: PreprocessingStage["evidenceType"] = "pipeline_contract";
  let stage5Desc =
    "Training pipeline contract: StandardScaler fitted strictly on training partition for linear models; tree models consume unscaled features directly.";
  let stage5Detail = "Methodology contract · Model-dependent (not applicable to tree models)";
  let stage5FittingType: PreprocessingStage["fittingType"] = "fitted_train_only";
  let stage5FittingLabel = "Training contract";

  if (isComplete) {
    stage5Evidence = "execution_evidence";
    if (isTree) {
      stage5Status = "not_applicable";
      stage5Desc = "Tree ensembles consume unscaled numeric features; StandardScaler is not applicable.";
      stage5Detail = "Not applicable to tree ensembles (unscaled)";
      stage5FittingType = "not_applicable";
      stage5FittingLabel = "Not applicable";
    } else if (isLinear) {
      const scalingConfirmed =
        modelContext!.scalingApplied === true ||
        modelContext!.preprocessingStrategy === "standard_scaler" ||
        Boolean(
          modelContext!.configuration &&
            (modelContext!.configuration.scaling ||
              modelContext!.configuration.standard_scaler ||
              String(modelContext!.configuration.preprocessing || "").includes("scale"))
        );
      if (scalingConfirmed) {
        stage5Status = "applied";
        stage5Desc = "StandardScaler fitted strictly on training partition features.";
        stage5Detail = "StandardScaler fitted on training partition";
        stage5FittingType = "fitted_train_only";
        stage5FittingLabel = "Fitted on training only";
      } else {
        stage5Status = "not_applicable";
        stage5Desc = "Feature scaling not enabled in configuration for this linear model run.";
        stage5Detail = "Feature scaling not applied";
        stage5FittingType = "not_applicable";
        stage5FittingLabel = "Not applicable";
      }
    } else {
      stage5Status = "not_applicable";
      stage5Desc = "Feature scaling not applied.";
      stage5Detail = "Not applicable";
      stage5FittingType = "not_applicable";
      stage5FittingLabel = "Not applicable";
    }
  } else if (hasContext) {
    stage5Evidence = "pipeline_contract";
    if (isTree) {
      stage5Status = "not_applicable";
      stage5Desc = "Tree ensembles consume unscaled numeric features; StandardScaler is not applicable.";
      stage5Detail = "Not applicable to tree ensembles (unscaled)";
      stage5FittingType = "not_applicable";
      stage5FittingLabel = "Not applicable";
    } else if (isLinear) {
      const scalingConfirmed =
        modelContext!.scalingApplied === true ||
        modelContext!.preprocessingStrategy === "standard_scaler" ||
        Boolean(
          modelContext!.configuration &&
            (modelContext!.configuration.scaling ||
              modelContext!.configuration.standard_scaler ||
              String(modelContext!.configuration.preprocessing || "").includes("scale"))
        );
      if (scalingConfirmed) {
        stage5Status = "applied";
        stage5Desc = "StandardScaler fitted strictly on training partition features.";
        stage5Detail = "StandardScaler fitted on training partition";
        stage5FittingType = "fitted_train_only";
        stage5FittingLabel = "Fitted on training only";
      } else if (modelContext!.configuration === null || modelContext!.configuration === undefined) {
        stage5Status = "unavailable";
        stage5Desc = "Scaling configuration not confirmed in historical metadata for this linear model run.";
        stage5Detail = "Evidence unavailable in historical metadata";
        stage5FittingType = "not_applicable";
        stage5FittingLabel = "Configuration unavailable";
      } else {
        stage5Status = "not_applicable";
        stage5Desc = "Feature scaling not enabled in configuration for this linear model run.";
        stage5Detail = "Feature scaling not applied";
        stage5FittingType = "not_applicable";
        stage5FittingLabel = "Not applicable";
      }
    } else if (modelContext!.configuration === null || modelContext!.configuration === undefined) {
      stage5Status = "unavailable";
      stage5Desc = "Feature transformation configuration not recorded.";
      stage5Detail = "Evidence unavailable";
      stage5FittingType = "not_applicable";
      stage5FittingLabel = "Configuration unavailable";
    } else {
      stage5Status = "methodology_contract";
    }
  }

  // Determine Stage 6: Class-imbalance handling
  let stage6Status: PreprocessingStage["status"] = "methodology_contract";
  let stage6Evidence: PreprocessingStage["evidenceType"] = "pipeline_contract";
  let stage6Desc =
    "Training pipeline contract: Resampling (SMOTE) or algorithmic weighting applied strictly inside training partition/folds. Original baseline retains natural 1:59 ratio.";
  let stage6Detail = `Methodology contract · Natural ratio ${imbalanceRatio}`;
  let stage6FittingType: PreprocessingStage["fittingType"] = "fitted_train_only";
  let stage6FittingLabel = "Training contract";

  if (isComplete) {
    stage6Evidence = "execution_evidence";
    const imbStrat = modelContext!.imbalanceStrategy;
    if (imbStrat === "original") {
      stage6Status = "not_applicable";
      stage6Desc =
        "Original class distribution: Evaluated on natural 1:59 imbalance ratio without resampling or loss reweighting.";
      stage6Detail = "Original ratio (1:59) preserved · No resampling or weighting";
      stage6FittingType = "not_applicable";
      stage6FittingLabel = "Natural distribution (no resampling)";
    } else if (imbStrat === "smote") {
      stage6Status = "applied";
      stage6Desc =
        "SMOTE synthetic oversampling applied strictly within training folds; never applied to validation or test partitions.";
      stage6Detail = "SMOTE oversampling confined to training partition";
      stage6FittingType = "fitted_train_only";
      stage6FittingLabel = "Training partition only";
    } else if (imbStrat === "class_weight" || imbStrat === "weighted") {
      stage6Status = "applied";
      stage6Desc = "Asymmetric positive class loss weighting applied inside training objective.";
      stage6Detail = "Loss weighting applied to positive class";
      stage6FittingType = "fitted_train_only";
      stage6FittingLabel = "Loss weighting";
    } else {
      stage6Status = "applied";
      stage6Desc = `${imbStrat} strategy applied inside training partition.`;
      stage6Detail = `${imbStrat} applied in training`;
      stage6FittingType = "fitted_train_only";
      stage6FittingLabel = "Training partition only";
    }
  } else if (hasContext) {
    stage6Evidence = "pipeline_contract";
    const imbStrat = modelContext!.imbalanceStrategy;
    if (imbStrat === "original") {
      stage6Status = "not_applicable";
      stage6Desc =
        "Original class distribution: Evaluated on natural 1:59 imbalance ratio without resampling or loss reweighting.";
      stage6Detail = "Original ratio (1:59) preserved · No resampling or weighting";
      stage6FittingType = "not_applicable";
      stage6FittingLabel = "Natural distribution (no resampling)";
    } else if (imbStrat === "smote") {
      stage6Status = "applied";
      stage6Desc =
        "SMOTE synthetic oversampling applied strictly within training folds; never applied to validation or test partitions.";
      stage6Detail = "SMOTE oversampling confined to training partition";
      stage6FittingType = "fitted_train_only";
      stage6FittingLabel = "Training partition only";
    } else if (imbStrat === "class_weight" || imbStrat === "weighted") {
      stage6Status = "applied";
      stage6Desc = "Asymmetric positive class loss weighting applied inside training objective.";
      stage6Detail = "Loss weighting applied to positive class";
      stage6FittingType = "fitted_train_only";
      stage6FittingLabel = "Loss weighting";
    } else if (imbStrat) {
      stage6Status = "applied";
      stage6Desc = `${imbStrat} strategy applied inside training partition.`;
      stage6Detail = `${imbStrat} applied in training`;
      stage6FittingType = "fitted_train_only";
      stage6FittingLabel = "Training partition only";
    } else if (modelContext!.configuration === null || modelContext!.configuration === undefined) {
      stage6Status = "unavailable";
      stage6Desc = "Class-imbalance handling strategy is not recorded in historical metadata.";
      stage6Detail = "Evidence unavailable";
      stage6FittingType = "not_applicable";
      stage6FittingLabel = "Strategy unavailable";
    } else {
      stage6Status = "unavailable";
      stage6Desc = "Class-imbalance handling strategy is not recorded.";
      stage6Detail = "Evidence unavailable";
      stage6FittingType = "not_applicable";
      stage6FittingLabel = "Strategy unavailable";
    }
  }

  // Determine Stage 7: Final model-ready feature representation
  const stage7Status: PreprocessingStage["status"] = isComplete ? "completed" : "methodology_contract";
  const stage7Evidence: PreprocessingStage["evidenceType"] = isComplete ? "execution_evidence" : "pipeline_contract";
  const stage7Desc = isComplete
    ? `Aligned 170-dimensional numeric feature representation feeding ${modelContext?.modelName || "estimator"}. Maintains uniform column ordering and types; transformations conform to model architecture.`
    : "Aligned 170-dimensional numeric feature representation delivered to estimator pipelines. Shared schema alignment; scaling and imputation are model-specific.";
  const stage7Detail = "170-dimensional aligned numeric matrix feeding estimator contracts";

  return [
    {
      id: "raw-ingestion",
      label: "1. Raw dataset ingestion",
      description: "Ingest tabular sensor telemetry from source artifact without in-memory mutations.",
      status: "completed",
      evidenceType: "dataset_fact",
      detail: dataset.record_count
        ? `${dataset.record_count.toLocaleString()} records ingested · ${dataset.source_file_name || dataset.dataset_name}`
        : "Dataset ingested from source artifact",
      partition: "All partitions",
      fittingType: "contract_boundary",
      fittingLabel: "Ingestion / verification",
    },
    {
      id: "schema-validation",
      label: "2. Schema validation & feature identification",
      description: "Verify 170 numeric operational sensor columns and failure target column (class).",
      status: "completed",
      evidenceType: "dataset_fact",
      detail: `${dataset.feature_count} numeric sensor features verified · Target: ${dataset.target_column ?? "class"}`,
      partition: "All partitions",
      fittingType: "contract_boundary",
      fittingLabel: "Rule validation (unfitted)",
    },
    {
      id: "train-val-split",
      label: "3. Training/validation split",
      description: "Stratified partition preserving failure class ratio. Strict isolation prevents holdout leakage.",
      status: hasSplits ? "completed" : "unavailable",
      evidenceType: "dataset_fact",
      detail: splitsDetail,
      partition: "Split boundary",
      fittingType: "contract_boundary",
      fittingLabel: "Partition boundary (strict isolation)",
    },
    {
      id: "missing-values",
      label: "4. Missing-value handling",
      description: stage4Desc,
      status: stage4Status,
      evidenceType: stage4Evidence,
      detail: stage4Detail,
      partition: "Fitted on training only · Applied downstream",
      fittingType: stage4FittingType,
      fittingLabel: stage4FittingLabel,
    },
    {
      id: "feature-scaling",
      label: "5. Feature transformation & scaling",
      description: stage5Desc,
      status: stage5Status,
      evidenceType: stage5Evidence,
      detail: stage5Detail,
      partition: "Fitted on training only · Applied downstream",
      fittingType: stage5FittingType,
      fittingLabel: stage5FittingLabel,
    },
    {
      id: "class-imbalance",
      label: "6. Class-imbalance handling",
      description: stage6Desc,
      status: stage6Status,
      evidenceType: stage6Evidence,
      detail: stage6Detail,
      partition: "Training partition only",
      fittingType: stage6FittingType,
      fittingLabel: stage6FittingLabel,
    },
    {
      id: "model-ready",
      label: "7. Final model-ready feature representation",
      description: stage7Desc,
      status: stage7Status,
      evidenceType: stage7Evidence,
      detail: stage7Detail,
      partition: "All partitions (evaluated separately)",
      fittingType: "applied_transform",
      fittingLabel: "Aligned model schema",
    },
  ];
}

function mapDatasetAnalytics(response: BackendDatasetAnalyticsResponse): DatasetExplorerSnapshot | null {
  const profile = response.profile;
  if (!profile || !response.feature_page) return null;
  const summary = mapDatasetSummary(response.dataset);
  const quality = profile.quality;
  const classDistribution = profile.class_distribution;
  return {
    dataset: {
      ...summary,
      positiveClassLabel: classDistribution.failure_records > 0 ? "pos" : "unavailable",
      missingValueCount: quality.total_missing_values,
    },
    file: {
      fileName: response.dataset.source_file_name,
      datasetType: mapDatasetType(response.dataset.dataset_type),
      fileSizeBytes: response.dataset.file_size_bytes,
      uploadedAt: response.dataset.imported_at,
      status: response.source_available ? "ready" : "error",
    },
    quality: {
      totalMissingValues: quality.total_missing_values,
      featuresWithMissingValues: profile.missing_values.features_with_missing_values,
      duplicateRecordCount: quality.duplicate_row_count,
      completenessPercentage: Math.max(0, 100 - quality.overall_missing_percentage),
    },
    missingValues: profile.missing_values.items.map((item) => ({
      featureName: item.feature_name,
      missingCount: item.missing_count,
      missingPercentage: item.missing_percentage / 100,
    })),
    classDistribution: {
      totalRecords: classDistribution.total_records,
      normalRecords: classDistribution.normal_records,
      failureRecords: classDistribution.failure_records,
      normalPercentage: classDistribution.normal_percentage / 100,
      failurePercentage: classDistribution.failure_percentage / 100,
      imbalanceRatio: classDistribution.imbalance_ratio,
    },
    features: response.feature_page.items.map(mapFeature),
    preprocessing: buildPreprocessingStages(response),
    lastUpdated: profile.generated_at,
  };
}
