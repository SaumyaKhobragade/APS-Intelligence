export type BackendReferenceType = "training_run" | "experiment";

export interface BackendAvailabilityNote {
  name: string;
  status: "available" | "unavailable" | "blocked" | "failed";
  message: string;
}

export interface BackendDatasetSummary {
  dataset_id: string;
  dataset_name: string;
  dataset_type: "training" | "testing" | "custom";
  source_file_name: string;
  fingerprint: string;
  file_size_bytes: number;
  record_count: number;
  feature_count: number;
  target_column: string | null;
  status: "ready" | "profiled" | "preprocessed" | "error";
  imported_at: string;
}

export interface BackendDatasetListResponse {
  items: BackendDatasetSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface BackendFeatureSummary {
  feature_name: string;
  data_type: string;
  missing_count: number;
  missing_percentage: number;
  non_missing_count: number;
  unique_value_count: number;
  minimum?: number | null;
  maximum?: number | null;
  mean?: number | null;
  median?: number | null;
  standard_deviation?: number | null;
  variance?: number | null;
  first_quartile?: number | null;
  third_quartile?: number | null;
  is_constant: boolean;
  is_all_missing: boolean;
  has_excessive_missingness: boolean;
}

export interface BackendFeaturePageResponse {
  items: BackendFeatureSummary[];
  total: number;
  page: number;
  page_size: number;
  search?: string | null;
}

export interface BackendMissingValuesResponse {
  items: Array<{
    feature_name: string;
    missing_count: number;
    missing_percentage: number;
    non_missing_count: number;
    status: "none" | "present" | "excessive";
  }>;
  total_missing_values: number;
  overall_missing_percentage: number;
  features_with_missing_values: number;
  features_without_missing_values: number;
  features_with_excessive_missingness: number;
}

export interface BackendClassDistributionResponse {
  target_column: string;
  total_records: number;
  class_counts: Record<string, number>;
  class_percentages: Record<string, number>;
  normal_records: number;
  failure_records: number;
  normal_percentage: number;
  failure_percentage: number;
  imbalance_ratio: string;
  unexpected_labels: string[];
}

export interface BackendQualityResponse {
  dataset_id: string;
  duplicate_row_count: number;
  duplicate_column_names: string[];
  constant_features: string[];
  zero_variance_features: string[];
  all_missing_features: string[];
  infinite_value_counts: Record<string, number>;
  invalid_value_counts: Record<string, number>;
  unexpected_target_labels: string[];
  total_missing_values: number;
  overall_missing_percentage: number;
  excessive_missingness_threshold: number;
  generated_at: string;
}

export interface BackendProfileResponse {
  dataset: BackendDatasetSummary;
  target_column: string;
  feature_columns: string[];
  numerical_feature_count: number;
  categorical_feature_count: number;
  feature_data_types: Record<string, string>;
  profile: BackendFeaturePageResponse;
  missing_values: BackendMissingValuesResponse;
  class_distribution: BackendClassDistributionResponse;
  quality: BackendQualityResponse;
  generated_at: string;
}

export interface BackendSplitsResponse {
  dataset_id: string;
  validation_ratio: number;
  random_seed: number;
  test_isolation_note: string;
  splits: Array<{
    split_name: "training" | "validation" | "test";
    record_count: number;
    class_counts: Record<string, number>;
    class_percentages: Record<string, number>;
    fingerprint: string;
    source_dataset_id: string;
  }>;
}

export interface BackendDatasetAnalyticsResponse {
  dataset: BackendDatasetSummary;
  source_available: boolean;
  profile_available: boolean;
  profile: BackendProfileResponse | null;
  feature_page: BackendFeaturePageResponse | null;
  splits: BackendSplitsResponse | null;
  availability: BackendAvailabilityNote[];
}

export interface BackendPromotionSummary {
  promotion_id: string;
  model_reference_type: BackendReferenceType;
  model_reference_id: string;
  model_version: string;
  decision_policy_id: string;
  decision_policy_version: string;
  status: "active" | "superseded" | "reverted";
  previous_promotion_id?: string | null;
  genuine_evaluation_confirmed: boolean;
  evaluation_evidence: string;
  note?: string | null;
  promoted_at: string;
  superseded_at?: string | null;
  reverted_at?: string | null;
}

export interface BackendDashboardResponse {
  generated_at: string;
  datasets: BackendDatasetSummary[];
  model_run_count: number;
  experiment_count: number;
  model_counts_by_lifecycle: Record<string, number>;
  current_promotion: BackendPromotionSummary | null;
  total_predictions: number;
  positive_prediction_count: number;
  negative_prediction_count: number;
  recent_experiments: Array<{
    experiment_id: string;
    model_name: string;
    model_version: string;
    status: string;
    lifecycle_status: string;
    dataset_id: string;
    configuration_fingerprint?: string | null;
    created_at: string;
    completed_at?: string | null;
    pr_auc?: number | null;
  }>;
  recent_predictions: Array<{
    prediction_id: string;
    model_reference_type: string;
    model_reference_id: string;
    model_version: string;
    predicted_class: "pos" | "neg";
    failure_probability: number;
    prediction_timestamp: string;
  }>;
  latest_validation_metrics: Array<{
    reference_type: BackendReferenceType;
    reference_id: string;
    model_name: string;
    model_version: string;
    dataset_id: string;
    split_identifier?: string | null;
    scope: "validation" | "official_test" | "synthetic" | "production";
    pr_auc?: number | null;
    roc_auc?: number | null;
    precision?: number | null;
    recall?: number | null;
    f1_score?: number | null;
    estimated_business_cost?: number | null;
    generated_at: string;
  }>;
  artifact_integrity_counts: Record<string, number>;
  reproducibility_status: Record<string, number>;
  availability: BackendAvailabilityNote[];
}

export interface BackendModelComparisonItem {
  reference_type: BackendReferenceType;
  reference_id: string;
  model_name: string;
  model_version: string;
  dataset_id: string;
  dataset_fingerprint: string;
  evaluation_scope: "validation" | "official_test" | "synthetic" | "production";
  evaluation_split?: string | null;
  imbalance_strategy?: string | null;
  preprocessing_strategy?: string | null;
  hyperparameters: Record<string, unknown>;
  threshold?: number | null;
  pr_auc?: number | null;
  roc_auc?: number | null;
  precision?: number | null;
  recall?: number | null;
  f1_score?: number | null;
  confusion_matrix?: Record<string, unknown> | null;
  false_positive_cost?: number | null;
  false_negative_cost?: number | null;
  estimated_business_cost?: number | null;
  training_duration_seconds?: number | null;
  inference_duration_seconds?: number | null;
  precision_recall_curve?: Record<string, number[]> | null;
  roc_curve?: Record<string, number[]> | null;
  feature_importance: Array<Record<string, unknown>>;
  created_at: string;
}

export interface BackendModelComparisonResponse {
  available_model_families: string[];
  items: BackendModelComparisonItem[];
  total: number;
  page: number;
  page_size: number;
  filters: Record<string, unknown>;
  availability: BackendAvailabilityNote[];
}

export interface BackendThresholdPoint {
  threshold: number;
  precision: number;
  recall: number;
  f1_score: number;
  specificity: number;
  false_positive_rate: number;
  false_negative_rate: number;
  true_negative: number;
  false_positive: number;
  false_negative: number;
  true_positive: number;
  predicted_positive_count: number;
  total_records: number;
  pr_auc?: number | null;
  roc_auc?: number | null;
  business_cost: number;
  average_business_cost: number;
}

export interface BackendPhase5Reference {
  reference_id: string;
  reference_type: BackendReferenceType;
  model_name: string;
  model_version: string;
  imbalance_strategy?: string | null;
  preprocessing_strategy?: string | null;
  dataset_id: string;
  dataset_fingerprint: string;
  validation_ratio: number;
  random_seed: number;
  validation_records: number;
  split_identifier: string;
}

export interface BackendThresholdAnalysis {
  reference: BackendPhase5Reference;
  default_threshold: BackendThresholdPoint;
  selected: BackendThresholdPoint & { objective: string; objective_parameters: Record<string, unknown>; tie_breaker: string };
  candidates: BackendThresholdPoint[];
  objective: string;
  objective_parameters: Record<string, unknown>;
  false_positive_cost: number;
  false_negative_cost: number;
  configuration: Record<string, unknown>;
  validation_selection_note: string;
}

export interface BackendCalibrationMethod {
  method: "uncalibrated" | "sigmoid" | "isotonic";
  status: "completed" | "insufficient_sample" | "failed";
  calibration_records: number;
  calibration_positive_records: number;
  calibration_negative_records: number;
  validation_records: number;
  pr_auc?: number | null;
  roc_auc?: number | null;
  brier_score?: number | null;
  log_loss?: number | null;
  expected_calibration_error?: number | null;
  reliability_curve: Array<{
    bin_lower: number;
    bin_upper: number;
    bin_label: string;
    predicted_probability: number;
    observed_failure_rate: number;
    sample_count: number;
  }>;
  reason?: string | null;
}

export interface BackendCalibrationComparison {
  reference: BackendPhase5Reference;
  methods: BackendCalibrationMethod[];
  calibration_fit_scope: string;
  validation_evaluation_scope: string;
  ranking_metric_note: string;
}

export interface BackendDecisionPolicyComparison {
  reference: BackendPhase5Reference;
  false_positive_cost: number;
  false_negative_cost: number;
  rows: Array<{
    policy_name: string;
    calibration_method: "uncalibrated" | "sigmoid" | "isotonic";
    threshold_source: "default" | "cost_optimal" | "recall_constrained";
    decision_threshold: number;
    pr_auc?: number | null;
    roc_auc?: number | null;
    precision: number;
    recall: number;
    f1_score: number;
    specificity: number;
    true_negative: number;
    false_positive: number;
    false_negative: number;
    true_positive: number;
    total_business_cost: number;
    average_business_cost: number;
    brier_score?: number | null;
    calibration_status: "completed" | "insufficient_sample" | "failed";
    note?: string | null;
  }>;
  validation_selection_note: string;
}

export interface BackendThresholdAnalyticsResponse {
  reference_type: BackendReferenceType;
  reference_id: string;
  threshold_analysis: BackendThresholdAnalysis | null;
  calibration: BackendCalibrationComparison | null;
  decision_policies: BackendDecisionPolicyComparison | null;
  availability: BackendAvailabilityNote[];
}

export interface BackendThresholdListResponse {
  items: Array<{
    reference_type: BackendReferenceType;
    reference_id: string;
    model_name: string;
    model_version: string;
    threshold_available: boolean;
    calibration_available: boolean;
    decision_policy_available: boolean;
  }>;
  total: number;
  page: number;
  page_size: number;
}

export interface BackendPredictionModelOption {
  model_reference_type: BackendReferenceType;
  model_reference_id: string;
  model_name: string;
  model_version: string;
  dataset_id: string;
  status: string;
  feature_count: number;
  default_threshold: number;
  available_policy_count: number;
}

export interface BackendPredictionModelListResponse {
  items: BackendPredictionModelOption[];
  total: number;
  page: number;
  page_size: number;
}

export interface BackendPolicySummary {
  policy_id: string;
  policy_name: string;
  policy_version: string;
  model_reference_type: BackendReferenceType;
  model_reference_id: string;
  model_version: string;
  status: string;
  threshold: number;
  calibration_method: string;
  created_at: string;
}

export interface BackendPolicyListResponse {
  items: BackendPolicySummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface BackendFeatureSchemaResponse {
  model_reference_type: BackendReferenceType;
  model_reference_id: string;
  model_version: string;
  feature_count: number;
  feature_names: string[];
}

export interface BackendPredictionResponse {
  prediction_id: string;
  model_reference_type: BackendReferenceType;
  model_reference_id: string;
  model_version: string;
  model_run_id?: string | null;
  experiment_id?: string | null;
  decision_policy_id?: string | null;
  decision_policy_version?: string | null;
  predicted_class: "pos" | "neg";
  failure_probability: number;
  applied_threshold: number;
  calibration_method: string;
  risk_classification: "high" | "low";
  prediction_timestamp: string;
  inference_duration_ms: number;
  vehicle_identifier?: string | null;
  request_reference?: string | null;
  warnings: string[];
  explanation?: {
    method: string;
    top_features: Array<{ feature_name: string; importance: number; importance_type: string }>;
    warning: string;
  } | null;
}

export interface BackendPredictionHistoryResponse {
  items: BackendPredictionResponse[];
  total: number;
  page: number;
  page_size: number;
}

export interface BackendBatchPredictionResponse {
  batch_id: string;
  model_reference_type: BackendReferenceType;
  model_reference_id: string;
  model_version: string;
  decision_policy_id?: string | null;
  items: Array<{ index: number; prediction: BackendPredictionResponse | null; error?: { code: string; message: string; details: unknown[] } | null }>;
  total_records: number;
  successful_count: number;
  failed_count: number;
  positive_count: number;
  negative_count: number;
  total_inference_duration_ms: number;
  average_inference_duration_ms: number;
  warnings: string[];
}

export interface BackendRegistrySummary {
  model_reference_type: BackendReferenceType;
  model_reference_id: string;
  model_name: string;
  model_version: string;
  execution_status: string;
  lifecycle_status: string;
  dataset_id: string;
  dataset_fingerprint: string;
  configuration_fingerprint?: string | null;
  split_identifier?: string | null;
  primary_metric?: number | null;
  artifact_integrity_status: string;
  created_at: string;
  completed_at?: string | null;
  policy_count: number;
  prediction_count: number;
}

export interface BackendRegistryListResponse {
  items: BackendRegistrySummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface BackendExperimentSummary {
  experiment_id: string;
  model_name: string;
  model_version: string;
  dataset_id: string;
  dataset_fingerprint: string;
  status: "queued" | "running" | "completed" | "failed";
  imbalance_strategy: "original" | "class_weight" | "smote";
  preprocessing_strategy: string;
  optimize_hyperparameters: boolean;
  random_seed: number;
  validation_ratio: number;
  primary_metric?: number | null;
  training_duration_seconds?: number | null;
  inference_duration_seconds?: number | null;
  created_at: string;
  completed_at?: string | null;
}

export interface BackendEvaluationMetrics {
  threshold: number;
  pr_auc?: number | null;
  roc_auc?: number | null;
  precision: number;
  recall: number;
  f1_score: number;
  confusion_matrix: {
    true_negative: number;
    false_positive: number;
    false_negative: number;
    true_positive: number;
    matrix: number[][];
  };
  false_positive_cost: number;
  false_negative_cost: number;
  estimated_business_cost: number;
  business_cost_note: string;
}

export interface BackendExperimentDetail extends BackendExperimentSummary {
  configuration: Record<string, unknown>;
  best_parameters: Record<string, unknown>;
  search_results: Array<Record<string, unknown>>;
  metrics: BackendEvaluationMetrics | null;
  confusion_matrix: BackendEvaluationMetrics["confusion_matrix"] | null;
  curves: { precision_recall: Record<string, number[]>; roc: Record<string, number[]> } | null;
  feature_importance: Array<{ feature_name: string; importance: number; importance_type: string }>;
  artifacts: Record<string, string>;
  training_records: number;
  validation_records: number;
  training_class_counts: Record<string, number>;
  validation_class_counts: Record<string, number>;
  validation_distribution_preserved: boolean;
  test_isolation_note: string;
  error_message?: string | null;
}

export interface BackendExperimentListResponse {
  items: BackendExperimentSummary[];
  total: number;
  page: number;
  page_size: number;
}

export type BackendHistoricalEvidenceScope = "historical_training" | "cross_validation" | "validation" | "official_test" | "internal_selection";

export interface BackendHistoricalAvailability {
  name: string;
  status: "available" | "unavailable" | "blocked" | "failed";
  message: string;
}

export interface BackendHistoricalConfusionMatrix {
  true_negative: number;
  false_positive: number;
  false_negative: number;
  true_positive: number;
}

export interface BackendHistoricalMetric {
  scope: BackendHistoricalEvidenceScope;
  label: string;
  threshold?: number | null;
  pr_auc?: number | null;
  roc_auc?: number | null;
  precision?: number | null;
  recall?: number | null;
  f1_score?: number | null;
  specificity?: number | null;
  balanced_accuracy?: number | null;
  accuracy?: number | null;
  false_positive_cost?: number | null;
  false_negative_cost?: number | null;
  estimated_business_cost?: number | null;
  business_cost_note?: string | null;
  confusion_matrix?: BackendHistoricalConfusionMatrix | null;
  source_reference: string;
}

export interface BackendHistoricalCrossValidation {
  pr_auc_mean?: number | null;
  pr_auc_std?: number | null;
  folds?: number | null;
  search_budget?: number | null;
  source_reference: string;
}

export interface BackendHistoricalArtifact {
  logical_name: string;
  relative_path: string;
  exists: boolean;
  readable: boolean;
  size_bytes?: number | null;
  stored_checksum?: string | null;
  actual_checksum?: string | null;
  checksum_status: "verified" | "mismatch" | "missing" | "not_recorded" | "unavailable";
  message?: string | null;
}

export interface BackendHistoricalRunSummary {
  reference_type: BackendReferenceType;
  reference_id: string;
  phase: "phase3" | "phase4" | "phase9";
  model_name: string;
  model_version: string;
  imbalance_strategy?: string | null;
  preprocessing_strategy?: string | null;
  dataset_id: string;
  dataset_fingerprint?: string | null;
  status: string;
  lifecycle_status?: string | null;
  threshold?: number | null;
  created_at?: string | null;
  completed_at?: string | null;
  primary_metric?: number | null;
  validation_metrics?: BackendHistoricalMetric | null;
  cross_validation?: BackendHistoricalCrossValidation | null;
  artifact_integrity_status: string;
  artifact_available: boolean;
  source_database: string;
  candidate_label?: string | null;
  curves?: Record<string, unknown> | null;
  training_duration_seconds?: number | null;
  inference_duration_seconds?: number | null;
}

export interface BackendHistoricalRunDetail extends BackendHistoricalRunSummary {
  configuration: Record<string, unknown>;
  hyperparameters: Record<string, unknown>;
  search_results: Array<Record<string, unknown>>;
  feature_importance: Array<Record<string, unknown>>;
  metrics: BackendHistoricalMetric[];
  artifacts: BackendHistoricalArtifact[];
  availability: BackendHistoricalAvailability[];
  provenance: string[];
  error_message?: string | null;
}

export interface BackendHistoricalOverviewResponse {
  evidence_version: string;
  training_runs: BackendHistoricalRunSummary[];
  experiments: BackendHistoricalRunSummary[];
  validation_comparison: BackendHistoricalRunSummary[];
  candidate_reference_id?: string | null;
  candidate_lifecycle_status?: string | null;
  candidate_label?: string | null;
  availability: BackendHistoricalAvailability[];
}

export interface BackendHistoricalRunListResponse {
  items: BackendHistoricalRunSummary[];
  total: number;
  page: number;
  page_size: number;
  availability: BackendHistoricalAvailability[];
}

export interface BackendHistoricalValidationComparisonResponse {
  evidence_version: string;
  normalization_version: string;
  items: BackendHistoricalRunSummary[];
  total: number;
  page: number;
  page_size: number;
  evaluation_scope: "validation";
  availability: BackendHistoricalAvailability[];
}

export interface BackendHistoricalValidationResponse {
  evidence_version: string;
  normalization_version: string;
  reference: BackendHistoricalRunSummary;
  metrics: BackendHistoricalMetric[];
  cross_validation?: BackendHistoricalCrossValidation | null;
  dataset_and_split?: Record<string, unknown> | null;
  curves?: Record<string, unknown> | null;
  feature_importance: Array<Record<string, unknown>>;
  artifacts: BackendHistoricalArtifact[];
  availability: BackendHistoricalAvailability[];
  provenance: string[];
}

export interface BackendHistoricalThresholdPoint {
  threshold: number;
  precision?: number | null;
  recall?: number | null;
  f1_score?: number | null;
  specificity?: number | null;
  false_positive?: number | null;
  false_negative?: number | null;
  true_positive?: number | null;
  true_negative?: number | null;
  business_cost?: number | null;
  source_reference: string;
}

export interface BackendHistoricalThresholdResponse {
  evidence_version: string;
  reference_id: string;
  model_name: string;
  model_version: string;
  calibration_method: string;
  frozen_threshold: number;
  selection_objective: string;
  selection_scope: string;
  validation?: BackendHistoricalMetric | null;
  threshold_points: BackendHistoricalThresholdPoint[];
  calibration_metrics: Record<string, number | null>;
  artifacts: BackendHistoricalArtifact[];
  availability: BackendHistoricalAvailability[];
  provenance: string[];
}

export interface BackendHistoricalCalibrationResponse {
  evidence_version: string;
  reference_id: string;
  model_name: string;
  model_version: string;
  selected_method: string;
  evaluation_scope: string;
  metrics: Record<string, number | null>;
  reliability_curve: Array<Record<string, unknown>>;
  artifacts: BackendHistoricalArtifact[];
  availability: BackendHistoricalAvailability[];
  provenance: string[];
}

export interface BackendOfficialTestEvidenceResponse {
  evidence_version: string;
  evaluation_id: string;
  candidate_id: string;
  candidate_label: string;
  evaluation_scope: "official_test";
  model_name: string;
  imbalance_strategy: string;
  calibration_method: string;
  frozen_threshold: number;
  metrics: BackendHistoricalMetric;
  confidence_intervals: Record<string, { lower: number; upper: number }>;
  confidence_interval_method?: string | null;
  confidence_interval_replicates?: number | null;
  calibration_metrics: Record<string, number | null>;
  reliability_curve: Array<Record<string, unknown>>;
  precision_recall_curve: Record<string, number[]>;
  roc_curve: Record<string, number[]>;
  integrity_flags: Record<string, boolean>;
  artifacts: BackendHistoricalArtifact[];
  availability: BackendHistoricalAvailability[];
  provenance: string[];
}
