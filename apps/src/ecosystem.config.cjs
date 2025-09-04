module.exports = {
  apps: [
    {
      name: 'a4mulagupta',
      cwd: '/var/www/aformulationoftruth/backend',
      // If you build TS -> JS, use './dist/server.js'
      script: './server.js',
      exec_mode: 'fork',
      instances: 1,
      node_args: '--enable-source-maps',
      watch: false,
      autorestart: true,
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      max_memory_restart: '512M',
      kill_timeout: 5000,

      // Load .env automatically (recommended)
      env_file: '.env',

      // Dev overrides (optional)
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },

      // Production overrides
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        CORS_ORIGIN: 'https://aformulationoftruth.com',
        SESSION_SECRET: 'hex:51194b2bdd2c2c19e70cffef5988a477280143d6c797e357aebaa2e70d00a587f924ca10ce4c0c86f9029cb39f6178530a226e89d4b8e3929eee934984ea13a9',
        OLD_SESSION_SECRET: '65fed571088e4ee61340283f8af22aef413b79376e02d85c205a94058314f11e',
        // DATABASE_URL / VPS_ENCRYPTION_KEY come from .env
      },

      // Logs
      error_file: '/var/log/pm2/a4m.err.log',
      out_file:   '/var/log/pm2/a4m.out.log',
      merge_logs: true,
      time: true,
    }
  ]
};
