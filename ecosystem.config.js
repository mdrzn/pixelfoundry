module.exports = {
  apps: [
    {
      name: "pixelfoundry",
      script: "node_modules/.bin/next",
      args: "start -p 6116",
      cwd: "/home/tools/public_html/dashboard-app",
      kill_timeout: 5000,
      wait_ready: false,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
        PORT: "6116"
      }
    },
    {
      name: "pixelfoundry-worker",
      script: "npm",
      args: "run worker",
      cwd: "/home/tools/public_html/dashboard-app",
      kill_timeout: 10000,
      wait_ready: false,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 3000,
      env: {
        NODE_ENV: "production",
        PIPELINE_WORKER_CONCURRENCY: "2"
      }
    }
  ]
};
