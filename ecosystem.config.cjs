module.exports = {
  apps: [
    {
      name: "medusa",
      cwd: "/opt/shreem/backend",
      script: "npm",
      args: "run start",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "9000",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "900M",
      time: true,
    },
  ],
}
