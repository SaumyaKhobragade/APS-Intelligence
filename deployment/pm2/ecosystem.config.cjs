// =============================================================================
// APS Intelligence - Frontend PM2 Process Manager Configuration
// =============================================================================
// Installation & Startup:
//   1. Build Next.js: npm run build (inside /opt/aps-intelligence/frontend)
//   2. Start with PM2: pm2 start ecosystem.config.cjs
//   3. Save process list: pm2 save
//   4. Setup startup hook: pm2 startup
// =============================================================================

module.exports = {
  apps: [
    {
      name: 'aps-frontend',
      cwd: '/opt/aps-intelligence/frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000 -H 127.0.0.1',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NEXT_PUBLIC_API_URL: 'http://127.0.0.1:8000',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/log/pm2/aps-frontend-error.log',
      out_file: '/var/log/pm2/aps-frontend-out.log',
      merge_logs: true,
    },
  ],
};
