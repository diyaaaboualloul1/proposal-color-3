module.exports = {
  apps: [{
    name: 'srs-platform-frontend',
    script: 'npx',
    args: 'vite preview --host 0.0.0.0 --port 6060',
    cwd: '/srs-platform/frontend',
    instances: 1,
    env: { NODE_ENV: 'production' }
  }]
}
