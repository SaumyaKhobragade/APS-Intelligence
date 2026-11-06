# APS Intelligence — Backend API & ML Service

High-performance FastAPI service and scientific machine-learning pipeline for industrial failure prediction and reliability analytics on the Scania Trucks Air Pressure System (APS) dataset.

---

## Service Overview

The backend service coordinates dataset engineering, model training, controlled comparative experimentation, cost-sensitive threshold optimization, probability calibration, and live inference.

### Core Architecture Tenets
- **Data Leakage Prevention**: Preprocessing transformations (imputation, scaling, resampling) fit exclusively on training partitions; validation and official test sets are strictly isolated.
- **Extreme Imbalance Handling**: Supports explicit cost-adjusted class weighting and training-only SMOTE resampling for the 59:1 negative-to-positive failure ratio.
- **Cost-Sensitive Decision Making**: Evaluates asymmetric operational cost functions where missed vehicle breakdowns ($C_{\text{FN}}$) heavily penalize the fleet compared to unnecessary workshop checks ($C_{\text{FP}}$).
- **Probability Calibration**: Corrects distorted classifier outputs using Isotonic Regression and Platt Sigmoid scaling, backed by Brier score, log loss, and Expected Calibration Error (ECE) auditing.
- **Separation of Concerns**: SQLite provides transactional registry and lineage tracking; all large CSV datasets, serialized model binaries (`.joblib`), and generated analytical exports reside on persistent filesystem/EBS storage.

---

## Local Setup & Quickstart

Python 3.11+ is supported. Local development uses a local virtual environment and SQLite.

```powershell
# Navigate to backend
cd backend

# Create and activate virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

# Copy environment template
Copy-Item .env.example .env

# Apply Alembic schema migrations
alembic upgrade head

# Start API service with hot reload
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Interactive Swagger UI**: `http://127.0.0.1:8000/docs`
- **ReDoc Documentation**: `http://127.0.0.1:8000/redoc`
- **Readiness Probe**: `GET http://127.0.0.1:8000/api/v1/health`

---

## Directory & Package Structure

```text
backend/
├── alembic/                    # Database schema migration scripts and environment
│   └── versions/               # Idempotent schema migration revisions
├── app/
│   ├── main.py                 # FastAPI application factory, lifespan hooks, CORS, error handlers
│   ├── api/v1/                 # Versioned REST routers
│   │   ├── endpoints/          # datasets, models, experiments, predictions, thresholds, etc.
│   │   └── router.py           # Centralized v1 router assembly
│   ├── core/                   # Configuration settings, logging, custom exceptions
│   ├── database/               # SQLAlchemy engine, session maker, connection lifecycle
│   ├── models/                 # SQLAlchemy ORM entity definitions
│   │   ├── dataset.py          # Dataset records, profile snapshots, split metadata
│   │   ├── training.py         # Model training runs, artifact references, validation metrics
│   │   ├── experiment.py       # Controlled comparative experiment configurations and curves
│   │   └── prediction.py       # Decision policies, prediction audit logs, active promotions
│   ├── schemas/                # Pydantic v2 validation contracts for requests and responses
│   ├── services/               # Business logic and scientific ML pipelines
│   │   ├── dataset/            # Ingestion, profiling, quality scans, leakage-safe preprocessors
│   │   ├── model_training/     # Estimator trainers (LR, RF, XGBoost, CatBoost), evaluation
│   │   ├── experimentation/    # Grid search, cross-validation, imbalance strategy runners
│   │   ├── prediction/         # Trusted artifact resolver, inference cache, batch evaluator
│   │   ├── registry.py         # Model lineage, lifecycle management, reproducibility checks
│   │   ├── analytics.py        # Dashboard rollups, dataset profiles, threshold summaries
│   │   └── reports.py          # PDF evidence generation, CSV and JSON data exports
│   └── utils/                  # Filesystem path helpers, JSON serializers, hashing utilities
├── artifacts/                  # Persisted artifacts (excluded from Git)
│   ├── models/                 # Serialized joblib pipelines, preprocessors, metadata JSONs
│   └── reports/                # Calibration reports, reliability charts, PDF exports
├── data/                       # Local SQLite databases (aps_intelligence.db)
├── datasets/                   # Raw CSVs, processed partitions, split fingerprints
├── scripts/                    # Validation benchmarks, official test runner, DB utilities
├── tests/                      # Automated test suite (unit, integration, contracts)
├── requirements.txt            # Locked Python dependencies
└── README.md                   # This documentation
```

---

## Configuration Reference

Configuration is managed in `app/core/config.py` using Pydantic Settings. Values are read from `.env` or system environment variables:

| Variable | Description | Default |
|:---|:---|:---|
| `APP_NAME` | Service display title | `APS Intelligence API` |
| `APP_VERSION` | Semantic version string | `0.1.0` |
| `ENVIRONMENT` | Environment label (`development`, `production`, `test`) | `development` |
| `API_PREFIX` | Versioned route prefix | `/api/v1` |
| `BACKEND_HOST` / `BACKEND_PORT` | Uvicorn network bind settings | `127.0.0.1:8000` |
| `PERSISTENT_STORAGE_DIR` | Root directory for persistent data | `./data` |
| `DATABASE_URL` | SQLAlchemy connection string | `sqlite:///./data/aps_intelligence.db` |
| `ALLOWED_CORS_ORIGINS` | Permitted browser origins (wildcard `*` rejected in production) | `["http://localhost:3000"]` |
| `DATASET_STORAGE_DIR` | Filesystem storage for raw/processed CSVs | `./datasets` |
| `MODEL_ARTIFACT_DIR` | Storage root for serialized ML pipelines | `./artifacts/models` |
| `REPORT_STORAGE_DIR` | Storage root for analytical charts and exports | `./artifacts/reports` |
| `MAX_DATASET_UPLOAD_BYTES` | Maximum incoming dataset upload size | `52428800` (50 MiB) |
| `EXPECTED_FEATURE_COUNT` | Enforced sensor feature count | `170` |
| `TARGET_COLUMN_NAME` | Ground-truth binary target label | `class` |
| `DEFAULT_CLASSIFICATION_THRESHOLD` | Uncalibrated baseline threshold | `0.5` |
| `FALSE_POSITIVE_COST` | Cost weight for false alarms ($C_{\text{FP}}$) | `1.0` |
| `FALSE_NEGATIVE_COST` | Cost weight for missed breakdowns ($C_{\text{FN}}$) | `10.0` |
| `PREDICTION_BATCH_MAX_SIZE` | Maximum records permitted in a synchronous batch | `100` |
| `PREDICTION_MODEL_CACHE_SIZE` | LRU cache capacity for in-memory model pipelines | `8` |
| `LOG_LEVEL` | Minimum log severity | `INFO` |

---

## Dataset Engineering & Quality Profiling API

Located at `/api/v1/datasets`:

- `GET /api/v1/datasets`: Paginated registry of tracked datasets.
- `GET /api/v1/datasets/{dataset_id}`: Metadata, record counts, and partition status.
- `POST /api/v1/datasets/upload`: Stream-upload custom CSV datasets with 50 MiB limit and byte-level validation.
- `GET /api/v1/datasets/{dataset_id}/profile`: Statistical summary across all 170 sensor features.
- `GET /api/v1/datasets/{dataset_id}/quality`: Data hygiene audit (duplicate rows, constant channels like `cd_000`, invalid strings).
- `GET /api/v1/datasets/{dataset_id}/features`: Paginated feature metrics (missingness rate, min, max, mean, variance).
- `GET /api/v1/datasets/{dataset_id}/missing-values`: Distribution of missing values across sensor groups.
- `GET /api/v1/datasets/{dataset_id}/class-distribution`: Ratio between negative and positive records.
- `POST /api/v1/datasets/{dataset_id}/preprocess`: Executes training-partition fitting and generates versioned partitions.
- `GET /api/v1/datasets/{dataset_id}/splits`: Reproducible train/validation partition definitions with SHA-256 fingerprints.

### Benchmark Data Characteristics
- **Training Set**: 60,000 records (59,000 `neg`, 1,000 `pos` — 59:1 imbalance).
- **Official Test Set**: 16,000 records (15,625 `neg`, 375 `pos` — 41.67:1 imbalance).
- **Feature Width**: 170 numerical sensor channels (`aa_000` through `ee_009`).
- **Data Quality**: 0 duplicate rows, 1 constant column (`cd_000`), 850,015 missing values across 169 features.

---

## Model Training & Execution Registry API

Located at `/api/v1/models`:

- `GET /api/v1/models`: Supported estimator families, trainer versions, and run tallies.
- `POST /api/v1/models/train`: Queue a background model-training run.
- `GET /api/v1/models/runs`: Paginated training-run registry with model family and status filters.
- `GET /api/v1/models/runs/{run_id}`: Detailed run configuration, hyperparameters, and artifact hashes.
- `GET /api/v1/models/runs/{run_id}/status`: Real-time lifecycle status (`queued`, `running`, `completed`, `failed`).
- `GET /api/v1/models/runs/{run_id}/metrics`: Standardized validation performance metrics.
- `GET /api/v1/models/versions/{model_name}`: Version history for a specific model family.

### Model Families & Baseline Benchmark Results

All models evaluated on the stratified 80/20 training split (48,000 train / 12,000 validation), using random seed `42` and explicit class weighting:

| Model Family | Primary Metric: PR-AUC | ROC-AUC | Precision | Recall | F1-Score | FP / FN | Illustrative Cost ($C_{\text{FP}}=1, C_{\text{FN}}=10$) |
|:---|---:|---:|---:|---:|---:|---:|---:|
| **Logistic Regression** | 0.7223 | 0.9630 | 0.3584 | 0.9050 | 0.5135 | 324 / 19 | 514 |
| **Random Forest** | 0.8518 | 0.9932 | 0.7162 | 0.7950 | 0.7536 | 63 / 41 | 473 |
| **XGBoost** | 0.7478 | 0.9904 | 0.3282 | 0.9550 | 0.4885 | 391 / 9 | 481 |
| **CatBoost** | 0.7094 | 0.9894 | 0.2503 | 0.9700 | 0.3979 | 581 / 6 | 641 |

*Note: PR-AUC is the definitive ranking metric under extreme imbalance. High ROC-AUC (>0.96) masks large false-positive volumes that would overwhelm workshop capacity.*

---

## Comparative Experimentation & Imbalance Strategy API

Located at `/api/v1/experiments`:

- `POST /api/v1/experiments`: Launch a controlled experiment comparing model, imbalance, and preprocessing strategies.
- `POST /api/v1/experiments/batch`: Queue combinatorial grids of models and sampling strategies.
- `GET /api/v1/experiments`: Paginated experiment execution registry.
- `GET /api/v1/experiments/{experiment_id}`: Metrics, hyperparameters, curves, and artifact references.
- `POST /api/v1/experiments/compare`: Structured comparison across multiple completed experiment runs.
- `GET /api/v1/experiments/{experiment_id}/curves`: Coordinate points for validation PR and ROC curves.
- `GET /api/v1/experiments/{experiment_id}/feature-importance`: Top sensor importance scores or regression coefficients.

### Imbalance Strategy Handling
- **Balanced Class Weighting**: Calculates inverse-frequency weights strictly from training folds and injects them directly into estimator loss functions.
- **In-Pipeline SMOTE**: Built into `imblearn.pipeline.Pipeline`. Synthetic samples are generated strictly during the training fit step and never contaminate validation folds or test benchmarks.

---

## Cost-Sensitive Threshold Optimization & Calibration API

Standard 0.5 decision thresholds fail when class frequencies and error costs are asymmetric. These endpoints evaluate custom operating thresholds and calibrated probabilities.

- `POST /api/v1/thresholds/{reference_id}/analyze`: Grid sweep across operating thresholds (e.g., 0.05 to 0.95) under configurable cost objectives.
- `GET /api/v1/thresholds/{reference_id}`: Optimal threshold recommendations for minimum cost, maximum F1, or target recall.
- `GET /api/v1/thresholds/{reference_id}/curve`: Full cost, precision, recall, and specificity curves across the threshold spectrum.
- `POST /api/v1/calibration/{reference_id}/compare`: Compares raw uncalibrated probabilities against **Isotonic Regression** and **Platt Sigmoid Scaling**.
- `GET /api/v1/calibration/{reference_id}/reliability`: Reliability diagram bins, Brier score, log loss, and ECE.
- `POST /api/v1/decision-policies/{reference_id}/compare`: Side-by-side policy evaluations combining threshold, calibration method, and cost matrix.

### Optimization Example
```powershell
$body = @{
  threshold_min = 0.05
  threshold_max = 0.95
  threshold_candidates = 19
  objective = "minimum_cost"
  false_positive_cost = 1.0
  false_negative_cost = 10.0
} | ConvertTo-Json

Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:8000/api/v1/thresholds/exp-catboost-classweight/analyze" `
  -ContentType "application/json" `
  -Body $body
```

---

## Real-Time & Batch Prediction Inference Service

Located at `/api/v1/predictions`:

- `GET /api/v1/predictions/models`: Active models and validation candidates available for inference.
- `GET /api/v1/predictions/policies`: Registered decision policies with frozen thresholds and calibration schemes.
- `POST /api/v1/predictions/policies`: Register a verified decision policy for operational inference.
- `GET /api/v1/predictions/models/{type}/{id}/features`: Feature schema and expected column ordering (170 features).
- `POST /api/v1/predictions`: Perform single-vehicle failure prediction with feature explanations.
- `POST /api/v1/predictions/batch`: High-performance batch evaluation for up to 100 vehicles.
- `GET /api/v1/predictions`: Historical prediction log with filtering and pagination.
- `GET /api/v1/predictions/{prediction_id}`: Audit detail for a specific inference event.

### Single Prediction Request Payload
```json
{
  "experiment_id": "phase9-final-validation-candidate",
  "include_explanation": true,
  "features": {
    "aa_000": 76698.0,
    "ac_000": 2130706432.0,
    "ad_000": 280.0,
    "ae_000": 0.0,
    "af_000": 0.0
  }
}
```

---

## Model Registry, Lineage & Reproducibility API

Tracks complete model governance without bundling large binary blobs into SQLite:

- `GET /api/v1/models/registry`: Paginated registry across training runs and experiments.
- `GET /api/v1/models/registry/{type}/{id}/lineage`: Full lineage tracing training dataset fingerprints, preprocessing recipes, hyperparameter configs, and dependencies.
- `GET /api/v1/models/registry/{type}/{id}/artifacts`: SHA-256 verification of serialized pipeline artifacts.
- `GET /api/v1/models/registry/{type}/{id}/reproducibility`: Reproducibility check verifying dataset source availability, dependencies, and configuration fingerprint.
- `POST /api/v1/models/registry/{type}/{id}/lifecycle`: Transition model lifecycle states (`registered`, `trained`, `evaluated`, `approved`, `archived`).
- `GET /api/v1/models/promotions`: Promotion log for operational models.

---

## Analytics, Reports & Evidence Export API

Consolidates persisted analytical snapshots for dashboards, audits, and exports:

- `GET /api/v1/analytics/dashboard`: Fleet-wide summary cards, active model status, recent training activity.
- `GET /api/v1/analytics/datasets/{dataset_id}`: In-depth dataset profiling rollup.
- `GET /api/v1/analytics/models/comparison`: Full cross-model validation performance matrix.
- `GET /api/v1/analytics/thresholds/{reference_id}`: Precomputed threshold evaluation summaries.
- `GET /api/v1/exports/experiments/{type}/{id}.json`: Machine-readable experiment artifact export.
- `GET /api/v1/exports/experiments/{type}/{id}.csv`: Metric and hyperparameter tabular export.
- `GET /api/v1/reports/experiments/{type}/{id}.pdf`: Formal scientific PDF evidence report.
- `GET /api/v1/exports/predictions.csv`: Filtered prediction audit log export.

---

## Historical Scientific Evidence & Benchmark Audit API

Provides read-only access to baseline and benchmark evaluation artifacts:

- `GET /api/v1/historical-evidence/overview`: High-level summary of baseline runs, validation benchmark candidates, and official test results.
- `GET /api/v1/historical-evidence/validation/comparison`: Comprehensive multi-model validation comparison matrix.
- `GET /api/v1/historical-evidence/official-test`: Immutable evaluation of the frozen validation candidate on the isolated 16,000-record official APS test set.
- `GET /api/v1/historical-evidence/thresholds/{reference_id}`: Read-only threshold curves from benchmark runs.
- `GET /api/v1/historical-evidence/calibration/{reference_id}`: Read-only calibration and reliability evidence.

### Benchmark Validation Candidate
- **Model**: CatBoost Classifier with Balanced Class Weighting
- **Preprocessing**: Native categorical and missing-value handling
- **Probability Calibration**: Isotonic Regression
- **Optimal Operating Threshold**: `0.115` (selected by minimum illustrative cost on out-of-fold validation predictions)
- **Official Test Set Evaluation**: Frozen pipeline evaluated once on the 16,000-record test set, yielding empirical cost reduction and robust PR-AUC with 95% bootstrap confidence intervals.

---

## Error Handling & API Envelope

All non-2xx responses return a consistent, machine-readable JSON structure:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Sensor feature count (168) does not match expected schema (170).",
    "details": [
      {
        "field": "features",
        "issue": "Missing required sensor channels: 'ee_008', 'ee_009'."
      }
    ]
  }
}
```

### Standard Status Codes
- `200 OK` / `201 Created`: Request succeeded.
- `400 Bad Request`: Invalid parameter values or semantic business rule violation.
- `404 Not Found`: Model run, dataset, or artifact reference does not exist.
- `413 Payload Too Large`: Upload exceeds maximum byte limit (50 MiB).
- `422 Unprocessable Entity`: Request body failed Pydantic schema validation.
- `500 Internal Server Error`: Unhandled server exception (stack traces logged server-side).

---

## Database Migrations & Operational Procedures

### Database Path Conventions
`DATABASE_URL` in `app/core/config.py` defaults to `sqlite:///./data/aps_intelligence.db`:
- Always run backend commands from the `backend/` directory so `./data/` resolves consistently.
- In production, set `DATABASE_URL=sqlite:////var/data/aps-intelligence/data/aps_intelligence.db` on persistent EBS storage.

### Inspecting & Applying Migrations
```powershell
# Inspect current schema revision
alembic current

# Check available head revisions
alembic heads

# Apply all pending migrations idempotently
alembic upgrade head
```

### Point-in-Time Database Backup
Create a non-blocking hot backup using the SQLite backup API:

```powershell
python -c "
import sqlite3, datetime, hashlib
from pathlib import Path

ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
backup_path = Path('data/backups') / f'aps_intelligence_{ts}.db'
backup_path.parent.mkdir(parents=True, exist_ok=True)

src = sqlite3.connect('data/aps_intelligence.db')
dst = sqlite3.connect(str(backup_path))
with dst:
    src.backup(dst, pages=100)
src.close()
dst.close()

chk = sqlite3.connect(str(backup_path)).cursor().execute('PRAGMA integrity_check;').fetchone()[0]
sha = hashlib.sha256(backup_path.read_bytes()).hexdigest()
print(f'Backup created: {backup_path} | Integrity: {chk} | SHA256: {sha}')
"
```

### Concurrency Best Practices
- Run Uvicorn with a single worker process (`--workers 1`). SQLite enforces a single active writer; the configured busy timeout (`timeout: 30.0`) handles transient coroutine concurrency gracefully.
