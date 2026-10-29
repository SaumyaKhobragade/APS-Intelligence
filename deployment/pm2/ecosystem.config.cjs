// =============================================================================
// APS Intelligence - Frontend PM2 Process Manager Configuration
// =============================================================================
// Architecture Note:
//   - Browser-facing requests use same-origin relative `/api/v1` (embedded at build time).
//   - Nginx reverse-proxies `/api/` traffic to FastAPI on 127.0.0.1:8000.
//   - Browser clients never connect to 127.0.0.1 directly.
//   - INTERNAL_API_URL provides runtime loopback resolution for any Node.js SSR calls.
//   - Never place secrets in NEXT_PUBLIC_* variables.
//   - Runtime configuration is loaded from stable path outside release directories:
//     /var/data/aps-intelligence/config/frontend.env
//
// Installation & Startup:
//   1. Build Next.js: npm run build (inside /opt/aps-intelligence/current/frontend)
//   2. Start with PM2: pm2 start ecosystem.config.cjs
//   3. Save process list: pm2 save
//   4. Setup startup hook: pm2 startup
// =============================================================================

const fs = require('fs');

const STABLE_FRONTEND_ENV_PATH = '/var/data/aps-intelligence/config/frontend.env';
const externalEnv = {};

if (fs.existsSync(STABLE_FRONTEND_ENV_PATH)) {
  const content = fs.readFileSync(STABLE_FRONTEND_ENV_PATH, 'utf-8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      externalEnv[key] = val;
    }
  });
}

module.exports = {
  apps: [
    {
      name: 'aps-frontend',
      cwd: '/opt/aps-intelligence/current/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Runtime loopback URL for server-side Next.js fetch requests only:
        INTERNAL_API_URL: 'http://127.0.0.1:8000/api/v1',
        ...externalEnv,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pm2/aps-frontend-error.log',
      out_file: '/var/log/pm2/aps-frontend-out.log',
      merge_logs: true,
    },
  ],
};
