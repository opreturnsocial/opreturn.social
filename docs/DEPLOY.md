# ORS MVP VPS Deployment Plan

## Context

Deploy the three ORS services (cache-server, facilitator, frontend) to a VPS that already runs Bitcoin Core (IBD complete) and Caddy. The backend services run as systemd units from `/opt/ors-mvp`. The frontend is served as static files by Caddy. Three subdomains route traffic.

**Assumed subdomains** (replace `example.com` throughout):

- `ors.example.com` → frontend static files
- `cache.ors.example.com` → cache-server :3001
- `facilitator.ors.example.com` → facilitator :3002

---

## Phase 1 - VPS Prerequisites

### 1.1 Node.js 20 + Yarn

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn
```

### 1.2 Bitcoin Core wallet for facilitator

```bash
# Create a dedicated wallet (or use existing one - note its name)
bitcoin-cli createwallet "ors-facilitator"

# Fund it with some BTC for paying tx fees
# (mainnet: send BTC to an address in that wallet)
bitcoin-cli -rpcwallet=ors-facilitator getnewaddress
```

### 1.3 NWC URL (Lightning payment receiver)

The facilitator collects sats via a hold invoice. You need a **Nostr Wallet Connect URL** for the wallet that will receive payments. Get this from Alby Hub or another NWC-compatible wallet. Save it — you'll need it for the facilitator `.env`.

---

## Phase 2 - Clone and Build

```bash
sudo mkdir -p /opt/ors-mvp
sudo chown $USER:$USER /opt/ors-mvp
cd /opt/ors-mvp
git clone <your-github-repo-url> .
```

### 2.1 Configure environment files

**cache-server** (`apps/cache-server/.env`):

```bash
cp apps/cache-server/.env.example apps/cache-server/.env
```

Edit values:

```ini
BITCOIN_RPC_HOST=127.0.0.1
BITCOIN_RPC_PORT=8332          # mainnet port (not 18443)
BITCOIN_RPC_USER=<your-rpc-user>
BITCOIN_RPC_PASS=<your-rpc-pass>
DATABASE_URL=file:/opt/ors-mvp/apps/cache-server/data/prod.db
CACHE_SERVER_PORT=3001
```

**facilitator** (`apps/facilitator/.env`):

```bash
cp apps/facilitator/.env.example apps/facilitator/.env
```

Edit values:

```ini
BITCOIN_RPC_HOST=127.0.0.1
BITCOIN_RPC_PORT=8332
BITCOIN_RPC_USER=<your-rpc-user>
BITCOIN_RPC_PASS=<your-rpc-pass>
BITCOIN_RPC_WALLET=ors-facilitator
CACHE_SERVER_URL=http://localhost:3001
FACILITATOR_PORT=3002
DATABASE_URL=file:/opt/ors-mvp/apps/facilitator/data/prod.db
NWC_URL=<your-nwc-url>
FEE_MARKUP_PERCENT=10
INVOICE_EXPIRY_SECS=600
```

**frontend** (`apps/frontend/.env`):

```bash
cp apps/frontend/.env.example apps/frontend/.env
```

Edit values:

```ini
VITE_FACILITATOR_URL=https://facilitator.ors.example.com
VITE_CACHE_SERVER_URL=https://cache.ors.example.com
```

> **Important:** These VITE\_ vars are baked into the frontend bundle at build time. Set them correctly before building.

### 2.2 Create data directories for SQLite

```bash
mkdir -p apps/cache-server/data apps/facilitator/data
```

### 2.3 Install

```bash
yarn install
```

### 2.4 Database setup

```bash
cd /opt/ors-mvp/apps/cache-server
yarn db:generate
yarn db:migrate:prod

cd /opt/ors-mvp/apps/facilitator
yarn db:generate
yarn db:migrate:prod
```

### 2.5 Build

```bash
yarn build
```

---

## Phase 3 - Systemd Services

### 3.1 cache-server service

```bash
sudo tee /etc/systemd/system/ors-cache.service <<EOF
[Unit]
Description=ORS Cache Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/ors-mvp/apps/cache-server
ExecStart=/usr/bin/node /opt/ors-mvp/apps/cache-server/dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/ors-mvp/apps/cache-server/.env

[Install]
WantedBy=multi-user.target
EOF
```

### 3.2 facilitator service

```bash
sudo tee /etc/systemd/system/ors-facilitator.service <<EOF
[Unit]
Description=ORS Facilitator
After=network.target ors-cache.service

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/ors-mvp/apps/facilitator
ExecStart=/usr/bin/node /opt/ors-mvp/apps/facilitator/dist/index.js
Restart=on-failure
RestartSec=5
EnvironmentFile=/opt/ors-mvp/apps/facilitator/.env

[Install]
WantedBy=multi-user.target
EOF
```

### 3.3 Enable and start

```bash
sudo systemctl daemon-reload
sudo systemctl enable ors-cache ors-facilitator
sudo systemctl start ors-cache ors-facilitator
sudo systemctl status ors-cache ors-facilitator
```

Check logs:

```bash
journalctl -u ors-cache -f
journalctl -u ors-facilitator -f
```

---

## Phase 4 - Caddy Configuration

Add a new file (or append to existing Caddyfile). Caddy will auto-provision TLS.

```caddy
# Frontend - static SPA
ors.example.com {
    root * /opt/ors-mvp/apps/frontend/dist
    try_files {path} /index.html
    file_server
}

# Cache server API
cache.ors.example.com {
    reverse_proxy localhost:3001
}

# Facilitator API
facilitator.ors.example.com {
    reverse_proxy localhost:3002
}
```

Reload Caddy:

```bash
sudo caddy reload --config /etc/caddy/Caddyfile
# or
sudo systemctl reload caddy
```

---

## Phase 5 - DNS

Add DNS A records (or CNAME to your existing domain) for:

- `ors.example.com` → VPS IP
- `cache.ors.example.com` → VPS IP
- `facilitator.ors.example.com` → VPS IP

---

## Verification

1. `curl https://cache.ors.example.com/posts` - should return JSON (empty array is fine)
2. `curl https://facilitator.ors.example.com/` - should return some response (404 or status OK)
3. Open `https://ors.example.com` in browser - frontend loads
4. Check systemd logs for any errors after a few minutes

---

## Updates / Redeployment

```bash
cd /opt/ors-mvp
git pull
yarn install
yarn build:protocol
yarn build
# If schema changed:
(cd apps/cache-server && yarn db:migrate:prod && yarn db:generate)
(cd apps/facilitator && yarn db:migrate:prod && yarn db:generate)
sudo systemctl restart ors-cache ors-facilitator
```

---

## Critical File Paths

| File                                          | Purpose                          |
| --------------------------------------------- | -------------------------------- |
| `apps/cache-server/.env`                      | RPC creds, DB path, port         |
| `apps/facilitator/.env`                       | RPC creds, NWC URL, wallet name  |
| `apps/frontend/.env`                          | VITE\_ API URLs (baked at build) |
| `apps/cache-server/prisma/schema.prisma`      | DB schema                        |
| `apps/facilitator/prisma/schema.prisma`       | DB schema                        |
| `apps/frontend/dist/`                         | Caddy serves this                |
| `/etc/systemd/system/ors-cache.service`       | Systemd unit                     |
| `/etc/systemd/system/ors-facilitator.service` | Systemd unit                     |
