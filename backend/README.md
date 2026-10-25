# APS Intelligence Backend

FastAPI backend for the APS Intelligence application. Phase 2 adds filesystem-
backed dataset ingestion, schema validation, profiling, quality reports,
reproducible train/validation splitting and model-aware preprocessing artifacts
on top of the Phase 1 configuration, routing, SQLite/SQLAlchemy/Alembic and
error-handling foundation. It intentionally does not train models, apply SMOTE,
select thresholds or perform inference.

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
└── reports/      generated reports and exports
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
app/models/                 future metadata ORM models
app/repositories/           future persistence boundaries
app/services/               future domain/application services
app/utils/                  safe shared utilities
artifacts/models/           filesystem model artifacts, not database blobs
artifacts/reports/          generated reports, not database blobs
datasets/raw/               immutable source files, not database blobs
datasets/reference/         dataset documentation
datasets/processed/         generated preprocessing outputs
alembic/                    future schema migration scripts
tests/                      isolated foundation tests
```

The backend is a single FastAPI process intended for one EC2 instance and one
application user. No authentication, user management or microservice split is
introduced in this phase. Models are expected to be trained offline and loaded
by later inference services; startup never initiates training.

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

The backend deliberately contains no model training, SMOTE, threshold selection
or prediction implementation yet.

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
| `POST /api/v1/predictions` | Predict one sensor row | `PredictionRequest` (`modelId`, readings) | `PredictionResult` | `201`, `400`, `404`, `422`, `503` |
| `POST /api/v1/predictions/batch` | Predict uploaded rows | Multipart CSV plus model ID | `BatchPredictionResponse` | `202`, `400`, `413`, `415`, `422`, `503` |
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
