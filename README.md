# APS Intelligence

Industrial Failure Prediction & Reliability Analytics for the APS Failure at
Scania Trucks dataset.

## Project layout

- `frontend/` — Next.js, TypeScript and Tailwind application.
- `backend/` — FastAPI dataset-engineering and model-training API.

See [`backend/README.md`](backend/README.md) for backend setup, architecture,
dataset/model/inference endpoints, validation commands and deployment notes.
See [`frontend/README.md`](frontend/README.md) for frontend setup, API
configuration, live-data behavior and frontend checks.

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
filesystem model artifacts and a SQLite-backed training registry.

Phase 4 adds controlled comparative experiments for original data, class
weighting and training-only SMOTE; bounded PR-AUC hyperparameter search;
missing-value strategy comparison; validation curves; feature importance;
experiment artifacts; and comparison APIs.

Phase 5 adds validation-only threshold optimization, configurable
false-positive/false-negative business costs, training-only sigmoid and
isotonic probability calibration, reliability metrics, decision-policy
comparisons and reproducible report artifacts. Backend Phases 6–8 add trusted
prediction, registry, reproducibility, analytics, report and export APIs.
Phase 9 adds a controlled training-only model comparison and freezes an
explicitly non-production validation candidate. Phase 10 evaluates that
unchanged candidate once on the isolated official test dataset and preserves
the result as a separate non-production evaluation record.

The current frontend integration uses the live `/api/v1` backend contracts.
Dashboard, Dataset Explorer, Model Comparison, Threshold Optimization,
Experiment History and Failure Prediction load persisted backend data through
centralized services. Empty, unavailable and backend-error states are shown
explicitly; the UI does not fall back to demo predictions. Prediction remains
unavailable until the active registry contains an approved model and compatible
active decision policy. See [`frontend/README.md`](frontend/README.md) for
startup, API configuration and verification commands.

The active local runtime database currently contains dataset metadata but no
approved model/policy pair, so this state is expected during local development.
The Phase 9 candidate and Phase 10 official-test artifacts remain isolated and
are not merged into the active prediction registry by frontend startup.
