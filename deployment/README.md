# APS Intelligence — Production Deployment & Operations Guide

This documentation specifies the production architecture, configuration, deployment sequence, process management, database persistence strategy, bootstrap requirements, and release/rollback procedures for **APS Intelligence**.

---

## 1. Production Architecture Overview

The production deployment runs on a single AWS EC2 instance (recommended: `t3.large` or `c6i.large`, 2 vCPUs, 4–8 GB RAM, Ubuntu 22.04/24.04 LTS) with an EBS General Purpose SSD (gp3) volume.

```
       Internet (HTTPS / Port 443)
                  │
                  ▼
         [ Nginx Reverse Proxy ]
         ├── Security Headers & SSL Termination
         ├── Static Assets: /_next/static/ -> Disk Cache
         ├── API Proxy:     /api/*         -> 127.0.0.1:8000 (FastAPI)
         └── App Proxy:     /*             -> 127.0.0.1:3000 (Next.js)
                  │
         ┌────────┴────────┐
         ▼                 ▼
 [ FastAPI Backend ]  [ Next.js Frontend ]
   (Uvicorn 1-worker)   (Node.js / PM2)
         │
         ▼
 [ SQLite Database + ML Artifacts ]
   (Mounted on Persistent EBS Storage)
```

### Key Design Tenets
1. **Single Uvicorn Worker Architecture**: FastAPI runs with `--workers 1`. While this eliminates inter-process lock conflicts across multiple OS worker processes, request coroutines within the single asyncio event loop can still execute concurrent database operations. SQLite concurrency is safely governed by `timeout: 30.0` (busy handler) and short transaction boundaries.
2. **EBS-Backed Persistence**: SQLite database, historical run databases, and ML model artifacts reside on dedicated EBS-backed storage (`/var/data/aps-intelligence`).
3. **Same-Origin API Strategy**: In production, the browser communicates through same-origin relative `/api/v1` routes proxied by Nginx. The browser never accesses `127.0.0.1` directly.
4. **Defense-in-Depth CORS**: In production, CORS strictly forbids wildcard `*` origins and requires explicit allowed domains.
5. **Preserved ML Evidence**: Phase 9 candidate (`phase9-final-validation-candidate`, threshold `0.115`, isotonic calibration) and Phase 10 official-test evaluation evidence remain strictly read-only.
6. **Strict Upload Enforcement**: Backend enforces a maximum dataset upload limit of 50 MiB (52,428,800 bytes) via streaming chunk byte counting, immediately rejecting oversized files with HTTP 413 and unlinking temporary files without disk residue.
7. **Versioned Release Directory Structure**: Application code is deployed into versioned release folders under `/opt/aps-intelligence/releases/release-<id>`, with `/opt/aps-intelligence/current` serving as the atomic symlink targets for systemd and PM2.

---

## 2. Production Environment Configuration Guide

### 2.1 Backend Environment Configuration (`/opt/aps-intelligence/current/backend/.env`)

```ini
# Core Service Configuration
APP_NAME="APS Intelligence API"
APP_VERSION="0.1.0"
ENVIRONMENT="production"
API_PREFIX="/api/v1"
BACKEND_HOST="127.0.0.1"
BACKEND_PORT=8000

# CORS Security (Wildcard '*' is strictly prohibited in production mode)
# Must specify the exact public scheme and domain(s)
ALLOWED_CORS_ORIGINS=["https://aps.yourdomain.com", "http://127.0.0.1:3000"]

# Persistent Storage & Database (Absolute paths to EBS mount)
PERSISTENT_STORAGE_DIR="/var/data/aps-intelligence/data"
DATABASE_URL="sqlite:////var/data/aps-intelligence/data/aps_intelligence.db"
DATASET_STORAGE_DIR="/var/data/aps-intelligence/datasets"
MODEL_ARTIFACT_DIR="/var/data/aps-intelligence/artifacts/models"
REPORT_STORAGE_DIR="/var/data/aps-intelligence/artifacts/reports"

# Dataset Upload Limits (50 MiB = 52,428,800 bytes)
MAX_DATASET_UPLOAD_BYTES=52428800

# ML Operational Defaults
DEFAULT_CLASSIFICATION_THRESHOLD=0.5
FALSE_POSITIVE_COST=1.0
FALSE_NEGATIVE_COST=10.0
PREDICTION_BATCH_MAX_SIZE=100
PREDICTION_MODEL_CACHE_SIZE=8
ANALYTICS_EXPORT_MAX_ROWS=5000
ANALYTICS_FEATURE_PAGE_MAX_SIZE=200
LOG_LEVEL="INFO"
```

### 2.2 Frontend Environment Configuration (`/opt/aps-intelligence/current/frontend/.env.production`)

```ini
# Runtime variables (consumed by PM2 / Node.js process)
NODE_ENV="production"
PORT=3000
INTERNAL_API_URL="http://127.0.0.1:8000/api/v1"

# Build-time variables (inlined into client JavaScript bundles during `npm run build`)
# By default, in production (NODE_ENV=production), the client uses same-origin relative `/api/v1`.
# Leave NEXT_PUBLIC_API_BASE_URL unset or set to `/api/v1` for standard same-origin routing.
NEXT_PUBLIC_API_BASE_URL="/api/v1"
```

> [!WARNING]
> **Build-time vs. Runtime Distinction**: `NEXT_PUBLIC_*` variables are embedded into client bundles at build time. Modifying them in `.env.production` at runtime without running `npm run build` will have NO effect. Never store secret credentials in `NEXT_PUBLIC_*` variables.

---

## 3. Node.js Runtime Alignment & Prerequisites Checklist

### 3.1 Node.js Runtime Alignment
- **Tested & Verified Version**: Node.js `v24.18.0` / npm `12.0.2` in development and test pipelines.
- **Production Supported Versions**: Node.js `>=20.0.0` (v20.x LTS, v22.x LTS, or v24.x LTS) and npm `>=10.0.0`.
- **Enforcement**: Explicitly declared in `frontend/package.json` under `"engines"` and pinned in `frontend/.nvmrc` (`v24.18.0`).
- **Production Execution**: Next.js builds standalone/production server bundles during `npm run build`, executed via PM2 pointing to Node.js binary.

### 3.2 Deployment Prerequisites Checklist

Before executing the production deployment, verify all prerequisites:

- [ ] **AWS Infrastructure**:
  - [ ] EC2 Instance provisioned (Ubuntu 22.04 LTS or 24.04 LTS, min 4 GB RAM).
  - [ ] Security Group configured: Inbound 80 (HTTP), 443 (HTTPS), 22 (SSH from admin IP only).
  - [ ] EBS gp3 volume (min 20 GB) attached and mounted to `/var/data/aps-intelligence`.
  - [ ] Elastic IP assigned to EC2 instance.
  - [ ] DNS A-record pointing domain (e.g. `aps.yourdomain.com`) to the Elastic IP.
- [ ] **System Dependencies**:
  - [ ] Node.js (>= 20.0.0 LTS) installed (or managed via `nvm` with `.nvmrc`).
  - [ ] Python 3.11 or 3.13 installed with `python3-venv`.
  - [ ] Nginx installed and enabled.
  - [ ] Certbot (`python3-certbot-nginx`) installed for Let's Encrypt SSL.
  - [ ] PM2 installed globally (`npm install -g pm2`).
  - [ ] Git installed.
- [ ] **Application & Data Assets**:
  - [ ] Releases directory structure prepared under `/opt/aps-intelligence/releases/`.
  - [ ] Target release repository cloned or extracted.
  - [ ] Symlink `/opt/aps-intelligence/current` created.
  - [ ] SQLite database migrated or restored on EBS mount `/var/data/aps-intelligence/data/`.
  - [ ] Historical evidence databases and JSON evaluation reports copied to persistent storage.

---

## 4. Database & Historical Evidence Bootstrap Manifest

When bootstrapping a fresh instance or fresh clone, components require different data assets. The application distinguishes between startup, historical exploration, and live prediction inference.

### 4.1 Artifact & Evidence Manifest Table

| Host Destination Path | Source / Origin | Required For Startup? | Required For Historical Views? | Required For Inference? | Component Impacted | Notes |
|:---|:---|:---:|:---:|:---:|:---|:---|
| `/var/data/aps-intelligence/data/aps_intelligence.db` | Created via `alembic upgrade head` | **Yes** | **Yes** | **Yes** | Core API, Dataset Explorer, Audit Logs, Settings | Primary transactional database. Bootstrapped from empty schema via Alembic. |
| `/var/data/aps-intelligence/data/aps_intelligence_phase3_smoke.db` | Pre-trained run artifact | No | **Yes** | No | Experiment History, Historical Comparison | Phase 3 baseline evaluation history. |
| `/var/data/aps-intelligence/data/aps_intelligence_phase4_smoke.db` | Pre-trained run artifact | No | **Yes** | No | Experiment History, Historical Comparison | Phase 4 model run comparison history. |
| `/var/data/aps-intelligence/data/aps_intelligence_phase9_validation.db` | Pre-trained run artifact | No | **Yes** | No | Model Comparison, Dashboard Validation Metrics | Phase 9 frozen validation split evidence database. |
| `/var/data/aps-intelligence/artifacts/phase9/` | Pre-computed evaluation reports | No | **Yes** | No | Dashboard Candidate Card, Threshold Analysis | Candidate run metrics, isotonic calibration parameters, and threshold analysis. |
| `/var/data/aps-intelligence/artifacts/phase10/` | Pre-computed evaluation reports | No | **Yes** | No | Model Comparison Official-Test Tab | Phase 10 frozen official test set evaluation evidence. Strictly read-only. |
| `/var/data/aps-intelligence/artifacts/models/*.joblib` | Model training output | No | No | **Yes** | Real-time Inference API (`/api/v1/predictions`) | Serialized model pipelines. Inference is currently gated/pending operational signoff. |
| `/var/data/aps-intelligence/datasets/raw/` | User upload / Reference data | No | No | No | Dataset Explorer Uploads | Destination directory for streamed CSV uploads. Preserves reference APS sets. |

### 4.2 Step-by-Step Bootstrap Commands (Fresh Clone)

```bash
# 1. Create directory hierarchy on EBS mount
sudo mkdir -p /var/data/aps-intelligence/data/backups
sudo mkdir -p /var/data/aps-intelligence/datasets/raw
sudo mkdir -p /var/data/aps-intelligence/datasets/processed
sudo mkdir -p /var/data/aps-intelligence/artifacts/models
sudo mkdir -p /var/data/aps-intelligence/artifacts/reports
sudo mkdir -p /var/data/aps-intelligence/artifacts/phase9
sudo mkdir -p /var/data/aps-intelligence/artifacts/phase10
sudo chown -R ubuntu:ubuntu /var/data/aps-intelligence

# 2. Initialize primary database schema with Alembic
cd /opt/aps-intelligence/current/backend
source .venv/bin/activate
alembic upgrade head

# 3. Verify primary database integrity
python scripts/db_ops.py verify --path /var/data/aps-intelligence/data/aps_intelligence.db

# 4. Copy historical databases (if migrating from existing staging/dev environment)
# cp /path/to/source/phase*.db /var/data/aps-intelligence/data/

# 5. Copy pre-computed scientific JSON evidence (if migrating)
# cp -r /path/to/source/artifacts/phase9/* /var/data/aps-intelligence/artifacts/phase9/
# cp -r /path/to/source/artifacts/phase10/* /var/data/aps-intelligence/artifacts/phase10/
```

---

## 5. SQLite Concurrency, Integrity & Upload Enforcement

### 5.1 Concurrency Reality & Worker Architecture
- **Single Uvicorn Worker**: Running a single Uvicorn worker process (`--workers 1`) ensures that multiple OS processes do not contend for SQLite database locks.
- **Async Event Loop Concurrency**: Inside the single Uvicorn process, multiple incoming async HTTP requests execute concurrently via Python's asyncio event loop. If two coroutines attempt concurrent write transactions, SQLite raises `sqlite3.OperationalError: database is locked` unless handled.
- **Contention Mitigations**:
  - `timeout: 30.0`: The SQLAlchemy engine configures a 30-second SQLite busy timeout, instructing SQLite to automatically retry busy connections up to 30 seconds before failing.
  - `PRAGMA foreign_keys = ON;`: Enforced on every database connection check-in.
  - Short Transactions: Application services commit or roll back transactions immediately without long-running async computations held inside open transaction contexts.
  - Journal Mode: Database uses standard rollback journal (`PRAGMA journal_mode = DELETE`), keeping database storage in a single predictable `.db` file at rest.

### 5.2 Upload Streaming & Size Enforcement
- Maximum upload size is strictly limited to **50 MiB (52,428,800 bytes)**.
- Incoming uploads stream in 64 KiB chunks directly to a target file on disk; chunks are counted on the fly without buffering the entire payload in memory.
- If the uploaded byte stream exceeds `52,428,800 bytes`, the backend terminates the write stream immediately, safely closes the file handle, deletes the partially written file from disk, and returns **HTTP 413 Payload Too Large** (`error_code = "payload_too_large"`).
- Client disconnects or streaming exceptions safely trigger file cleanup in `finally` blocks, preventing leaked orphan files on EBS storage.

---

## 6. Backup & Disaster Recovery Architecture

### 6.1 Operational Backups vs. Off-Instance Disaster Recovery

| Dimension | Operational Backup (`db_ops.py`) | Disaster Recovery (DR) Replication |
|:---|:---|:---|
| **Storage Location** | Local EBS mount (`/var/data/aps-intelligence/data/backups/`) | Encrypted AWS S3 Bucket (`s3://aps-intelligence-dr-<account-id>/`) |
| **Purpose** | Fast rollback before migrations, pre-deployment snapshots, accidental data correction. | Recovery from catastrophic EBS loss, AWS AZ failure, or hardware degradation. |
| **Mechanism** | SQLite Online Backup API (`sqlite3.Connection.backup`) via `db_ops.py backup`. | Encrypted S3 sync script (`aws s3 sync --sse aws:kms`). |
| **RPO Target** | Pre-deployment: **0 minutes** (immediate snapshot); Scheduled: **<= 24 hours**. | **<= 24 hours** (daily scheduled sync) or **<= 1 hour** (hourly sync). |
| **RTO Target** | **< 2 minutes** (local `db_ops.py restore` execution). | **< 30 minutes** (new EC2 provision, S3 fetch, restore). |
| **Integrity Check** | Automatic SHA-256 generation + SQLite `PRAGMA integrity_check` + Alembic revision check. | SHA-256 checksum verification upon retrieval. |

### 6.2 Checksums & Retention Schedule
- **Checksums**: Every backup file `aps_intelligence_backup_<timestamp>.db` is stored alongside a cryptographic SHA-256 checksum file `aps_intelligence_backup_<timestamp>.db.sha256`.
- **Retention Schedule (GFS Rotation)**:
  - Daily backups: Retained for 7 days.
  - Weekly backups: Retained for 4 weeks.
  - Monthly backups: Retained for 12 months.
  - Automated rotation script runs post-backup to purge expired local and remote copies.

### 6.3 Restoration Verification & Safety Protocol
The restoration utility (`backend/scripts/db_ops.py`) implements a fail-closed, transaction-safe replacement protocol:
1. **Service State Verification**: Queries systemd status (`systemctl show -p ActiveState aps-backend`). Strictly halts if the service is running, stopping, or auto-restarting.
2. **Lock Contention Check**: Attempts `BEGIN EXCLUSIVE` transaction on target. Halts if active locks exist.
3. **Forensic Sidecar Preservation**: Captures snapshots of `-wal`, `-shm`, or `-journal` files before modifying target.
4. **Pre-flight Integrity & Schema Validation**: Verifies `PRAGMA integrity_check` and target Alembic revision (`20261027_0005`) on the backup file.
5. **Mandatory Safety Snapshot**: Creates an automatic timestamped backup of the current target before executing replacement.
6. **Isolated Staged Swap**: Restores backup to an isolated staging file, verifies staging integrity, and atomically swaps via `os.replace`.

---

## 7. Versioned Releases & Coordinated Deployment Workflow

### 7.1 Release Directory Layout
```
/opt/aps-intelligence/
├── current -> /opt/aps-intelligence/releases/release-20261029-001   # Atomic symlink
├── releases/
│   ├── release-20261029-001/                                      # Active release
│   │   ├── backend/
│   │   │   ├── .venv/
│   │   │   └── app/
│   │   └── frontend/
│   │       ├── .next/
│   │       └── node_modules/
│   └── release-20261028-001/                                      # Previous release (for instant rollback)
└── shared/
    └── .env                                                       # Optional shared host config
```

### 7.2 Coordinated Release Sequence (Zero-Downtime Atomic Switch)

```bash
# 1. Define release ID
RELEASE_ID="release-$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="/opt/aps-intelligence/releases/${RELEASE_ID}"

# 2. Clone/extract application code to release directory
sudo mkdir -p "${RELEASE_DIR}"
sudo git clone https://github.com/SaumyaKhobragade/APS-Intelligence.git "${RELEASE_DIR}"
sudo chown -R ubuntu:ubuntu "${RELEASE_DIR}"

# 3. Setup backend in release directory
cd "${RELEASE_DIR}/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cp /var/data/aps-intelligence/backend.env .env

# 4. Setup and build frontend in release directory
cd "${RELEASE_DIR}/frontend"
npm ci
npm run build
cp /var/data/aps-intelligence/frontend.env .env.production

# 5. Create pre-deployment database safety backup
cd "${RELEASE_DIR}/backend"
python scripts/db_ops.py backup

# 6. Apply database migrations (if any)
alembic upgrade head

# 7. Atomically switch 'current' symlink
sudo ln -sfn "${RELEASE_DIR}" /opt/aps-intelligence/current

# 8. Restart backend service and reload frontend process
sudo systemctl restart aps-backend
pm2 restart /opt/aps-intelligence/current/deployment/pm2/ecosystem.config.cjs

# 9. Verify deployment health
curl http://127.0.0.1:8000/api/v1/health?verbose=true
curl -I http://127.0.0.1:3000/
```

### 7.3 Rollback Checklist & Safe Migration Downgrades

If an issue is detected post-deployment:

1. **Assess Impact & Stop Traffic**:
   ```bash
   journalctl -u aps-backend -n 100 --no-pager
   pm2 logs aps-frontend --lines 100
   tail -n 100 /var/log/nginx/error.log
   ```
2. **Atomic Symlink Reversion**:
   ```bash
   # Point 'current' back to previous known stable release
   sudo ln -sfn /opt/aps-intelligence/releases/<PREVIOUS_STABLE_RELEASE> /opt/aps-intelligence/current
   ```
3. **Restart Application Services**:
   ```bash
   sudo systemctl restart aps-backend
   pm2 restart /opt/aps-intelligence/current/deployment/pm2/ecosystem.config.cjs
   ```
4. **Database Rollback Strategy**:
   - **Non-breaking or backwards-compatible migrations**: Leave database intact. The previous code release can continue reading the compatible schema without risking data loss.
   - **Backwards-incompatible migrations without data corruption**: Run targeted downgrade `alembic downgrade <PREVIOUS_REVISION>` from within the previous release directory.
   - **Corrupted database state**: Execute full restoration from pre-deployment backup using `python scripts/db_ops.py restore --backup-file <BACKUP_PATH>`.
5. **Post-Rollback Verification**:
   - Check health endpoint: `curl http://127.0.0.1:8000/api/v1/health?verbose=true`.
   - Verify frontend loads: `curl -I http://127.0.0.1:3000/`.
   - Verify Phase 9 candidate (`phase9-final-validation-candidate`, threshold `0.115`, isotonic) and Phase 10 test evidence remain intact.
