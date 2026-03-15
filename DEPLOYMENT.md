# Deployment

## Recommended deployment: Docker

### 1. Prepare environment

```bash
cp .env.docker.example .env
```

Edit `.env` and set at least:

- `ADMIN_PASSWORD`
- `DEFAULT_USER_PASSWORD`
- `ENCRYPT_KEY`

### 2. Start service

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f sso-portal
```

### 3. Access

- Portal: `http://localhost:6680`

Data persistence:

- local `./data`
- container `/app/data`

## Optional secure gateway

You can enable the built-in gateway profile:

```bash
docker compose --profile secure up -d
```

Then access:

- HTTP: `http://localhost:8080`
- HTTPS: `https://localhost:8443`

Notes:

- default certificate is self-signed
- browser warning on first visit is expected

## Environment variables

### Required in practice

- `ADMIN_PASSWORD`
- `DEFAULT_USER_PASSWORD`
- `ENCRYPT_KEY`

### Session / backup

- `SESSION_TTL_HOURS`
- `REMEMBER_SESSION_TTL_DAYS`
- `BACKUP_INTERVAL_HOURS`
- `BACKUP_RETENTION_COUNT`

### Secure gateway

- `TLS_DOMAINS`
- `TLS_CERT_DAYS`

## Upgrade

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

## Local Python deployment

If you do not want Docker:

```bash
export ADMIN_PASSWORD='your-admin-password'
export DEFAULT_USER_PASSWORD='default-user-password'
export ENCRYPT_KEY='your-encrypt-key'
python3 server.py
```

Default URL:

```text
http://localhost:6680
```

## Health verification

### Docker health

```bash
docker compose ps
```

### API health

```bash
curl http://127.0.0.1:6680/api/user/check
curl http://127.0.0.1:6680/api/version-center
```

## Backup strategy

Runtime backups are stored under:

```text
data/backups/
```

Recommendations:

- mount `data/` to persistent storage
- back up the entire `data/` directory regularly
- keep `ENCRYPT_KEY` safe and stable across restarts

## Reverse proxy notes

The repository includes:

- `deploy/nginx/`
- `deploy/caddy/`

For public or company-wide deployment, you can also place MiaoDeng behind your own reverse proxy and trusted TLS certificate.

## Open-source safety checklist

Before publishing your own fork or deployment template:

- do not commit `.env`
- do not commit `data/` real files
- do not commit DB / backup / key / cert files
- do not expose real internal URLs in screenshots or docs

