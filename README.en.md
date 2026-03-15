# MiaoDeng

[中文 README](./README.md)

📚 Docs hub: [`docs/README.md`](./docs/README.md)

Self-hosted portal and Chrome extension for internal system auto-login.

> Deployment note: the project is currently **frontend + backend in one service**. `server.py` serves both the portal page (`/sso-portal.html`) and backend APIs (`/api/*`), so Docker and local Python startup both bring up the full application together.

## Prerequisites

You can choose either of these two deployment methods:

- **Docker deployment**: best if you want the fastest all-in-one startup
- **Local Python deployment**: best if Docker is not installed on the machine

### Option 1 prerequisites: Docker

Make sure the machine already has:

- `docker`
- `docker compose`

Quick check:

```bash
docker --version
docker compose version
```

If not installed:

- **macOS / Windows**: install Docker Desktop
- **Linux**: install Docker Engine + Docker Compose Plugin

### Option 2 prerequisites: Python

The backend currently has **no extra pip dependencies**. You only need **Python 3.11+**.

Quick check:

```bash
python3 --version
```

If not installed:

- **macOS**
  - with Homebrew: `brew install python@3.11`
  - or install Python from the official installer
- **Ubuntu / Debian**
  - `sudo apt-get update`
  - `sudo apt-get install -y python3`
- **CentOS / Rocky / RHEL**
  - `sudo dnf install -y python3`
- **Windows**
  - install Python and enable **Add Python to PATH**

## What it does

- Centralized portal for internal systems
- Credential storage for multiple users
- Configurable login rule center
- Chrome extension for auto-fill and auto-submit
- Support for password / OTP / TOTP / token-based login flows
- Audit logs, backups, update center, and Docker deployment

## Quick Start

### Docker

```bash
cp .env.docker.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f sso-portal
```

Default URL:

- Portal: `http://localhost:6680`
- Data dir: `./data`

### Local Python

```bash
python3 server.py
```

If `python3` is not found, install Python first using the prerequisite guide above.

This starts all of the following together:

- Frontend page: `http://localhost:6680/sso-portal.html`
- Default entry: `http://localhost:6680`
- Backend API: `http://localhost:6680/api/*`

### Use your own Nginx / reverse proxy

If you already have Nginx, you do **not** need to deploy a separate frontend site. Just reverse-proxy the same upstream port `6680`, because both the page and the API are served by `server.py`.

Minimal example:

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

## Install the Chrome Extension

Recommended flow: **ZIP install**

1. Open the portal
2. Click **Install Extension**
3. Download and unzip the extension package
4. Open `chrome://extensions/` in Chrome
5. Enable **Developer mode**
6. Click **Load unpacked**
7. Select the `chrome-extension` directory
8. Open the extension popup
9. Enter your portal URL and save

## Environment Variables

See `.env.docker.example`.

Important variables:

- `ADMIN_PASSWORD`
- `DEFAULT_USER_PASSWORD`
- `ENCRYPT_KEY`
- `SESSION_TTL_HOURS`
- `REMEMBER_SESSION_TTL_DAYS`
- `BACKUP_INTERVAL_HOURS`
- `BACKUP_RETENTION_COUNT`

## Development Checks

```bash
python3 - <<'PY'
from pathlib import Path
html = Path('sso-portal.html').read_text()
start = html.rfind('<script>')
end = html.rfind('</script>')
Path('/tmp/sso_portal_inline.js').write_text(html[start+len('<script>'):end])
print('/tmp/sso_portal_inline.js')
PY

node --check /tmp/sso_portal_inline.js
node --check chrome-extension/content.js
node --check chrome-extension/popup.js
node --check chrome-extension/background.js
python3 -m unittest tests.test_server_api tests.test_frontend_regressions -q
node --test tests/test_autosubmit_utils.mjs
docker compose config
```

## Security & Data

This repository does **not** include real runtime data.

Never commit:

- `.env`
- `data/` real files
- SQLite databases
- backups
- encryption keys
- TLS private keys

See:

- [`API.md`](./API.md)
- [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- [`SECURITY.md`](./SECURITY.md)
- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
- [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- [`ROADMAP.md`](./ROADMAP.md)

## License

MIT
