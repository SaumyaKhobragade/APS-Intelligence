# APS Intelligence — Frontend Application

Next.js 14 (App Router) web application providing industrial failure prediction, reliability analytics, and machine learning experimentation interfaces for the Scania Trucks Air Pressure System (APS) platform.

---

## Overview

The frontend interface translates complex class-imbalance dynamics, cost-sensitive threshold curves, and high-dimensional sensor telemetry into actionable operational views for fleet operators, reliability engineers, and data scientists.

### Key Architectural Tenets
- **Live Persisted Backend Integration**: The UI connects directly to live `/api/v1` backend endpoints. When data is loading, missing, or unavailable, explicit states are displayed; the application never silently falls back to synthetic or simulated mock predictions.
- **Fail-Safe Integrity**: Distinguishes between validation evidence, official benchmark results, and live inference predictions.
- **Modular Component Design**: Built with Tailwind CSS and modular UI components, featuring custom SVG/Canvas data visualizations, data tables, and telemetry forms.
- **Accessibility & Responsiveness**: Fully responsive across mobile (390px+), tablet (768px), and widescreen desktop (1440px+) breakpoints, maintaining accessible contrast ratios and semantic navigation.

---

## Technology Stack

- **Framework**: [Next.js 14](https://nextjs.org/) (App Router, Server Components & Client Components)
- **Language**: [TypeScript 5](https://www.typescriptlang.org/) (Strict mode enabled)
- **Styling**: [Tailwind CSS 3](https://tailwindcss.com/) with custom design tokens for industrial telemetry
- **Icons**: [Lucide React](https://lucide.dev/)
- **Data Visualization**: Custom SVG coordinate charts, HTML5 Canvas renderers, and responsive CSS grids
- **State & Data Management**: React hooks (`useState`, `useEffect`, `useCallback`, `useTransition`), custom service adapters
- **Testing**: [Vitest](https://vitest.dev/) with Node environment and custom assertions

---

## Workspace Directory Structure

```text
frontend/
├── app/                          # Next.js App Router routes & layouts
│   ├── dashboard/                # Operational reliability overview
│   ├── datasets/                 # Sensor dataset profiling & quality checks
│   ├── models/                   # Multi-model validation comparison & official test benchmarks
│   ├── thresholds/               # Cost curves, threshold optimization, probability calibration
│   ├── experiments/              # Experiment registry, hyperparameters, reproducibility lineage
│   ├── predictions/              # Real-time single & batch failure diagnostics
│   ├── layout.tsx                # Root layout with font optimization & metadata
│   ├── page.tsx                  # Home route redirecting to dashboard
│   └── globals.css               # Tailwind utility extensions & theme tokens
├── components/                   # Modular UI components
│   ├── layout/                   # AppShell, NavigationBar, PageHeader, StatusBanners
│   ├── dashboard/                # Metric cards, quick actions, fleet reliability summaries
│   ├── datasets/                 # Missingness heatmaps, feature histograms, quality tables
│   ├── models/                   # PR/ROC curves, confusion matrices, comparison tables
│   ├── thresholds/               # Cost curve sliders, threshold tables, calibration plots
│   ├── experiments/              # Run cards, hyperparameter diffs, lineage inspectors
│   ├── predictions/              # 170-sensor telemetry inputs, batch CSV upload, results panel
│   └── ui/                       # Buttons, Badges, Modals, Tabs, Tooltips, EmptyStates
├── lib/                          # Utility helpers (cn class merger, formatters, math)
├── services/                     # Typed backend API client & domain mapping layers
│   ├── api-client.ts             # Centralized fetch wrapper with timeout and error normalization
│   ├── dashboard-service.ts      # Analytics rollup consumer
│   ├── dataset-service.ts        # Dataset profiling & quality API adapter
│   ├── model-service.ts          # Model comparison & training-run adapter
│   ├── threshold-service.ts      # Threshold optimization & calibration adapter
│   ├── experiment-service.ts     # Experiment registry & lineage adapter
│   └── prediction-service.ts     # Real-time inference & batch upload handler
├── tests/                        # Vitest test suite
│   ├── api-client.test.ts        # API client error handling and normalization tests
│   ├── prediction-workspace.test.ts # Inference validation and batch processing tests
│   └── dataset-explorer.test.ts  # Telemetry formatting and quality checks
├── types/                        # TypeScript interface contracts for domain entities
├── package.json                  # NPM dependencies and scripts
└── README.md                     # This documentation
```

---

## UI Workspaces & Feature Guide

### 1. Operational Reliability Dashboard (`/dashboard`)
The central executive cockpit for fleet monitoring and model health:
- **Fleet Risk Summary**: Total vehicles monitored, predicted failure rate, and estimated fleet operational cost.
- **Active Model Status**: Displays the current operational model, validation candidate status, default threshold, and calibration type.
- **Quick Navigation**: One-click shortcuts to dataset exploration, model comparisons, and batch prediction.
- **Historical Activity Feed**: Recent training runs, comparative experiments, and audit entries.

### 2. Dataset Explorer & Quality Profiler (`/datasets`)
Comprehensive inspection of the 170 APS sensor features:
- **Dataset Catalog**: Inspects raw and processed datasets with record counts and class balance (59:1 ratio).
- **Missing Value Analytics**: Detailed audit of the 850,015 missing sensor entries across all channels, identifying high-missingness groups.
- **Data Quality Scan**: Identifies constant columns (e.g., `cd_000`), duplicate rows, and schema compliance.
- **Feature Schema Viewer**: Paginated explorer of all 170 sensor variables with statistical distributions and group classifications.

### 3. Model Comparison Matrix (`/models`)
Transparent benchmarking across all evaluated machine learning models:
- **Multi-Family Benchmarking**: Side-by-side comparison of Logistic Regression, Random Forest, XGBoost, and CatBoost.
- **Precision-Recall & ROC Curves**: Interactive curve plotting highlighting PR-AUC as the primary metric under extreme imbalance.
- **Confusion Matrix & Cost Breakdown**: Displays True Positives, False Positives, False Negatives, and True Negatives alongside illustrative business cost calculations.
- **Official Test Benchmark Tab**: Dedicated historical section displaying the frozen validation candidate evaluated on the 16,000-record official benchmark test set, complete with 95% bootstrap confidence intervals.

### 4. Threshold Optimization Workspace (`/thresholds`)
Cost-sensitive threshold selection and probability calibration explorer:
- **Asymmetric Cost Curve**: Visualizes total fleet cost across operating thresholds from 0.01 to 0.99.
- **Threshold Policy Matrix**: Compares operating points optimized for Minimum Total Cost, Maximum F1-Score, and Target Recall constraints.
- **Probability Calibration Diagrams**: Compares uncalibrated model scores against Isotonic Regression and Platt Sigmoid curves, reporting Brier score and Expected Calibration Error (ECE).

### 5. Experiment Lineage & History (`/experiments`)
Full governance, auditability, and reproducibility tracking:
- **Experiment Registry**: Filterable, searchable record of all historical training and comparative experiment runs.
- **Hyperparameter Inspector**: View exact configurations, search budgets, random seeds, and cross-validation parameters.
- **Artifact Verification**: Verifies SHA-256 checksums of serialized pipeline artifacts and environment dependency snapshots.
- **Reproducibility Audit**: Validates whether identical training conditions can be reconstructed.

### 6. Failure Prediction Workspace (`/predictions`)
Operational diagnostic tool for predictive maintenance:
- **Single-Vehicle Telemetry Form**: Grouped sensor inputs across all 170 features with pre-fill presets (healthy baseline, imminent failure, missing-value stress test).
- **Instant Risk Assessment**: Instant failure probability output, decision badge (`Operational` vs. `Immediate Maintenance Required`), and applied threshold indicator.
- **Feature Contribution Explanation**: Identifies top sensor channels driving the failure probability.
- **Batch CSV Upload**: Ingests multi-vehicle CSV files (up to 100 rows), validates schema adherence, and outputs per-vehicle diagnostic tables with export capabilities.

---

## Client Architecture & API Integration

### Centralized API Client (`services/api-client.ts`)
All network communication flows through a unified client ensuring:
- **Base URL Normalization**: Automatically resolves relative paths or appends `/api/v1` to host prefixes.
- **Error Normalization**: Maps network disconnects, timeouts (15s default), HTTP 4xx, and 5xx errors into typed `ApiError` objects containing standard `{ error: { code, message, details } }` structures.
- **Type Safety**: Enforces strict generic return typing across all service endpoints.

### Environment Configuration

Configure the backend API URL in `.env.local`:

```dotenv
# Backend API Base URL
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
```

*In production deployments behind Nginx, this can be set to `/api/v1` for same-origin proxying.*

---

## Local Setup & Development

### Prerequisites
- **Node.js**: `>= 20.0.0 LTS` (Tested on Node.js `v24.x` and npm `10.x+`)

### Installation & Execution

```powershell
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Setup local environment configuration
Copy-Item .env.example .env.local

# Launch development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## Verification & Quality Commands

```powershell
# Run unit and integration tests
npm run test

# Run TypeScript type-checker
npm run typecheck

# Run ESLint validation
npm run lint

# Compile production build
npm run build
```

---

## Production Build & Process Management

For production deployment:

```powershell
# 1. Compile optimized Next.js standalone application
npm run build

# 2. Run with production Node server
npm run start
```

In production EC2 environments, the application is managed via **PM2** using the provided ecosystem template, running behind an Nginx reverse proxy with SSL termination and HTTP/2 support.
