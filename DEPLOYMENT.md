# Deployment

## Deployment architecture

MiaoDeng is currently a **single-service deployment**:

- `server.py` serves the frontend page (`/sso-portal.html`)
- `server.py` also serves all backend APIs (`/api/*`)

That means:

- Docker already deploys **frontend + backend together**
- local `python3 server.py` also starts **frontend + backend together**
- if you use Nginx, you usually only need to reverse-proxy **one upstream port: `6680`**

## Prerequisites

Choose one runtime path before deployment:

- **Docker path**
- **Local Python path**

### Docker path prerequisites

Required:

- Docker
- Docker Compose

Quick verification:

```bash
docker --version
docker compose version
```

If the machine does not have Docker yet:

- **macOS / Windows**: install Docker Desktop
- **Linux**: install Docker Engine + Docker Compose Plugin

### Local Python path prerequisites

Required:

- Python `3.11+`

Quick verification:

```bash
python3 --version
```

Current backend runtime uses the Python standard library only, so there is **no separate `pip install -r requirements.txt` step** at the moment.

If Python is missing:

- **macOS**
  - `brew install python@3.11`
  - or install Python from the official installer
- **Ubuntu / Debian**
  - `sudo apt-get update`
  - `sudo apt-get install -y python3`
- **CentOS / Rocky / RHEL**
  - `sudo dnf install -y python3`
- **Windows**
  - install Python and enable **Add Python to PATH**

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
- Frontend page: `http://localhost:6680/sso-portal.html`
- API base: `http://localhost:6680/api/`

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
- this gateway is only a reverse proxy in front of the same app service

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

If `python3` is not available, install Python first using the prerequisite section above.

Default URL:

```text
http://localhost:6680
```

This same process serves:

- frontend page
- backend API
- static assets such as the extension manifest

## Use your own Nginx

If you already operate Nginx outside Docker, you do not need to split frontend and backend into separate services. Reverse-proxy the same MiaoDeng upstream process.

### Minimal HTTP reverse proxy example

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    location / {
        proxy_pass http://127.0.0.1:6680;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### If you want HTTPS

Terminate TLS in Nginx as usual, then keep proxying to:

```text
http://127.0.0.1:6680
```

### When to use the built-in gateway instead

Use `docker compose --profile secure up -d` if you want the repository-provided Nginx gateway and self-signed certificate flow out of the box.

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
