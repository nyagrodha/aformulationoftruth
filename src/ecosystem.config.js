module.exports = {
  apps: [
    {
      name: "a4mulagupta",
      cwd: "/var/www/aformulationoftruth/src",
      script: "server.js",
      interpreter: "/usr/bin/node",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "4000"
      },
      out_file: "/var/log/pm2/a4mulaguptasya.out.log",
      error_file: "/var/log/pm2/a4mulaguptasya.err.log",
      merge_logs: true,
      restart_delay: 6500
    },
    {
      name: "vps-storage",
      cwd: "/var/www/aformulationoftruth",
      script: "vps-server.js",
      interpreter: "/usr/bin/node",
      exec_mode: "fork",
      instances: 1,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: "4001"
      },
      out_file: "/var/log/pm2/vps-storage.out.log",
      error_file: "/var/log/pm2/vps-storage.err.log",
      merge_logs: true,
      restart_delay: 3500
    }
  ]
}
