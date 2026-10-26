# APS Intelligence Backend

FastAPI backend for the APS Intelligence application. Phase 7 extends the
Phase 6 trusted,
cached single-vehicle and bounded batch inference with persisted prediction
history on top of the Phase 5 validation-only threshold optimization,
training-only probability calibration and cost-sensitive decision-policy
comparison. The Phase 1 foundation, Phase 2 dataset engineering, Phase 3
model-training registry and Phase 4 controlled experiments remain the source
of model and preprocessing metadata. Prediction history does not retain the
170-value sensor payload by default, and the official APS test set is not
evaluated by the inference layer.

## Local setup

Python 3.11+ is supported. The repository was designed to work with a local
Python installation and does not require AWS configuration for development.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The interactive OpenAPI document is available at `http://127.0.0.1:8000/docs`.
The first implemented endpoint is:

```text
GET http://127.0.0.1:8000/api/v1/health
```

The default SQLite database is under `./data/` for local development. Large
datasets, model artifacts and reports belong in filesystem storage, not in
SQLite. The repository contains only directory markers; dataset contents,
trained models and generated reports are ignored by the root `.gitignore`.

## Persistent storage and AWS EBS

SQLite is the database engine; EBS is the persistent block storage layer used
by the EC2 deployment. They are separate concerns. In production, mount an EBS
volume and set every persistent path to that mount, for example:

```dotenv
PERSISTENT_STORAGE_DIR=/mnt/aps-intelligence
DATABASE_URL=sqlite:////mnt/aps-intelligence/aps_intelligence.db
DATASET_STORAGE_DIR=/mnt/aps-intelligence/datasets
MODEL_ARTIFACT_DIR=/mnt/aps-intelligence/artifacts/models
REPORT_STORAGE_DIR=/mnt/aps-intelligence/artifacts/reports
```

The logical storage layout is:

```text
datasets/
├── raw/          original CSV files; never modified by preprocessing
├── reference/    dataset documentation and reference files
├── processed/    generated, versioned preprocessing outputs
├── splits/       reproducible split metadata JSON
└── metadata/     dataset profile JSON artifacts

artifacts/
├── models/       offline-trained model artifacts and metadata
└── reports/      generated Phase 5 threshold/calibration reports and exports
```

The SQLite file, raw data, processed data, model artifacts and reports should
all be included in an operational backup plan for the EBS volume. Backups
should be scheduled, encrypted, retained according to project policy and
periodically restored to a separate volume to verify recovery. Do not rely on
instance-store or temporary filesystem paths for persistent application data.

For the local repository dataset layout, the original files are kept at
`backend/datasets/raw/aps_failure_training_set.csv`,
`backend/datasets/raw/aps_failure_test_set.csv` and
`backend/datasets/reference/aps_failure_description.txt`. They remain outside
Git tracking.

## Architecture

```text
app/main.py                 application factory, lifespan, middleware, errors
app/api/                    versioned router composition
app/core/                   settings, logging and application exceptions
app/schemas/                Pydantic request/response schemas
app/database/               SQLAlchemy engine, session dependency, metadata base
app/models/                 dataset, training-run, experiment and prediction metadata ORM models
app/repositories/           future persistence boundaries
app/services/dataset/       ingestion, profiling, preprocessing and splitting
app/services/model_training/ trainers, evaluation, artifacts and orchestration
app/services/experimentation/ controlled Phase 4 experiment execution/comparison
app/services/prediction/    trusted artifact resolution, inference cache and prediction persistence
app/services/registry.py    unified lineage, lifecycle, promotion and reproducibility checks
app/services/analytics.py   bounded dashboard, dataset, model and threshold analytics
app/services/reports.py     JSON, CSV and reusable evidence-PDF exports
app/utils/                  safe shared utilities
artifacts/models/           filesystem model artifacts, not database blobs
artifacts/reports/          generated reports and calibration artifacts, not database blobs
datasets/raw/               immutable source files, not database blobs
datasets/reference/         dataset documentation
datasets/processed/         generated preprocessing outputs
alembic/                    future schema migration scripts
tests/                      isolated foundation tests
```

The backend is a single FastAPI process intended for one EC2 instance and one
application user. No authentication, user management, Redis, Celery, Docker or
microservice split is introduced. Training requests return a queued registry
record and execute through FastAPI background tasks using a worker-local
database session; model binaries remain on persistent filesystem storage.

## Configuration

Configuration is defined in `app/core/config.py` and loaded from environment
variables or `.env`. Copy `.env.example` to `.env` for local development. The
important values are:

| Variable | Purpose | Local default |
| --- | --- | --- |
| `APP_NAME` | API display name | `APS Intelligence API` |
| `APP_VERSION` | API version metadata | `0.1.0` |
| `ENVIRONMENT` | Runtime environment label | `development` |
| `API_PREFIX` | Versioned API prefix | `/api/v1` |
| `BACKEND_HOST` / `BACKEND_PORT` | Uvicorn bind settings | `127.0.0.1:8000` |
| `PERSISTENT_STORAGE_DIR` | Local/EBS root for persistent runtime data | `./data` |
| `DATABASE_URL` | SQLAlchemy connection URL | `sqlite:///./data/aps_intelligence.db` |
| `ALLOWED_CORS_ORIGINS` | JSON list or comma-separated origins | localhost ports 3000 |
| `DATASET_STORAGE_DIR` | CSV filesystem directory | `./datasets` |
| `MODEL_ARTIFACT_DIR` | Offline model artifact directory | `./artifacts/models` |
| `REPORT_STORAGE_DIR` | Generated report directory | `./artifacts/reports` |
| `EXPECTED_FEATURE_COUNT` | Expected APS feature count | `170` |
| `TARGET_COLUMN_NAME` | Configured target column | `class` |
| `DEFAULT_CLASSIFICATION_THRESHOLD` | Frozen initial validation threshold | `0.5` |
| `FALSE_POSITIVE_COST` | Initial business-cost FP weight | `1.0` |
| `FALSE_NEGATIVE_COST` | Initial business-cost FN weight | `10.0` |
| `DEFAULT_PREDICTION_RUN_ID` | Explicit default completed training run for inference | unset |
| `DEFAULT_PREDICTION_EXPERIMENT_ID` | Explicit default completed experiment for inference | unset |
| `DEFAULT_PREDICTION_POLICY_ID` | Explicit default registered decision policy | unset |
| `PREDICTION_BATCH_MAX_SIZE` | Maximum records in one synchronous batch | `100` |
| `PREDICTION_MODEL_CACHE_SIZE` | Process-local LRU model/calibrator capacity | `8` |
| `LOG_LEVEL` | Server log level | `INFO` |

The current frontend `.env.example` points to `http://localhost:8000`, while
the backend routes are versioned under `/api/v1`. Before connecting the
frontend, either set `NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1`
or add the prefix in the shared frontend API client. This phase does not modify
working frontend functionality.

## Dataset engineering API

The Phase 2 dataset endpoints are implemented under `/api/v1/datasets`:

- `GET /api/v1/datasets` and `GET /api/v1/datasets/{dataset_id}` — registered metadata.
- `POST /api/v1/datasets/import` — import a custom CSV without changing the configured APS files.
- `GET /api/v1/datasets/{dataset_id}/profile` — feature, missing-value, class and quality profile.
- `GET /api/v1/datasets/{dataset_id}/quality` — duplicate, constant, invalid and infinite-value checks.
- `GET /api/v1/datasets/{dataset_id}/features` and `/features/{feature_name}` — paginated statistics and correlations.
- `GET /api/v1/datasets/{dataset_id}/missing-values` and `/class-distribution` — actual missingness and label counts.
- `POST /api/v1/datasets/{dataset_id}/preprocess` — training-only fitting and versioned CSV/Parquet artifacts.
- `GET /api/v1/datasets/{dataset_id}/splits` and `/preprocessing-status` — split fingerprints and run metadata.

The official APS test file is never used for preprocessing or split preparation.
Run the metadata migration before using these endpoints against a fresh SQLite
database:

```powershell
.venv\Scripts\python.exe -m alembic upgrade head
```

Measured APS source facts from the repository files on October 25, 2026:

- Training: 60,000 records, 59,000 `neg` and 1,000 `pos` (59.00:1).
- Official test: 16,000 records, 15,625 `neg` and 375 `pos` (41.67:1).
- Training features: 170; missing feature values: 850,015 across 169 features.
- Training quality scan: 0 duplicate rows, one constant feature (`cd_000`), no invalid or infinite values.

## Model training API

The Phase 3 model endpoints are implemented under `/api/v1/models`:

- `GET /api/v1/models` — supported model families, trainer versions and completed-run counts.
- `POST /api/v1/models/train` — queue one reproducible training run.
- `GET /api/v1/models/runs` — paginated training-run registry with model/status filters.
- `GET /api/v1/models/runs/{run_id}` and `/metadata` — run configuration, artifacts and metrics.
- `GET /api/v1/models/runs/{run_id}/status` — queued/running/completed/failed status.
- `GET /api/v1/models/runs/{run_id}/metrics` — standardized validation metrics.
- `GET /api/v1/models/versions/{model_name}` — available trainer/model versions.

Every training run uses the Phase 2 stratified training/validation split and fits
the preprocessing pipeline on the training partition only. The official APS
test file is rejected by the training service and is not loaded, transformed,
used for model selection or used for tuning. Class weighting is explicit and
recorded; no resampling is silently applied.

The standardized validation report uses PR-AUC (Average Precision) as the
primary ranking metric and also records ROC-AUC, precision, recall, F1, the
confusion matrix, TP/TN/FP/FN and an initial configurable business-cost estimate
at the frozen threshold. The cost is not a final optimized operating cost.

Model binaries, preprocessing pipelines, split metadata and JSON run metadata
are stored under `MODEL_ARTIFACT_DIR/training/<run_id>/`; SQLite stores only
registry metadata and artifact references. Apply all migrations before using a
fresh database:

```powershell
.venv\Scripts\python.exe -m alembic upgrade head
```

### Controlled APS training smoke test

On October 26, 2026, all four trainers were run once against the actual APS
training source with seed `42`, the existing stratified 80/20 split, balanced
class weighting, and a frozen threshold of `0.5`. The official test source was
not loaded by the training service. These are controlled smoke-test results,
not final experimental comparisons or optimized operating points.

| Model | PR-AUC | ROC-AUC | Precision | Recall | F1 | FP / FN | Initial cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Logistic Regression | 0.7223 | 0.9630 | 0.3584 | 0.9050 | 0.5135 | 324 / 19 | 514 |
| Random Forest | 0.8518 | 0.9932 | 0.7162 | 0.7950 | 0.7536 | 63 / 41 | 473 |
| XGBoost | 0.7478 | 0.9904 | 0.3282 | 0.9550 | 0.4885 | 391 / 9 | 481 |
| CatBoost | 0.7094 | 0.9894 | 0.2503 | 0.9700 | 0.3979 | 581 / 6 | 641 |

Each run used 48,000 training records and 12,000 validation records. The
initial cost uses FP=`1.0` and FN=`10.0`; those Phase 3 values are frozen
threshold-0.5 smoke results, not Phase 5 optimized policies.

## Experimentation API

The Phase 4 comparative experiment endpoints are implemented under
`/api/v1/experiments`:

- `POST /api/v1/experiments` — queue one model/imbalance/preprocessing experiment.
- `POST /api/v1/experiments/batch` — queue bounded model/strategy combinations.
- `GET /api/v1/experiments` — paginated experiment registry with filters.
- `GET /api/v1/experiments/{experiment_id}` — metrics, configuration, curves, importance and artifact references.
- `POST /api/v1/experiments/compare` — compare completed experiment IDs by standardized metrics.
- `GET /api/v1/experiments/{experiment_id}/configuration` — exact experiment/search configuration.
- `GET /api/v1/experiments/{experiment_id}/curves` — validation precision-recall and ROC curve coordinates.
- `GET /api/v1/experiments/{experiment_id}/feature-importance` — supported feature importance/coefficient values.

SMOTE is represented as an imbalanced-learn pipeline step after preprocessing,
so it is fitted only inside the training split or training cross-validation
folds. Validation and official test rows are never resampled. Class weighting
and SMOTE are mutually exclusive per experiment unless a future phase adds an
explicit combined strategy. CatBoost hyperparameter search uses the same
stratified PR-AUC objective through a clone-safe bounded search implementation.

### Controlled APS Phase 4 results

The following results were measured on October 26, 2026 using the actual APS
training source, seed `42`, the existing stratified 80/20 split, threshold `0.5`,
FP cost `1.0`, FN cost `10.0`, and 48,000 training/12,000 validation records.
They are validation experiments, not final test results, optimized thresholds or
final business-cost claims. The official APS test source was not loaded.

#### Imbalance strategy comparison

Each row uses the same model family, fixed model budget and split while changing
only the imbalance strategy. Native missing-value handling was used for the
original/class-weighted XGBoost and CatBoost runs; SMOTE runs used median
imputation because native missing-value handling is incompatible with SMOTE.

| Model | Strategy | PR-AUC | ROC-AUC | Precision | Recall | F1 | FP / FN | Initial cost |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Logistic Regression | Original | 0.7554 | 0.9824 | 0.7288 | 0.6450 | 0.6844 | 48 / 71 | 758 |
| Logistic Regression | Class weight | 0.7223 | 0.9630 | 0.3584 | 0.9050 | 0.5135 | 324 / 19 | 514 |
| Logistic Regression | SMOTE | 0.7156 | 0.9515 | 0.3590 | 0.8850 | 0.5108 | 316 / 23 | 546 |
| Random Forest | Original | 0.8776 | 0.9897 | 0.8667 | 0.7150 | 0.7836 | 22 / 57 | 592 |
| Random Forest | Class weight | 0.8518 | 0.9932 | 0.7162 | 0.7950 | 0.7536 | 63 / 41 | 473 |
| Random Forest | SMOTE | 0.8113 | 0.9952 | 0.6395 | 0.8250 | 0.7205 | 93 / 35 | 443 |
| XGBoost | Original | 0.8277 | 0.9931 | 0.8551 | 0.5900 | 0.6982 | 20 / 82 | 840 |
| XGBoost | Class weight | 0.7478 | 0.9904 | 0.3282 | 0.9550 | 0.4885 | 391 / 9 | 481 |
| XGBoost | SMOTE | 0.6529 | 0.9854 | 0.3755 | 0.9200 | 0.5333 | 306 / 16 | 466 |
| CatBoost | Original | 0.8115 | 0.9904 | 0.8682 | 0.5600 | 0.6809 | 17 / 88 | 897 |
| CatBoost | Class weight | 0.7094 | 0.9894 | 0.2503 | 0.9700 | 0.3979 | 581 / 6 | 641 |
| CatBoost | SMOTE | 0.6945 | 0.9904 | 0.3287 | 0.9450 | 0.4877 | 386 / 11 | 496 |

#### Bounded APS hyperparameter search

Each search used `search_budget=2`, two stratified folds and PR-AUC scoring on
training folds only. The reported final metrics are from the refit candidate on
the fixed validation split.

| Model | Best parameters | Validation PR-AUC | ROC-AUC | Initial cost | Search status |
| --- | --- | ---: | ---: | ---: | --- |
| Logistic Regression | `C=0.5` | 0.7276 | 0.9721 | 502 | completed |
| Random Forest | `n_estimators=200, max_depth=32, min_samples_leaf=5` | 0.8382 | 0.9920 | 326 | completed |
| XGBoost | `subsample=0.8, n_estimators=200, max_depth=5, learning_rate=0.03, colsample_bytree=0.8` | 0.8438 | 0.9942 | 335 | completed |
| CatBoost | `iterations=200, depth=4, learning_rate=0.05, l2_leaf_reg=1.0` | 0.7744 | 0.9930 | 507 | completed |

#### APS missing-value strategy comparison

These runs hold Logistic Regression, class weighting, seed, split and threshold
constant while varying preprocessing. Native handling is not applicable to
Logistic Regression and was therefore not included in this comparison.

| Preprocessing | PR-AUC | ROC-AUC | Precision | Recall | F1 | Initial cost |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Median | 0.7223 | 0.9630 | 0.3584 | 0.9050 | 0.5135 | 514 |
| Mean | 0.7256 | 0.9701 | 0.3515 | 0.9050 | 0.5063 | 524 |
| Constant (`0.0`) | 0.7283 | 0.9594 | 0.3658 | 0.9200 | 0.5235 | 479 |
| Missingness indicators | 0.7278 | 0.9672 | 0.3389 | 0.9200 | 0.4953 | 519 |

These measured results do not select a final production model or threshold.
Phase 5 adds validation-only threshold optimization, calibration and
decision-policy comparisons; official-test evaluation remains deferred.

## Phase 5 threshold, calibration and decision-policy API

Threshold `0.5` is a useful default, not a universal operating point. With a
rare positive class, a small threshold change can trade many false positives
for missed failures. Phase 5 evaluates a bounded threshold grid on the
existing validation split and records the explicit objective:

- `minimum_cost` minimizes
  `total_cost = (FP * false_positive_cost) + (FN * false_negative_cost)`.
- `maximum_f1` selects the highest F1-score.
- `minimum_recall` selects the lowest threshold meeting `required_recall`.
- `maximum_precision` selects the highest precision among candidates meeting
  `required_recall`.

The default illustrative costs are FP=`1.0` and FN=`10.0`. They are
configurable assumptions, not measured Scania operating costs. Minimum-cost
ties are deterministic: higher recall wins, then the lower threshold. Every
threshold point records precision, recall, F1, specificity, false-positive and
false-negative rates, TP/TN/FP/FN, PR-AUC, ROC-AUC, total cost and average cost
per validation record.

### Leakage-safe calibration

Calibration is fitted after the existing model/experiment artifact is loaded.
The calibrator uses an internal calibration split derived only from the
training portion. Validation labels are used only after fitting to evaluate
uncalibrated probabilities, sigmoid/Platt scaling and isotonic regression.
The official test file is never loaded by these services. Isotonic regression
is skipped and reported as `insufficient_sample` when its bounded calibration
sample does not meet the configured record/class minimums.

PR-AUC and ROC-AUC describe ranking quality. Brier score, log loss and the
reliability curve describe probability quality; calibration can change
probability values without improving either ranking metric. Expected
calibration error, when returned, uses uniform-width `[0, 1]` bins and a
sample-weighted absolute difference between mean predicted probability and
observed failure rate in each non-empty bin.

### Endpoints

All routes are under `/api/v1` and accept/return Pydantic v2 contracts:

```text
POST /thresholds/{reference_id}/analyze
GET  /thresholds/{reference_id}
GET  /thresholds/{reference_id}/curve
POST /thresholds/{reference_id}/compare

POST /calibration/{reference_id}/compare
GET  /calibration/{reference_id}
GET  /calibration/{reference_id}/metrics
GET  /calibration/{reference_id}/reliability

POST /decision-policies/{reference_id}/compare
GET  /decision-policies/{reference_id}
```

`reference_id` may be a completed Phase 3 training run or Phase 4 experiment
run. For example, a minimum-cost threshold analysis with a nine-point grid is:

```powershell
$body = @{
  threshold_min = 0.1
  threshold_max = 0.9
  threshold_candidates = 9
  objective = "minimum_cost"
  false_positive_cost = 1.0
  false_negative_cost = 10.0
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/api/v1/thresholds/exp-.../analyze -ContentType "application/json" -Body $body
```

Phase 5 writes machine-readable threshold curves and policy-comparison JSON,
serialized calibrators and SVG charts under
`REPORT_STORAGE_DIR/phase5/<reference_id>/`. The API returns logical
artifact names rather than exposing local filesystem paths. Artifact metadata
includes the run ID, model/version, dataset fingerprint, split identifier,
random seed, validation size, calibration method, objective, threshold grid,
cost assumptions and validation-selection caveat.

No Alembic migration is required for Phase 5: provenance and policy metadata
are persisted in the existing filesystem artifact convention and reference the
existing training/experiment registry rows.

### Reproduce the analysis

1. Apply migrations and install the backend requirements.
2. Run a completed training or comparative experiment using the existing
   training/validation split.
3. Call threshold analysis with a bounded grid and explicit objective/costs.
4. Call calibration comparison with the desired internal calibration ratio and
   minimum sample/class safeguards.
5. Call decision-policy comparison to compare default, cost-optimal and (when
   configured) recall-constrained policies.
6. Freeze the chosen model, calibration method and threshold before any later
   official-test evaluation.

All reported Phase 5 APS values are validation results. Validation-selected
thresholds and metrics may be optimistic; no final winning model or production
policy is declared in this phase.

## Phase 6 prediction and inference API

Phase 6 resolves only completed model or experiment registry rows and their
server-side artifact paths. Clients cannot submit filesystem paths. A model
reference is explicit unless `DEFAULT_PREDICTION_RUN_ID` or
`DEFAULT_PREDICTION_EXPERIMENT_ID` names a valid completed registry row. The
feature contract is read from the selected artifact metadata and its exact
ordering is used for inference; the configured count defaults to 170.

### Endpoints

```text
GET  /api/v1/predictions/models
GET  /api/v1/predictions/policies
POST /api/v1/predictions/policies
GET  /api/v1/predictions/models/{training_run|experiment}/{id}/features
POST /api/v1/predictions
POST /api/v1/predictions/batch
GET  /api/v1/predictions
GET  /api/v1/predictions/{prediction_id}
```

`POST /api/v1/predictions/policies` registers a named row from a trusted
Phase 5 `decision_policies.json` artifact. For calibrated policies, the
corresponding completed Phase 5 calibration comparison and serialized
calibrator must exist under `REPORT_STORAGE_DIR/phase5/<reference_id>/`.
Registration stores the model reference, model version, threshold, calibration
method and artifact reference together so a policy cannot be combined with a
different run.

The single-prediction request has this shape; the feature object must contain
all 170 names returned by the feature-schema endpoint (the names below are
placeholders, not APS results):

```json
{
  "model_run_id": "run-<registered-id>",
  "decision_policy_id": "policy-<registered-id>",
  "features": {
    "<feature-1>": 0.0,
    "<feature-2>": null,
    "...": "<remaining feature values>"
  },
  "vehicle_identifier": "vehicle-optional",
  "request_reference": "client-reference-optional",
  "include_explanation": true
}
```

Sensor values must be strict JSON numbers or `null`; strings, objects, arrays,
NaN and infinity are rejected. `null` is converted to a missing numeric value
only when the selected preprocessing/model artifact accepts it. Feature-name
errors report missing and unexpected names separately. The response includes
the threshold actually applied, calibration method, `pos`/`neg` class,
probability, risk classification, timestamp, inference duration and optional
global feature-importance context. `high` means the selected threshold
predicted `pos`; `low` means it predicted `neg`. No intermediate risk band is
claimed. A returned probability is a model estimate, not a guaranteed
real-world failure probability, and global importance is not a per-record
causal explanation.

Batch requests use the same model, preprocessing, calibration and policy for
every record, preserve input indexes, return per-record validation errors and
include positive/negative counts plus total and average model-inference time.
The maximum size is bounded by `PREDICTION_BATCH_MAX_SIZE` (100 by default).
Prediction history is persisted in SQLite without the full sensor payload and
supports page/page_size, model reference, class, vehicle identifier and date
range filters. Database errors use the existing safe error envelope.

The model/calibrator cache is process-local and LRU-bounded. Cache keys include
the trusted reference, model version and artifact modification signature, so a
changed artifact receives a new cache entry; `InferenceCache` also exposes
explicit model, policy and full-cache invalidation for deployment workflows.
Artifacts are loaded only from configured directories and registry paths, and
serialized artifact failures are returned as safe availability or compatibility
errors without pickle/joblib internals.

### Phase 6 validation status

The Phase 6 tests use small synthetic estimators and records only. They cover
schema validation, missing values, model loading failures, compatibility,
cache invalidation, thresholds, calibration, batch handling, persistence,
history and safe errors. The local ignored runtime directory does not provide a
valid registered production model/policy pair for this inference flow, so no
real APS prediction was reported and no official APS test-set evaluation was
performed. Restore genuine trained artifacts and registry rows before calling
this API with production APS records.

## Phase 7 experiment history, model registry and reproducibility

Phase 7 extends the existing Phase 3/4 training and experiment registries and
the Phase 6 prediction/policy records. It does not create a second experiment
history. Each new run records a stable configuration fingerprint, split
identifier, dependency-version snapshot, lifecycle state and SHA-256 checksums
for its known filesystem artifacts. Large model, dataset and report files
remain on persistent filesystem storage; SQLite stores metadata and checksums.

### Registry and lineage endpoints

```text
GET  /api/v1/models/registry
GET  /api/v1/models/registry/versions/{model_name}
GET  /api/v1/models/registry/{training_run|experiment}/{id}
GET  /api/v1/models/registry/{training_run|experiment}/{id}/lineage
GET  /api/v1/models/registry/{training_run|experiment}/{id}/artifacts
GET  /api/v1/models/registry/{training_run|experiment}/{id}/reproducibility
POST /api/v1/models/registry/{training_run|experiment}/{id}/lifecycle
GET  /api/v1/models/promotions
POST /api/v1/models/registry/{training_run|experiment}/{id}/promote
POST /api/v1/models/promotions/{promotion_id}/revert
```

The registry list is paginated and supports model, execution/lifecycle status,
dataset and date filters. Registry detail and lineage return dataset
fingerprints, split metadata, preprocessing/configuration metadata, model
version, dependency versions, policy associations and prediction counts without
returning local filesystem paths. The existing Phase 4 experiment comparison
and Phase 6 prediction-history routes remain the source APIs for those records.

Lifecycle execution status (`queued`, `running`, `completed`, `failed`) is kept
separate from registry lifecycle (`registered`, `trained`, `evaluated`,
`eligible`, `approved`, `archived`, `failed`). A model cannot become trained,
evaluated or eligible unless its execution, metrics and registered artifacts
meet the corresponding checks. Archive operations retain database lineage and
filesystem artifacts; no destructive cleanup is performed.

Promotion is explicit and reversible. It requires an eligible model, a
compatible registered decision policy, verified artifacts, explicit genuine APS
evaluation confirmation and evidence. The active promotion is the only
database-backed default selection used when no environment default is set;
previous selections remain in promotion history and can be reverted. Synthetic
fixtures and synthetic experiment results are rejected from production
promotion. No production-approved model is currently claimed for APS.

Artifact inventory verifies stored SHA-256 checksums and reports missing,
mismatched or unverified artifacts without exposing paths. Prediction records
retain the exact model reference/version, configuration fingerprint, policy
version, calibration reference/checksum and applied threshold, so later
promotion cannot reinterpret historical predictions.

Reproducibility verification checks the recorded configuration and split
identifiers, dataset registry/fingerprint and source-file availability,
artifact checksums and dependency versions. It never retrains and never loads
the official APS test dataset. Missing source data or dependency mismatches are
reported as structured blockers. A configuration fingerprint supports stable
comparison of equivalent configurations and excludes generated IDs and
timestamps; it is configuration reproducibility, not a guarantee of
bit-for-bit equality across hardware or library versions.

The local Phase 7 tests use synthetic registry metadata and files only. They do
not represent APS model quality, do not select a production model and do not
evaluate the official APS test set. Genuine APS data and a completed approved
evaluation remain prerequisites for any real promotion.

## Phase 8 analytics, reports and frontend-facing contracts

Phase 8 consolidates recorded Phase 2–7 information for frontend-facing use.
It does not rerun experiments, load models for dashboard display, load the
official APS test dataset or invent missing metrics.

### Analytics endpoints

```text
GET /api/v1/analytics/dashboard
GET /api/v1/analytics/datasets/{dataset_id}
GET /api/v1/analytics/models/comparison
GET /api/v1/analytics/thresholds
GET /api/v1/analytics/thresholds/{reference_id}
```

The dashboard returns dataset metadata, registry counts, lifecycle counts,
promotion state, production prediction counts, recent activity, latest
validation metrics, artifact-integrity counts and reproducibility metadata.
Metric records are explicitly scoped as `validation`, `official_test`,
`synthetic` or `production`. The current backend returns no official-test
metrics unless a future controlled evaluation records them, and no production
approval is shown without an explicit Phase 7 promotion.

Dataset analytics reads persisted profile and split artifacts when present,
returns source-file availability separately and paginates feature statistics.
Model comparison returns the four supported model families, actual recorded
runs, split identifiers, validation metrics, confusion counts, cost
assumptions, durations, curves and feature importance when their artifacts are
available. Different validation splits remain visibly identified rather than
being silently merged. Threshold analytics reads the Phase 5 threshold,
calibration and decision-policy JSON artifacts without duplicating optimization
logic; missing artifacts produce structured availability notes.

### Reports and exports

```text
GET /api/v1/exports/experiments/{training_run|experiment}/{id}.json
GET /api/v1/exports/experiments/{training_run|experiment}/{id}.csv
GET /api/v1/reports/experiments/{training_run|experiment}/{id}.pdf
GET /api/v1/exports/models/comparison.csv
GET /api/v1/exports/predictions.csv
```

JSON and CSV exports contain persisted registry/validation data only. Prediction
CSV exports are bounded and support date, model and class filters. The PDF is a
reusable experiment evidence report with dataset fingerprints, configuration,
validation results, threshold/calibration availability, reproducibility and
limitations. It is not a fabricated final academic report. Export references
are validated, filenames are safe, local paths and secrets are not returned,
and exports use attachment content types.

The frontend integration boundary is the versioned API prefix. Configure the
frontend environment with:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

The existing frontend service files currently point at demonstration or legacy
paths. The Phase 8 canonical mapping is: dashboard to
`/analytics/dashboard`; Dataset Explorer to `/datasets` plus
`/analytics/datasets/{id}`; model comparison to `/analytics/models/comparison`;
threshold workspace to `/analytics/thresholds/{id}`; experiment history to the
existing `/experiments` and Phase 7 `/models/registry` routes; prediction
workspace to the Phase 6 `/predictions` routes; and report buttons to the
export/report routes above. This phase prepares contracts and does not wire the
Next.js pages to live data.

All errors retain the existing `{ "error": { "code", "message", "details" } }`
envelope. Timestamps are UTC-naive ISO values as already used by the backend
database/API contracts; clients should render them as UTC. Pagination uses
`page`, `page_size`, `total` and `items`.

## Academic evaluation guardrails

The 15-mark mini-project requirements are architecture constraints for later
phases, not claims that Phase 1 has already implemented ML behavior:

- **Data cleaning and splitting (3 marks):** later dataset services must report
  missingness, duplicates and invalid records; keep missing-value strategies
  explicit; prevent leakage; and isolate the official test file from training
  and validation selection.
- **Model comparison (4 marks):** later experiment services must compare
  Logistic Regression, Random Forest, XGBoost and CatBoost using PR-AUC as the
  primary metric plus precision, recall, F1, confusion counts and configurable
  `FP`/`FN` business cost. SMOTE must run on training data only. Validation data
  selects models and thresholds; the official test set is evaluated only after
  the threshold is frozen.
- **UI deployment and accessibility (4 marks):** the existing Next.js app and
  FastAPI service are intended to run behind one EC2 deployment. Future phases
  must preserve desktop/tablet/mobile layouts, API error states and keyboard or
  screen-reader checks.
- **Code quality and submission (4 marks):** future phases must keep automated
  tests, reproducible configuration snapshots, meaningful commits, a final
  10-page report, at least five recent research papers, references and clearly
  labelled charts/tables.

Phase 6 provides individual and batch prediction infrastructure, but does not
select a final model or policy automatically. Phase 5 threshold and calibration
outputs remain validation artifacts until an explicit policy is registered.
Phase 4 controlled SMOTE comparison and Phase 5 policy comparison do not make
a final production selection.

## Implemented API

### `GET /api/v1/health`

Returns process/API readiness metadata. No production dataset or model data is
read.

Response `200`:

```json
{
  "status": "ok",
  "application_name": "APS Intelligence API",
  "application_version": "0.1.0",
  "environment": "development",
  "api_status": "operational"
}
```

## Proposed API contract mapping

The frontend service files under `frontend/services/` are proposed boundaries,
not proof that these backend endpoints exist. The backend contract below is the
starting point for later implementation. Request and response names should be
kept aligned with `frontend/types/analytics.ts`, while backend-specific fields
may be added when their provenance is real.

| Method and path | Purpose | Proposed request | Proposed response | Statuses |
| --- | --- | --- | --- | --- |
| `GET /api/v1/health` | Service readiness | None | `HealthResponse` | `200`, `500` |
| `GET /api/v1/dashboard/overview` | Overview analytics | Optional dataset/model filters | `DashboardSnapshot` | `200`, `404`, `503` |
| `GET /api/v1/datasets` | Dataset metadata registry | Optional dataset type/status filters | `DatasetMetadata[]` | `200`, `503` |
| `POST /api/v1/datasets/upload` | Store and register a CSV | Multipart `file`, `dataset_type` | `DatasetUploadResponse` | `201`, `400`, `413`, `415`, `422` |
| `GET /api/v1/models` | List available offline artifacts | Optional status filter | `PredictionModelOption[]` or model metadata list | `200`, `503` |
| `GET /api/v1/models/compare` | Compare evaluated artifacts | Optional model IDs and evaluation split | `ModelComparisonSnapshot` | `200`, `404`, `503` |
| `POST /api/v1/predictions` | Predict one sensor row | `PredictionRequest` with trusted model/policy reference and feature map | `PredictionResponse` | `201`, `400`, `404`, `409`, `422`, `503` |
| `POST /api/v1/predictions/batch` | Predict bounded sensor records | JSON records plus trusted model/policy reference | `BatchPredictionResponse` | `200`, `400`, `409`, `413`, `422`, `503` |
| `GET /api/v1/predictions` | Prediction history | Pagination and filters | `PredictionResult[]` plus pagination metadata | `200`, `503` |
| `GET /api/v1/thresholds/{model_id}` | Get threshold curve/recommendations | Optional cost weights and split | Threshold evaluation snapshot/curve | `200`, `404`, `422`, `503` |
| `POST /api/v1/thresholds/evaluate` | Evaluate one operating point | Model ID, threshold, cost weights, validation split | `ThresholdMetrics` with dataset/source metadata | `200`, `400`, `404`, `422`, `503` |
| `GET /api/v1/experiments` | Search experiment registry | Query, filters, sorting, pagination | `ExperimentRegistrySnapshot` or paginated registry | `200`, `503` |
| `POST /api/v1/experiments` | Save/start an experiment configuration | `ExperimentCreationRequest` | Queued `ExperimentHistoryRecord` or configuration resource | `201`, `400`, `404`, `422`, `503` |
| `GET /api/v1/experiments/{experiment_id}` | Retrieve experiment details | Path ID | `ExperimentHistoryRecord` | `200`, `404` |

### Additional frontend-proposed routes

The current frontend also defines service calls for:

- `GET /api/v1/experiments/{id}/results`
- `POST /api/v1/experiments/compare`
- `GET /api/v1/experiments/{id}/configuration`
- `GET /api/v1/experiments/{id}/report?format=pdf|json`
- `GET /api/v1/thresholds/models`
- `GET /api/v1/thresholds/{model_id}/curve`
- `GET /api/v1/thresholds/{model_id}/recommendations`
- `GET /api/v1/calibration/{model_id}`

These need to be reconciled with the shorter Phase 1 list before the relevant
backend phases. In particular, `POST /experiments` must decide whether it saves
only a configuration or also queues execution; this foundation makes no such
claim. Pagination envelope fields, dataset fingerprint provenance, model
artifact versioning and report content negotiation also remain decisions for
the implementation phases.

## Error response contract

Errors use a stable envelope without stack traces:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": []
  }
}
```

Validation errors use `422`; invalid semantic requests use `400`; missing
resources use `404`; database failures and unexpected failures use `500`.
Internal details are logged server-side and are not returned in production
responses.

## Checks

From `backend/`:

```powershell
pytest
python -c "from app.main import app; print(app.title)"
```

The foundation tests use isolated temporary SQLite URLs and do not require
production datasets, trained model files or network services.

Phase 3 and Phase 4 tests use small synthetic imbalanced datasets. The complete
test suite does not train all four models on the full APS dataset; the APS
results above come from separate controlled smoke scripts.
