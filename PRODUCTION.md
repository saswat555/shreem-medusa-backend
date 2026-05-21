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

## Shiprocket Troubleshooting

Shiprocket API auth must use a Shiprocket API user, not necessarily the normal
dashboard login. If `/admin/shiprocket/test-auth` returns `403 Invalid email and
password combination`, create/reset the API user in Shiprocket settings and
update `SHIPROCKET_EMAIL` / `SHIPROCKET_PASSWORD`.

Validate auth directly from the VM:

```bash
cd /opt/shreem/backend
set -a
source .env
set +a

BASE="${SHIPROCKET_BASE_URL:-https://apiv2.shiprocket.in/v1/external}"
curl -sS -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SHIPROCKET_EMAIL\",\"password\":\"$SHIPROCKET_PASSWORD\"}"
```

Validate courier serviceability after auth succeeds:

```bash
TOKEN=$(curl -sS -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$SHIPROCKET_EMAIL\",\"password\":\"$SHIPROCKET_PASSWORD\"}" \
  | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).token")

curl -i -G "$BASE/courier/serviceability/" \
  -H "Authorization: Bearer $TOKEN" \
  --data-urlencode "pickup_postcode=${SHIPROCKET_PICKUP_POSTCODE:-486001}" \
  --data-urlencode "delivery_postcode=110001" \
  --data-urlencode "weight=${SHIPROCKET_DEFAULT_WEIGHT_KG:-0.5}" \
  --data-urlencode "cod=0"
```

Validate the Medusa route:

```bash
curl -sS -X POST http://127.0.0.1:9000/store/shiprocket/rates \
  -H "Content-Type: application/json" \
  -d '{"delivery_postcode":"110001","weight":0.5,"cod":false}'
```

If direct Shiprocket auth works but Medusa fails, restart with fresh env:

```bash
cd /opt/shreem/backend
NODE_ENV=production npm run build
pm2 delete medusa || true
cd .medusa/server
cp ../../.env .env
npm install --omit=dev
NODE_ENV=production HOST=0.0.0.0 PORT=9000 pm2 start npm --name medusa -- run start
pm2 save
```

## Astrology AI Runtime

The storefront queues Gemini requests per Node process. Useful production env:

```bash
ASTROLOGY_AI_TIMEOUT_MS=90000
ASTROLOGY_AI_MAX_ATTEMPTS=2
ASTROLOGY_AI_CONCURRENCY=3
ASTROLOGY_AI_MAX_OUTPUT_TOKENS=4096
```

Use higher concurrency only if Gemini quota allows it. Retries happen server-side
for timeouts, rate limits, transient 5xx errors, and invalid JSON responses.
