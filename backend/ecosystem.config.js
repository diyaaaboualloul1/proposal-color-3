module.exports = {
  apps: [
    {
      name: 'srs-platform-backend',
      script: 'server.js',
      cwd: '/srs-platform/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 6001
      },
      error_file: '/srs-platform/backend/logs/error.log',
      out_file: '/srs-platform/backend/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }
  ]
};
