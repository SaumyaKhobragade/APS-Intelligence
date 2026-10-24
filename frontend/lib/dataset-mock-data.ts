import type {
  ClassDistribution,
  DataQualitySummary,
  DatasetExplorerSnapshot,
  DatasetMetadata,
  DatasetType,
  FeatureStatistics,
  MissingValueSummary,
  PreprocessingStage,
} from "@/types";

/*
 * Demonstration dataset responses only. The values mirror the shape of the
 * UCI APS Failure dataset and are not a claim about a live uploaded file.
 */
const featureNames = [
  "aa_000", "ab_000", "ac_000", "ad_000", "ae_000", "af_000", "ag_000", "ah_000",
  "ai_000", "aj_000", "ak_000", "al_000", "am_000", "an_000", "ao_000", "ap_000",
  "aq_000", "ar_000", "as_000", "at_000", "au_000", "av_000", "ax_000", "ay_000",
  "az_000", "ba_000", "bb_000", "bc_000", "bd_000", "be_000",
];

const trainingMissingCounts = [0, 88, 214, 960, 1_420, 2_210, 3_840, 4_120, 5_480, 6_310, 7_205, 8_004, 8_690, 9_120, 10_500, 11_450, 12_200, 13_040, 14_200, 15_800, 17_100, 18_640, 20_100, 21_540, 23_200, 24_610, 26_880, 28_420, 30_200, 32_080];
const testingMissingCounts = trainingMissingCounts.map((value, index) => Math.round(value * (0.24 + (index % 4) * 0.04)));

function createFeatureStatistics(recordCount: number, missingCounts: number[]): FeatureStatistics[] {
  const features: FeatureStatistics[] = featureNames.map((name, index) => {
    const missingCount = missingCounts[index];
    const mean = 42.8 + index * 3.15;

    return {
      name,
      dataType: "numeric" as const,
      missingCount,
      missingPercentage: missingCount / recordCount,
      nonNullCount: recordCount - missingCount,
      minimum: Number((index * 0.2).toFixed(2)),
      maximum: Number((mean * 4.6 + index).toFixed(2)),
      mean: Number(mean.toFixed(2)),
      standardDeviation: Number((8.4 + index * 0.72).toFixed(2)),
    };
  });

  features.push({
    name: "class",
    dataType: "target",
    missingCount: 0,
    missingPercentage: 0,
    nonNullCount: recordCount,
  });

  return features;
}

function createMissingValues(features: FeatureStatistics[]): MissingValueSummary[] {
  return features
    .filter((feature) => feature.missingCount > 0)
    .sort((first, second) => second.missingCount - first.missingCount)
    .slice(0, 10)
    .map((feature) => ({
      featureName: feature.name,
      missingCount: feature.missingCount,
      missingPercentage: feature.missingPercentage,
    }));
}

function createPreprocessingStages(datasetType: DatasetType): PreprocessingStage[] {
  const testDataset = datasetType === "testing";

  return [
    { id: "raw", label: "Raw Dataset", description: "CSV received and schema detected.", status: "completed", detail: "Loaded in demo workspace" },
    { id: "missing-analysis", label: "Missing-value Analysis", description: "Feature-level missingness is profiled.", status: "completed", detail: "Profile available" },
    { id: "missing-treatment", label: "Missing-value Treatment", description: "Training-fitted imputation is applied without leakage.", status: testDataset ? "not_applicable" : "pending", detail: testDataset ? "Uses training-fitted rules" : "Awaiting backend pipeline" },
    { id: "feature-processing", label: "Feature Processing", description: "Scaling and feature selection follow the training contract.", status: testDataset ? "not_applicable" : "pending", detail: testDataset ? "Uses training-fitted rules" : "Awaiting backend pipeline" },
    { id: "split", label: "Train / Validation / Test Split", description: "Only training data is partitioned for evaluation.", status: testDataset ? "not_applicable" : "pending", detail: testDataset ? "Held-out file remains separate" : "Awaiting backend pipeline" },
    { id: "processed", label: "Processed Dataset", description: "A model-ready artifact is made available.", status: "pending", detail: "Not generated in frontend demo" },
  ];
}

function createDatasetSnapshot(datasetType: DatasetType): DatasetExplorerSnapshot {
  const testing = datasetType === "testing";
  const rowCount = testing ? 16_000 : 60_000;
  const normalRecords = testing ? 15_735 : 59_000;
  const failureRecords = rowCount - normalRecords;
  const features = createFeatureStatistics(rowCount, testing ? testingMissingCounts : trainingMissingCounts);
  const quality: DataQualitySummary = {
    totalMissingValues: testing ? 182_400 : 850_000,
    featuresWithMissingValues: testing ? 118 : 126,
    duplicateRecordCount: testing ? 4 : 18,
    completenessPercentage: testing ? 98.2 : 91.7,
  };
  const classDistribution: ClassDistribution = {
    totalRecords: rowCount,
    normalRecords,
    failureRecords,
    normalPercentage: normalRecords / rowCount,
    failurePercentage: failureRecords / rowCount,
    imbalanceRatio: testing ? "57.3:1" : "59:1",
  };
  const dataset: DatasetMetadata = {
    id: testing ? "uci-aps-demo-test" : "uci-aps-demo-training",
    name: "UCI APS Failure at Scania Trucks",
    source: "Demonstration snapshot",
    featureCount: 170,
    rowCount,
    positiveClassLabel: "Failure",
    missingValueCount: quality.totalMissingValues,
    updatedAt: "2026-10-25T09:30:00Z",
    datasetType,
    targetColumn: "class",
    fileSizeBytes: testing ? 5_240_000 : 19_600_000,
    status: "ready",
    uploadedAt: "2026-10-25T09:30:00Z",
  };

  return {
    dataset,
    file: {
      fileName: testing ? "aps_failure_test_set.csv" : "aps_failure_training_set.csv",
      datasetType,
      fileSizeBytes: dataset.fileSizeBytes ?? 0,
      uploadedAt: dataset.uploadedAt ?? dataset.updatedAt,
      status: "ready",
    },
    quality,
    missingValues: createMissingValues(features),
    classDistribution,
    features,
    preprocessing: createPreprocessingStages(datasetType),
    lastUpdated: "Demo snapshot / 25 Oct 2026 · 09:30 UTC",
  };
}

export const demonstrationDatasetExplorer: Record<DatasetType, DatasetExplorerSnapshot> = {
  training: createDatasetSnapshot("training"),
  testing: createDatasetSnapshot("testing"),
};

export function getDemonstrationDatasetExplorer(): Record<DatasetType, DatasetExplorerSnapshot> {
  return {
    training: cloneDatasetSnapshot(demonstrationDatasetExplorer.training),
    testing: cloneDatasetSnapshot(demonstrationDatasetExplorer.testing),
  };
}

function cloneDatasetSnapshot(snapshot: DatasetExplorerSnapshot): DatasetExplorerSnapshot {
  return {
    ...snapshot,
    dataset: { ...snapshot.dataset },
    file: { ...snapshot.file },
    quality: { ...snapshot.quality },
    missingValues: snapshot.missingValues.map((item) => ({ ...item })),
    classDistribution: { ...snapshot.classDistribution },
    features: snapshot.features.map((feature) => ({ ...feature })),
    preprocessing: snapshot.preprocessing.map((stage) => ({ ...stage })),
  };
}
