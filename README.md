# APS Intelligence

Industrial Failure Prediction & Reliability Analytics for the APS Failure at
Scania Trucks dataset.

## Project layout

- `frontend/` — Next.js, TypeScript and Tailwind application.
- `backend/` — FastAPI dataset-engineering and model-training API.

See [`backend/README.md`](backend/README.md) for backend setup, architecture,
dataset-engineering endpoints, validation commands and the proposed later-phase
API contract mapping.

## Persistent data and evaluation scope

The application separates source code from persistent runtime data. Local
development uses SQLite and filesystem directories under `backend/`; production
should point `PERSISTENT_STORAGE_DIR`, `DATABASE_URL`, `DATASET_STORAGE_DIR`,
`MODEL_ARTIFACT_DIR` and `REPORT_STORAGE_DIR` to an EBS-backed mount on the
EC2 instance. SQLite is the database engine, not the storage device. Dataset
CSVs, trained model binaries and generated reports are intentionally excluded
from Git.

The APS academic evaluation plan is documented as a guardrail for subsequent
phases: leakage-safe missing-value analysis and train/validation/test splits;
comparison of Logistic Regression, Random Forest, XGBoost and CatBoost using
PR-AUC as the primary metric; training-only SMOTE; validation-only threshold
selection; calibration and configurable false-positive/false-negative costs;
responsive accessible Next.js/FastAPI deployment; reproducible experiments;
automated tests; and a final report with at least five recent research papers.
Phase 3 adds reproducible Logistic Regression, Random Forest, XGBoost and
CatBoost training, standardized validation metrics, explicit class weighting,
filesystem model artifacts and a SQLite-backed training registry. Threshold
optimization, SMOTE comparisons, calibration, prediction and frontend
integration remain later phases.

Phase 4 adds controlled comparative experiments for original data, class
weighting and training-only SMOTE; bounded PR-AUC hyperparameter search;
missing-value strategy comparison; validation curves; feature importance;
experiment artifacts; and comparison APIs. Official-test evaluation,
threshold optimization, calibration and frontend integration remain later
phases.
