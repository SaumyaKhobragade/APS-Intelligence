# APS Intelligence

**Industrial Failure Prediction & Reliability Analytics Under Extreme Class Imbalance**

An end-to-end machine learning system and operational platform built for the **APS (Air Pressure System) Failure at Scania Trucks** dataset. The platform combines rigorous data-leakage prevention, controlled comparative experimentation, cost-sensitive threshold optimization, probability calibration, and live inference within a responsive, accessible full-stack web application.

---

## Executive Overview

Modern heavy commercial vehicles rely on compressed air for braking, gear shifting, and suspension. Predicting component failures before roadside breakdown is critical:

- **Extreme Class Imbalance**: In the 60,000-record training dataset, only 1,000 failures exist against 59,000 non-failures (**59:1 ratio**). In the 16,000-record official benchmark test set, there are 375 failures against 15,625 non-failures (**41.67:1 ratio**).
- **Severe Sensor Missingness**: 850,015 missing values across 169 of the 170 anonymized sensor channels, with missingness mechanisms varying between random sensor dropouts and systematic subsystem failures.
- **Asymmetric Operational Cost Matrix**: Missing a failure (**False Negative**) triggers roadside breakdown, towing, emergency repairs, and cargo delays (~$500 operational baseline). Flagging an intact vehicle (**False Positive**) triggers an unnecessary workshop inspection (~$10 operational baseline). Evaluating models with conventional accuracy or symmetric loss yields catastrophic real-world failure.

APS Intelligence provides a complete scientific and engineering solution to these challenges.

---

## System Architecture

```
                       Internet (HTTPS / Port 443)
                                  │
                                  ▼
                       [ Nginx Reverse Proxy ]
               ├── Security Headers, Gzip, SSL Termination
               ├── Static Cache: /_next/static/
               ├── API Routes:   /api/v1/*  ──► FastAPI (127.0.0.1:8000)
               └── UI Routes:    /*         ──► Next.js (127.0.0.1:3000)
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
      [ FastAPI Backend ]                [ Next.js Frontend ]
      ├── Dataset Profiling Engine       ├── Operational Dashboard
      ├── Scikit-Learn/CatBoost Pipeline ├── Interactive Dataset Explorer
      ├── Imbalance & Calibration Logic  ├── Model Comparison Matrix
      ├── Cost Optimizer & Threshold Grid ├── Threshold Optimizer Workspace
      ├── Single & Batch Inference Engine├── Experiment Lineage Explorer
      └── Evidence & Report Exporters    └── Vehicle Failure Predictor
                 │
                 ▼
      [ Persistent Storage (EBS / Local) ]
      ├── SQLite Database (`aps_intelligence.db`)
      ├── Raw & Processed Dataset Store (`/datasets`)
      ├── Serialized Pipelines & Estimators (`/artifacts/models`)
      └── Audit Logs, Calibration Curves & PDF Reports (`/artifacts/reports`)
```

### Full-Stack Architecture Highlights
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Lucide icons, Canvas and SVG charts. Responsive desktop, tablet, and mobile layouts.
- **Backend**: FastAPI (Python 3.11+), SQLAlchemy 2.0 ORM, Alembic schema migrations, Pydantic v2 validation contracts.
- **Machine Learning Core**: Scikit-Learn, Imbalanced-Learn, XGBoost, CatBoost, LightGBM, and SciPy.
- **Storage Separation**: SQLite provides transactional registry and lineage tracking; all large CSV datasets, serialized model binaries (`.joblib`), and generated analytical exports reside strictly on filesystem/EBS storage.

---

## Core Capabilities & Platform Modules

### 1. Dataset Engineering & Quality Profiling
- **Sensor Schema Auditing**: Ingests and validates the 170 canonical APS sensor features (`aa_000` to `ee_009`).
- **Comprehensive Quality Checks**: Computes missingness rates per feature, detects constant features (e.g., `cd_000`), identifies duplicate records, and scans for invalid or infinite values.
- **Leakage-Safe Preprocessing**: Implements median imputation, native tree missing-value handling, and robust quantile scaling. Preprocessing pipelines are fit strictly on training partitions and never exposed to validation or test rows.

### 2. Model Training & Comparative Experimentation
- **Multi-Family Benchmarking**: Orchestrates reproducible training across four distinct estimator architectures:
  - **Logistic Regression** (L2-regularized baseline with balanced weights)
  - **Random Forest** (Ensemble bagging with cost-adjusted class weights)
  - **XGBoost** (Extreme Gradient Boosting with native missing-value routing and scale-pos-weight)
  - **CatBoost** (Ordered boosting with native categorical handling and class weighting)
- **Imbalance Strategies**: Side-by-side comparison of **Balanced Class Weighting** versus in-pipeline **SMOTE** (Synthetic Minority Over-sampling Technique) applied strictly to training folds.
- **Precision-Recall Optimization**: Uses **PR-AUC** (Average Precision) as the primary evaluation metric rather than deceptive ROC-AUC or unweighted accuracy.

### 3. Cost-Sensitive Threshold Optimization & Calibration
- **Custom Cost Objectives**: Evaluates a bounded grid of classification thresholds against an asymmetric business cost objective:
  $$\text{Total Cost} = (\text{FP} \times C_{\text{FP}}) + (\text{FN} \times C_{\text{FN}})$$
- **Leakage-Safe Probability Calibration**: Fits **Isotonic Regression** and **Platt Sigmoid Scaling** on out-of-fold training predictions to align raw model scores with true empirical failure probabilities.
- **Reliability Assessment**: Tracks Brier scores, log loss, and reliability diagrams with Expected Calibration Error (ECE) across probability deciles.

### 4. Official Benchmark Evaluation
- **Strict Benchmark Isolation**: The 16,000-record official benchmark test set was sealed until the validation candidate, threshold (`0.115`), and isotonic calibrator were frozen.
- **Transparent Historical Provenance**: Displays confusion counts, cost improvements, stratified bootstrap confidence intervals (95% CI), and PR/ROC curves without modifying or overwriting validation evidence.

### 5. Failure Prediction Workspace
- **Real-Time Single-Vehicle Inference**: Evaluates complete 170-sensor readings with immediate probability estimates, diagnostic risk badges, and top-contributing feature explanations.
- **High-Throughput Batch Processing**: Synchronously ingests multi-vehicle CSV uploads (up to 100 records per batch) with strict schema validation and structured per-row prediction diagnostics.
- **Governance Safeguards**: Gated by model lifecycle status, active promotion, and decision policy configuration.

---

## Repository Structure

```text
├── backend/                  # FastAPI Application & ML Pipeline
│   ├── alembic/              # Database schema migrations
│   ├── app/
│   │   ├── api/v1/           # Versioned REST endpoints (datasets, models, predictions, etc.)
│   │   ├── core/             # Configuration, logging, exception handlers
│   │   ├── database/         # Engine creation, session dependencies
│   │   ├── models/           # SQLAlchemy ORM models (experiments, registry, predictions)
│   │   ├── schemas/          # Pydantic v2 schemas for request/response serialization
│   │   ├── services/         # Dataset profiling, model trainers, inference, reports
│   │   └── utils/            # Shared filesystem and validation helpers
│   ├── artifacts/            # Model binaries (.joblib) and precomputed evidence
│   ├── data/                 # Local SQLite database instances
│   ├── datasets/             # Raw and processed APS datasets (excluded from Git)
│   ├── scripts/              # Validation, benchmark, and operational DB scripts
│   ├── tests/                # Automated pytest suite
│   ├── requirements.txt      # Python dependencies
│   └── README.md             # In-depth backend architecture & API reference
├── frontend/                 # Next.js 14 TypeScript Application
│   ├── app/                  # App Router pages and layouts
│   ├── components/           # Modular UI components (charts, forms, tables, modals)
│   ├── lib/                  # UI utility functions and class mergers
│   ├── services/             # Typed API client and data mapping adapters
│   ├── tests/                # Vitest unit and integration test suite
│   ├── types/                # Core TypeScript domain interfaces
│   ├── package.json          # Node dependencies and scripts
│   └── README.md             # In-depth frontend guide and component layout
├── deployment/               # Production Infrastructure & Deployment Guide
│   ├── templates/            # Systemd service units, Nginx configs, backup scripts
│   └── README.md             # Production AWS EC2/EBS runbook, release & rollback procedures
└── README.md                 # Project root documentation
```

---

## Quickstart Guide

### Prerequisites
- **Python**: 3.11+
- **Node.js**: >= 20.0.0 LTS (tested on Node v24 LTS / npm 10+)
- **OS**: Linux, macOS, or Windows

### 1. Launch Backend API

```bash
# Navigate to backend directory
cd backend

# Create and activate virtual environment
python -m venv .venv

# On Linux/macOS:
source .venv/bin/activate
# On Windows (PowerShell):
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Apply database migrations
alembic upgrade head

# Start development server
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```
*API documentation and interactive Swagger UI will be available at `http://127.0.0.1:8000/docs`.*

### 2. Launch Frontend Application

```bash
# Open a new terminal and navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Configure environment
cp .env.example .env.local

# Start Next.js development server
npm run dev
```
*Application workspace will be accessible at `http://localhost:3000`.*

---

## Verification & Automated Testing

Both tiers include dedicated test suites to ensure data integrity, API contract consistency, and ML reliability:

```bash
# Run backend test suite (from backend/)
pytest -v

# Run frontend test suite & type checks (from frontend/)
npm run test
npm run typecheck
npm run lint
```

---

## Deployment & Production Operations

The system is engineered for single-node deployment on **AWS EC2** (Ubuntu 22.04/24.04 LTS, recommended `t3.large` or `c6i.large`) with persistent **EBS Storage** (`gp3`):

- **Process Management**: Backend managed via `systemd` (`aps-intelligence-backend.service`); Frontend managed via `PM2` cluster mode.
- **Reverse Proxy**: Nginx handles SSL termination (Let's Encrypt / Certbot), HTTP/2, client payload buffering (up to 50 MiB), and same-origin `/api/v1` proxying.
- **Zero-Downtime Releases**: Atomic symlink activation (`/opt/aps-intelligence/current` -> `releases/release-<id>`).
- **Data Persistence**: Databases, model checkpoints, and generated exports reside on `/var/data/aps-intelligence`, decoupled from code updates.

For complete step-by-step installation runbooks, environment variable templates, systemd definitions, and disaster recovery procedures, consult the **[Production Deployment & Operations Guide](deployment/README.md)**.

---

## Documentation Links

- **[Backend Architecture & API Reference](backend/README.md)**: Deep dive into API endpoints, schemas, SQLite concurrency model, and ML pipeline mechanics.
- **[Frontend Architecture & Component Guide](frontend/README.md)**: UI component hierarchy, data fetching strategies, client state management, and design system.
- **[Production Operations & Deployment Manual](deployment/README.md)**: AWS EC2/EBS infrastructure provisioning, security hardening, backups, and release runbooks.
