// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'a4mulagupta',
    cwd: '/var/www/aformulationoftruth/backend',
    script: './src/server.js',       // ✅ not dist
    node_args: '--enable-source-maps',
    exec_mode: 'fork',
    instances: 1,
    env: { NODE_ENV: 'production', PORT: '3000' },
    error_file: '/var/log/pm2/a4m.err.log',
    out_file:   '/var/log/pm2/a4m.out.log',
    time: true
  }]
}
