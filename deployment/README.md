# APS Intelligence — Production Deployment & Operations Guide

This documentation specifies the production architecture, configuration, deployment sequence, process management, database persistence strategy, and rollback procedures for **APS Intelligence**.

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
1. **Single Uvicorn Worker**: FastAPI runs with `--workers 1` to ensure completely deterministic, conflict-free SQLite concurrency without lock contention.
2. **EBS-Backed Persistence**: SQLite database and ML model artifacts reside on dedicated EBS-backed storage.
3. **Same-Origin API Strategy**: In production, the browser communicates through same-origin relative `/api/v1` routes proxied by Nginx. The browser never accesses `127.0.0.1` directly.
4. **Defense-in-Depth CORS**: In production, CORS strictly forbids wildcard `*` origins and requires explicit allowed domains.
5. **Preserved ML Evidence**: Phase 9 candidate (`phase9-final-validation-candidate`, threshold `0.115`, isotonic calibration) and Phase 10 official-test evaluation evidence remain strictly read-only.

---

## 2. Production Environment Configuration Guide

### 2.1 Backend Environment Configuration (`/opt/aps-intelligence/backend/.env`)

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

### 2.2 Frontend Environment Configuration (`/opt/aps-intelligence/frontend/.env.production`)

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

## 3. Deployment Prerequisites Checklist

Before executing the production deployment, verify all prerequisites:

- [ ] **AWS Infrastructure**:
  - [ ] EC2 Instance provisioned (Ubuntu 22.04 LTS or 24.04 LTS, min 4 GB RAM).
  - [ ] Security Group configured: Inbound 80 (HTTP), 443 (HTTPS), 22 (SSH from admin IP only).
  - [ ] EBS gp3 volume (min 20 GB) attached and mounted to `/var/data/aps-intelligence`.
  - [ ] Elastic IP assigned to EC2 instance.
  - [ ] DNS A-record pointing domain (e.g. `aps.yourdomain.com`) to the Elastic IP.
- [ ] **System Dependencies**:
  - [ ] Node.js v20.x or v22.x LTS installed.
  - [ ] Python 3.11 or 3.13 installed with `python3-venv`.
  - [ ] Nginx installed and enabled.
  - [ ] Certbot (`python3-certbot-nginx`) installed for Let's Encrypt SSL.
  - [ ] PM2 installed globally (`npm install -g pm2`).
  - [ ] Git installed.
- [ ] **Application & Data Assets**:
  - [ ] Repository cloned to `/opt/aps-intelligence`.
  - [ ] Verified SQLite database (`aps_intelligence.db`) copied to persistent EBS volume.
  - [ ] Trained model artifacts and Phase 10 test evaluations in place under `artifacts/` and `datasets/`.

---

## 4. Step-by-Step Production Process Startup Sequence

### 4.1 Step 1: Mount EBS Storage & Prepare Directories
```bash
# 1. Format and mount persistent EBS volume (if new volume)
# Replace /dev/nvme1n1 with actual EBS device identifier:
sudo mkdir -p /var/data/aps-intelligence
sudo mount /dev/nvme1n1 /var/data/aps-intelligence

# Add to /etc/fstab for persistence across reboots:
# UUID=<VOLUME_UUID> /var/data/aps-intelligence ext4 defaults,nofail 0 2

# 2. Create application user directories and permissions
sudo mkdir -p /opt/aps-intelligence /var/data/aps-intelligence/data/backups /var/log/pm2
sudo chown -R ubuntu:ubuntu /opt/aps-intelligence /var/data/aps-intelligence /var/log/pm2
```

### 4.2 Step 2: Clone Repository & Populate Data
```bash
# Clone repository & checkout target branch
git clone https://github.com/SaumyaKhobragade/APS-Intelligence.git /opt/aps-intelligence
cd /opt/aps-intelligence

# Ensure active production database is copied to EBS mount:
# /var/data/aps-intelligence/data/aps_intelligence.db
# Ensure model artifacts exist in:
# /var/data/aps-intelligence/artifacts/models/
```

### 4.3 Step 3: Backend Setup, Verification & Systemd Service
```bash
cd /opt/aps-intelligence/backend

# 1. Create isolated virtual environment & install requirements
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# 2. Verify database integrity and Alembic revision BEFORE starting service
python scripts/db_ops.py verify --path /var/data/aps-intelligence/data/aps_intelligence.db

# 3. Only if migrations are needed, apply head:
# alembic upgrade head

# 4. Install systemd service
sudo cp /opt/aps-intelligence/deployment/systemd/aps-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aps-backend

# 5. Check backend status & verify health
sudo systemctl status aps-backend
curl http://127.0.0.1:8000/api/v1/health?verbose=true
```

### 4.4 Step 4: Frontend Setup, Build & PM2 Process Manager
```bash
cd /opt/aps-intelligence/frontend

# 1. Install production dependencies
npm ci

# 2. Build production Next.js bundle (embeds same-origin relative /api/v1)
npm run build

# 3. Start with PM2
pm2 start /opt/aps-intelligence/deployment/pm2/ecosystem.config.cjs
pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu

# 4. Verify local frontend HTTP response
curl -I http://127.0.0.1:3000/
```

### 4.5 Step 5: Nginx Reverse Proxy & SSL Setup
```bash
# 1. Safely render Nginx template without corrupting internal Nginx variables ($host, $request_uri, etc.)
python3 /opt/aps-intelligence/deployment/scripts/render_nginx_conf.py \
    --template /opt/aps-intelligence/deployment/nginx/aps-intelligence.conf.template \
    --output /etc/nginx/sites-available/aps-intelligence.conf \
    --domain aps.yourdomain.com

# 2. Enable site
sudo ln -sf /etc/nginx/sites-available/aps-intelligence.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# 3. Provision SSL certificate with Certbot
sudo certbot --nginx -d aps.yourdomain.com
```

---

## 5. EBS Database Persistence & Backup Guide

### 5.1 Storage Layout
```
/var/data/aps-intelligence/
├── data/
│   ├── aps_intelligence.db          # Active production SQLite database
│   └── backups/                     # Verified timestamped point-in-time backups
├── datasets/
│   ├── raw/
│   └── processed/
└── artifacts/
    ├── models/                      # Serialized ML model artifacts (.joblib)
    ├── phase9/                      # Phase 9 validation reports
    └── phase10/                     # Phase 10 official test evidence (read-only)
```

### 5.2 SQLite Concurrency & Reliability
- **Connection Pragma**: `PRAGMA foreign_keys = ON;` is enforced on all active SQLAlchemy connections.
- **Connection Timeout**: `timeout: 30.0` prevents transient locking issues.
- **Rollback Journal**: Standard rollback journal mode ensures single-file integrity and consistent file snapshots.

### 5.3 Point-in-Time Verified Online Backups
Use the provided `backend/scripts/db_ops.py` utility to create consistent online backups without service interruption:

```bash
# Run manual online backup
cd /opt/aps-intelligence/backend
.venv/bin/python scripts/db_ops.py backup

# Verify backup integrity, schema compliance, and Alembic revision
.venv/bin/python scripts/db_ops.py verify --path /var/data/aps-intelligence/data/backups/aps_intelligence_backup_YYYYMMDD_HHMMSS.db
```

### 5.4 Automated Cron Backup Schedule
Add the following job to `crontab -e` for daily automated backups at 02:00 UTC:
```cron
0 2 * * * cd /opt/aps-intelligence/backend && /opt/aps-intelligence/backend/.venv/bin/python scripts/db_ops.py backup >> /var/log/aps-db-backup.log 2>&1
```

### 5.5 Database Restoration Procedure
The restore utility enforces mandatory safety checks:
1. **Service Manager Verification**: Enforces that the production `aps-backend` systemd service is completely stopped (`systemctl is-active aps-backend`) before proceeding. Restore refuses to proceed if the service is running.
2. **Explicit Non-Systemd Confirmation Guard**: In non-systemd or test environments where `systemctl` is not present, requires `--confirmed-offline-maintenance` to prevent accidental overwrites.
3. **Supplementary Process Lock Detection**: Uses SQLite exclusive locking checks to verify no stray background processes hold active SQLite transactions.
4. **Sidecar (-wal, -shm, -journal) Isolation & Archival**: Detects existing sidecar files, archives them alongside the safety snapshot, and cleanly removes stale sidecars upon atomic database swap so that restored databases never inherit corrupt or stale WAL/SHM pages.
5. **Pre-flight Integrity & Alembic Verification**: Validates SQLite integrity (`PRAGMA integrity_check`) and schema compatibility / supported Alembic revision (`20261027_0005`) on the backup file.
6. **Mandatory Safety Snapshot**: Automatically creates a timestamped safety backup of the active database (and any active sidecars) before any modification.
7. **Staging Database Verification & Atomic Replacement**: Restores into a temporary staging database first, verifies it, and performs an atomic swap (`os.replace`). If any step fails, the original database and sidecars remain completely untouched.

#### Production Restore Sequence (Linux / systemd)
```bash
# 1. Stop backend service
sudo systemctl stop aps-backend

# 2. Restore from verified backup
cd /opt/aps-intelligence/backend
.venv/bin/python scripts/db_ops.py restore \
    --backup-file /var/data/aps-intelligence/data/backups/aps_intelligence_backup_YYYYMMDD_HHMMSS.db \
    --target /var/data/aps-intelligence/data/aps_intelligence.db

# 3. Restart backend service & verify health
sudo systemctl start aps-backend
curl http://127.0.0.1:8000/api/v1/health?verbose=true
```

#### Non-Production / Test / Container Restore Sequence
```bash
# In environments where systemd is not running, provide explicit confirmation:
cd /opt/aps-intelligence/backend
.venv/bin/python scripts/db_ops.py restore \
    --backup-file /var/data/aps-intelligence/data/backups/aps_intelligence_backup_YYYYMMDD_HHMMSS.db \
    --target /var/data/aps-intelligence/data/aps_intelligence.db \
    --confirmed-offline-maintenance
```

---

## 6. Deployment Rollback Checklist

If a critical issue occurs post-deployment, execute the following rollback steps:

1. **Assess Impact & Stop Traffic**:
   - Check status and error logs:
     ```bash
     journalctl -u aps-backend -n 100 --no-pager
     pm2 logs aps-frontend --lines 100
     tail -n 100 /var/log/nginx/error.log
     ```
2. **Frontend Rollback**:
   - Checkout previous stable commit:
     ```bash
     cd /opt/aps-intelligence/frontend
     git checkout <PREVIOUS_STABLE_COMMIT>
     npm ci
     npm run build
     pm2 reload aps-frontend
     ```
3. **Backend Rollback**:
   - Checkout previous stable commit:
     ```bash
     cd /opt/aps-intelligence/backend
     git checkout <PREVIOUS_STABLE_COMMIT>
     sudo systemctl restart aps-backend
     ```
4. **Database Rollback (if schema changed or data corrupted)**:
   - Stop backend: `sudo systemctl stop aps-backend`
   - Identify latest pre-deployment backup in `/var/data/aps-intelligence/data/backups/`.
   - Restore using `.venv/bin/python scripts/db_ops.py restore --backup-file <BACKUP_PATH>`
   - Restart: `sudo systemctl start aps-backend`
5. **Post-Rollback Verification**:
   - Execute health check: `curl http://127.0.0.1:8000/api/v1/health?verbose=true`
   - Verify frontend loads: `curl -I http://127.0.0.1:3000/`
   - Verify Phase 9 candidate (`phase9-final-validation-candidate`, threshold `0.115`, isotonic) and Phase 10 test evidence remain intact.
