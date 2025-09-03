// /var/www/aformulationoftruth/backend/ecosystem.config.cjs
module.exports = { apps: [{ name: 
    'a4mulagupta', cwd: 
    '/var/www/aformulationoftruth/backend', 
    script: './src/server.js', 
    exec_mode: 'fork', instances: 
    1, node_args: 
    '--enable-source-maps', env: 
    {
      NODE_ENV: 'production', 
      PORT: '3000', 
      SESSION_SECRET: 
      'paste-your-generated-secret-here'
    },
    error_file: 
    '/var/log/pm2/a4m.err.log', 
    out_file: 
    '/var/log/pm2/a4m.out.log', 
    time: true
  }]
};
