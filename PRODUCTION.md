# Shreem Backend Production Runbook

Production must run the compiled Medusa server, not the development server.

Use this flow on the VM:

```bash
cd /opt/shreem/backend
git pull origin main
npm install
npm run build
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

If a PM2 process already exists that was created with `npm run dev`, replace it:

```bash
pm2 delete medusa
pm2 start ecosystem.config.cjs --update-env
pm2 save
```

The backend production command is:

```bash
NODE_ENV=production npm run start
```

Do not use `npm run dev` in production. It starts Medusa Develop, recompiles
source code, and is meant only for local development.

After deploy, check:

```bash
pm2 logs medusa --lines 80
curl -I http://127.0.0.1:9000/app
curl -s http://127.0.0.1:9000/store/regions
```
