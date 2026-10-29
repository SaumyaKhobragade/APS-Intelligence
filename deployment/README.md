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
1. **Single Uvicorn Worker Architecture**: FastAPI runs with `--workers 1`. While this eliminates inter-process lock conflicts across multiple OS worker processes, SQLite permits only **one active writer at a time**. Inside the single worker, multiple async coroutines execute concurrently. SQLite contention is handled via `timeout: 30.0` (busy handler) and short transaction boundaries. The 30-second timeout allows waiting coroutines to retry while locks clear, but does not guarantee success if a write transaction exceeds the timeout or deadlocks.
2. **EBS-Backed Persistence**: SQLite database, historical run databases, and ML model artifacts reside on dedicated EBS-backed storage (`/var/data/aps-intelligence`), strictly outside application release directories.
3. **Stable Shared Configuration**: Production configuration files reside in a stable location (`/var/data/aps-intelligence/config/`) outside versioned releases, secured with `chmod 600`. Releases never bundle secret credentials.
4. **Same-Origin API Strategy**: In production, the browser communicates through same-origin relative `/api/v1` routes proxied by Nginx. The browser never accesses `127.0.0.1` directly.
5. **Defense-in-Depth CORS**: In production, CORS strictly forbids wildcard `*` origins and requires explicit allowed domains.
6. **Preserved ML Evidence**: Phase 9 candidate (`phase9-final-validation-candidate`, threshold `0.115`, isotonic calibration) and Phase 10 official-test evaluation evidence remain strictly read-only.
7. **Strict Upload Enforcement**: Backend enforces a maximum dataset upload limit of 50 MiB (52,428,800 bytes) via streaming 64 KiB chunk byte counting. Partially written files are unlinked on limit violations, client disconnects, write failures, or registration validation errors. Incoming `UploadFile` resources are explicitly closed in all execution paths.
8. **Versioned Releases with Atomic Symlink Activation**: Application releases reside under `/opt/aps-intelligence/releases/release-<id>`, activated via a same-filesystem atomic rename (`mv -Tf current.tmp current`). Symlink switching combined with service restart yields near-zero downtime.

---

## 2. Production Environment Configuration Guide

Production secrets and environment variables are stored in stable shared paths on the persistent volume outside application release folders:

- **Backend Configuration**: `/var/data/aps-intelligence/config/backend.env`
- **Frontend Runtime Configuration**: `/var/data/aps-intelligence/config/frontend.env`
- **File Permissions**: Must be secured via `chmod 600 /var/data/aps-intelligence/config/*.env` and owned by `ubuntu:ubuntu`.

### 2.1 Backend Environment Configuration (`/var/data/aps-intelligence/config/backend.env`)

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

### 2.2 Frontend Environment Configuration (`/var/data/aps-intelligence/config/frontend.env`)

```ini
# Runtime variables (consumed by PM2 / Node.js process at server runtime)
NODE_ENV="production"
PORT=3000
INTERNAL_API_URL="http://127.0.0.1:8000/api/v1"

# Build-time variables (inlined into client JavaScript bundles during `npm run build`)
# By default, in production (NODE_ENV=production), the client uses same-origin relative `/api/v1`.
# Leave NEXT_PUBLIC_API_BASE_URL unset or set to `/api/v1` for standard same-origin routing.
NEXT_PUBLIC_API_BASE_URL="/api/v1"
```

> [!WARNING]
> **Build-time vs. Runtime Distinction**: `NEXT_PUBLIC_*` variables are embedded into client bundles at build time. Modifying them in `frontend.env` at runtime without running `npm run build` will have NO effect. Never store secret credentials in `NEXT_PUBLIC_*` variables.

---

## 3. Node.js Runtime Alignment & Prerequisites Checklist

### 3.1 Node.js Runtime Alignment
- **Tested & Verified Version**: Node.js `v24.18.0` / npm `12.0.2` in development and test pipelines.
- **Production Supported Versions**: Node.js `>=20.0.0` (v20.x LTS, v22.x LTS, or v24.x LTS) and npm `>=10.0.0`.
- **Enforcement**: Explicitly declared in `frontend/package.json` under `"engines"` and pinned in `frontend/.nvmrc` (`v24.18.0`).
- **Production Execution**: Next.js builds production server bundles during `npm run build`, executed via PM2 pointing to Node.js binary.

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
  - [ ] Stable configuration directory prepared under `/var/data/aps-intelligence/config/` with `chmod 600`.
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
| `/var/data/aps-intelligence/config/backend.env` | Operator-provisioned | **Yes** | **Yes** | **Yes** | Backend Service | Permissions `chmod 600`. Contains DB path, CORS origins, limits. |
| `/var/data/aps-intelligence/config/frontend.env` | Operator-provisioned | **Yes** | **Yes** | **Yes** | Frontend PM2 Process | Permissions `chmod 600`. Contains runtime internal loopback URL. |
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
sudo mkdir -p /var/data/aps-intelligence/config
sudo mkdir -p /var/data/aps-intelligence/data/backups
sudo mkdir -p /var/data/aps-intelligence/datasets/raw
sudo mkdir -p /var/data/aps-intelligence/datasets/processed
sudo mkdir -p /var/data/aps-intelligence/artifacts/models
sudo mkdir -p /var/data/aps-intelligence/artifacts/reports
sudo mkdir -p /var/data/aps-intelligence/artifacts/phase9
sudo mkdir -p /var/data/aps-intelligence/artifacts/phase10
sudo chown -R ubuntu:ubuntu /var/data/aps-intelligence
chmod 700 /var/data/aps-intelligence/config

# 2. Provision stable environment files
# Copy production configurations into place:
# cp backend.env /var/data/aps-intelligence/config/backend.env
# cp frontend.env /var/data/aps-intelligence/config/frontend.env
# chmod 600 /var/data/aps-intelligence/config/*.env

# 3. Initialize primary database schema with Alembic
cd /opt/aps-intelligence/current/backend
source .venv/bin/activate
alembic upgrade head

# 4. Verify primary database integrity
python scripts/db_ops.py verify --path /var/data/aps-intelligence/data/aps_intelligence.db
```

---

## 5. SQLite Concurrency, Integrity & Upload Enforcement

### 5.1 Concurrency Reality & SQLite Single-Writer Limitation
- **Single Uvicorn Worker**: Running a single Uvicorn worker process (`--workers 1`) eliminates inter-process lock contention from multiple OS processes.
- **Single Active Writer Limitation**: SQLite permits only **one active write transaction at a time**. Concurrent async coroutines executing in the single Uvicorn event loop will serialize their write operations.
- **Contention Mitigations**:
  - `timeout: 30.0`: The SQLAlchemy engine configures a 30-second SQLite busy timeout, instructing SQLite to wait and retry busy connections up to 30 seconds before raising `sqlite3.OperationalError: database is locked`.
  - **No Guarantee of Success**: The busy timeout handles brief transient lock contention; it does not guarantee every write succeeds if a transaction holds the lock for longer than 30 seconds or if lock starvation occurs.
  - `PRAGMA foreign_keys = ON;`: Enforced on every database connection check-in.
  - Short Transactions: Application services commit or roll back transactions promptly without long-running async computations held inside open transaction contexts.
  - Journal Mode: Database uses standard rollback journal (`PRAGMA journal_mode = DELETE`), keeping database storage in a single predictable `.db` file at rest.

### 5.2 Upload Streaming, Size Enforcement & Resource Lifecycle
- Maximum upload size is strictly limited to **50 MiB (52,428,800 bytes)**.
- Incoming uploads stream in **64 KiB chunks** directly to a target file on disk; chunks are counted on the fly without buffering the entire payload in memory.
- **Cleanup Protocol**:
  - If the uploaded byte stream exceeds `52,428,800 bytes`, the backend terminates the write stream immediately, safely closes the file handle, deletes the partially written file from disk, and returns **HTTP 413 Payload Too Large** (`error_code = "payload_too_large"`).
  - Client disconnects, socket aborts, or unexpected write errors trigger immediate file removal in exception handlers.
  - If dataset registration validation fails after writing the complete file (e.g., non-numeric data, missing headers, or duplicate schema), the temporary file is unlinked immediately and no database metadata is created.
  - In all execution paths (success, 413 error, 400 validation failure, 500 error), incoming `UploadFile` resources are explicitly closed in `finally` blocks to release system file descriptors.
  - Configured APS reference files remain strictly immutable: uploads with non-custom dataset types are rejected upfront with HTTP 400.

---

## 6. Backup & Disaster Recovery Architecture

### 6.1 Operational Backups vs. Proposed Disaster Recovery

| Dimension | Implemented Operational Backup (`db_ops.py`) | Proposed Disaster Recovery (DR) Replication |
|:---|:---|:---|
| **Status** | **Implemented & Locally Verified** | **Design Proposal (Future AWS Provisioning Phase)** |
| **Storage Location** | Local EBS mount (`/var/data/aps-intelligence/data/backups/`) | Encrypted AWS S3 Bucket (`s3://aps-intelligence-dr-<account-id>/`) |
| **Purpose** | Fast rollback before migrations, pre-deployment snapshots, accidental data correction. | Recovery from catastrophic EBS loss, AWS AZ failure, or hardware degradation. |
| **Mechanism** | SQLite Online Backup API (`sqlite3.Connection.backup`) via `db_ops.py backup`. | Encrypted S3 sync script (`aws s3 sync --sse aws:kms`). *(Not implemented in current phase)* |
| **RPO Target** | Pre-deployment: **0 minutes**; Scheduled daily: **<= 24 hours**. | **<= 24 hours** (Proposed design target requiring operational validation). |
| **RTO Target** | **< 2 minutes** (local `db_ops.py restore` execution). | **< 30 minutes** (Proposed design target requiring operational validation). |
| **Integrity Check** | Automatic SHA-256 generation + SQLite `PRAGMA integrity_check` + Alembic revision check. | SHA-256 checksum verification upon retrieval. |

### 6.2 Checksums & Retention Schedule (Proposed Policy)
- **Checksums**: Every backup file `aps_intelligence_backup_<timestamp>.db` is stored alongside a cryptographic SHA-256 checksum file `aps_intelligence_backup_<timestamp>.db.sha256`.
- **Proposed Retention Schedule (GFS Rotation)**:
  - Daily backups: Retained for 7 days.
  - Weekly backups: Retained for 4 weeks.
  - Monthly backups: Retained for 12 months.

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
```

Both frontend and backend are always deployed together and remain paired on the same release. Persistent databases and configuration remain outside the release directories under `/var/data/aps-intelligence/`.

### 7.2 Coordinated Release Sequence (Atomic Symlink Activation)

Because restarting Uvicorn and reloading PM2 introduces brief process restart latency, this deployment pattern is **near-zero downtime**, not true zero-downtime.

```bash
# 1. Define release ID
RELEASE_ID="release-$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="/opt/aps-intelligence/releases/${RELEASE_ID}"

# 2. Clone application code to new release directory
sudo mkdir -p "${RELEASE_DIR}"
sudo git clone https://github.com/SaumyaKhobragade/APS-Intelligence.git "${RELEASE_DIR}"
sudo chown -R ubuntu:ubuntu "${RELEASE_DIR}"

# 3. Setup backend in release directory
cd "${RELEASE_DIR}/backend"
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 4. Setup and build frontend in release directory
cd "${RELEASE_DIR}/frontend"
npm ci
npm run build

# 5. Create pre-deployment database safety backup
cd "${RELEASE_DIR}/backend"
python scripts/db_ops.py backup

# 6. Apply database migrations (if any)
alembic upgrade head

# 7. Atomic Symlink Activation Pattern
# Step 7a: Create temporary symlink pointing to new release
ln -sfn "${RELEASE_DIR}" /opt/aps-intelligence/current.tmp

# Step 7b: Verify target directory exists
test -d /opt/aps-intelligence/current.tmp || { echo "Target missing"; exit 1; }

# Step 7c: Atomically rename symlink on the same filesystem
sudo mv -Tf /opt/aps-intelligence/current.tmp /opt/aps-intelligence/current

# Step 7d: Verify active target
test "$(readlink -f /opt/aps-intelligence/current)" = "${RELEASE_DIR}" || { echo "Symlink target mismatch"; exit 1; }

# 8. Restart backend service and reload frontend process
sudo systemctl restart aps-backend
pm2 reload /opt/aps-intelligence/current/deployment/pm2/ecosystem.config.cjs

# 9. Verify deployment health
curl -f http://127.0.0.1:8000/api/v1/health?verbose=true || exit 1
curl -f -I http://127.0.0.1:3000/ || exit 1
```

### 7.3 Rollback Checklist & Safe Migration Guidelines

If a health check fails or an issue is detected post-deployment:

1. **Assess Impact & Inspect Logs**:
   ```bash
   journalctl -u aps-backend -n 100 --no-pager
   pm2 logs aps-frontend --lines 100
   tail -n 100 /var/log/nginx/error.log
   ```
2. **Atomic Symlink Reversion**:
   ```bash
   # Create temporary symlink to previous stable release
   ln -sfn /opt/aps-intelligence/releases/<PREVIOUS_STABLE_RELEASE> /opt/aps-intelligence/current.tmp
   # Atomically replace current symlink
   sudo mv -Tf /opt/aps-intelligence/current.tmp /opt/aps-intelligence/current
   ```
3. **Restart Application Services**:
   ```bash
   sudo systemctl restart aps-backend
   pm2 reload /opt/aps-intelligence/current/deployment/pm2/ecosystem.config.cjs
   ```
4. **Database Rollback Strategy**:
   - **Do NOT automatically restore an older database**: An application code rollback does not automatically require or justify reverting the database. Restoring a database backup discards any data written since the backup was taken.
   - **Backwards-Compatible Schema Changes**: If new tables or nullable columns were added, leave the database schema intact. The previous application release will ignore unused columns.
   - **Backwards-Incompatible Schema Changes**: Only downgrade migrations (`alembic downgrade <PREVIOUS_REVISION>`) after verifying that the downgrade migration script is explicitly implemented, tested, and will not cause data corruption.
   - **Corrupted Database State**: Only in cases of unrecoverable database corruption, execute offline restoration using:
     ```bash
     sudo systemctl stop aps-backend
     python scripts/db_ops.py restore --backup-file <BACKUP_PATH>
     sudo systemctl start aps-backend
     ```
5. **Post-Rollback Verification**:
   - Check health endpoint: `curl http://127.0.0.1:8000/api/v1/health?verbose=true`.
   - Verify frontend loads: `curl -I http://127.0.0.1:3000/`.
   - Verify Phase 9 candidate (`phase9-final-validation-candidate`, threshold `0.115`, isotonic) and Phase 10 test evidence remain intact.
