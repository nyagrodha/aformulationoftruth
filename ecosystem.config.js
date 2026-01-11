module.exports = {
  apps: [{
    name: 'backend-server',
    script: './backend/server.js',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: '/var/log/nodeapp/backend.log',
    error_file: '/var/log/nodeapp/backend-error.log'
  }, {
    name: 'vps-storage',
    script: './vps-server.js',
    instances: 1,
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      VPS_API_KEY: 'D3C9A1CEF965DCFA7C541FB250B42E3F'
    },
    log_file: '/var/log/nodeapp/vps.log',
    error_file: '/var/log/nodeapp/vps-error.log'
  }]
};
