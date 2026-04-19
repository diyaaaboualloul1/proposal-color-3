module.exports = {
  apps: [
    {
      name: 'srs-platform-backend',
      script: 'server.js',
      cwd: '/srs-platform/backend',
      env_production: {
        NODE_ENV: 'production',
        PORT: 6001
      },
      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000
    }
  ]
}
