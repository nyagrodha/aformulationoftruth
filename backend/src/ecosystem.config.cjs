module.exports = {
  apps: [
    {
      name: 'a4mulagupta',
      cwd: '/var/www/aformulationoftruth/backend',
      script: './src/server.js',
      exec_mode: 'fork',
      instances: 1,
      env_file: '.env',              // ← load secrets from .env
      env: {                         // defaults for dev (optional)
        NODE_ENV: 'development',
        PORT: 8080,
      },
      env_production: {              // overrides when run with --env production
        NODE_ENV: 'production',
        PORT: 8080,                  // keep Express on 8080
      },
      error_file: '/var/log/pm2/a4m.err.log',
      out_file:   '/var/log/pm2/a4m.out.log',
      time: true,
    },
  ],
};
