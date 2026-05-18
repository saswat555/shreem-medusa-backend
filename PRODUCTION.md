# Shreem Backend Production Runbook

Production must run the compiled Medusa server, not the development server.

Use this flow on the VM:

```bash
cd /opt/shreem/backend
git pull origin main
npm install
NODE_ENV=production npm run db:migrate
rm -rf .medusa/server .medusa/admin .cache
NODE_ENV=production npm run build
test -f .medusa/server/public/admin/index.html
cp .env.production .medusa/server/.env.production 2>/dev/null || cp .env .medusa/server/.env.production
cd .medusa/server
npm install --omit=dev
cd /opt/shreem/backend
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

Uploads are kept in `/opt/shreem/backend/static`. At runtime the compiled
server prepares `/opt/shreem/backend/.medusa/server/static` as a symlink to that
persistent directory, so old image URLs keep working after rebuilds.

Do not start production with `pm2 start "npm start" --cwd /opt/shreem/backend`.
That runs from the source root and can fail to find the built admin `index.html`.

If a PM2 process already exists that was created with `npm run dev`, replace it:

```bash
pm2 delete medusa
pm2 start ecosystem.config.cjs --update-env
pm2 save
```

The backend production command is run from `/opt/shreem/backend/.medusa/server`:

```bash
NODE_ENV=production npm run start
```

Do not use `npm run dev` in production. It starts Medusa Develop, recompiles
source code, and is meant only for local development.

After deploy, check:

```bash
pm2 logs medusa --lines 80
ls -la /opt/shreem/backend/.medusa/server/static
curl -I http://127.0.0.1:9000/app
find /opt/shreem/backend/static -type f | head -1
curl -s http://127.0.0.1:9000/store/regions
```

Set `REDIS_URL=redis://127.0.0.1:6379` in production env and keep Redis running
to avoid the Express session `MemoryStore` warning and use Redis-backed cache,
event bus, workflow, lock, and session stores.
