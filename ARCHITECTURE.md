# Architecture

## Overview

MiaoDeng is a self-hosted internal login toolkit composed of three main layers:

1. **Portal UI** — the human-facing management console
2. **Python backend** — the API, storage, auth, backup, and packaging layer
3. **Chrome / Edge extension** — the execution layer that performs login-page matching and auto-fill

## High-level flow

```text
User -> Portal UI -> Backend API -> SQLite / local data
                           \
                            -> Extension manifests / ZIP package

Browser login page <- Chrome / Edge extension <- Backend system/rule payload
```

## Core modules

### 1. Portal UI

Main file:

- `sso-portal.html`

Responsibilities:

- system management
- credential editing
- login rule center
- update center
- audit / backup views
- onboarding and plugin installation guidance

### 2. Backend service

Main file:

- `server.py`

Responsibilities:

- static file serving
- auth and session handling
- SQLite persistence
- backup / restore
- audit logging
- login rule APIs
- extension ZIP generation
- version center payload

### 3. Chrome / Edge extension

Main directory:

- `chrome-extension/`

Responsibilities:

- detect current page
- fetch system data from portal
- match login rules
- fill username / password / OTP / token
- submit form using rule-driven strategies

## Data model

The runtime storage is local-first and intentionally simple:

- users
- systems
- likes
- messages
- login rules
- audit logs
- backup files

Persistent runtime data lives in:

- `data/`

This directory is excluded from Git because it may contain sensitive information.

## Rule center model

The login rule center is a reusable abstraction layer between:

- a real login page structure
- a system card in the portal
- the extension execution logic

Each rule can describe:

- domains / path keywords
- flow type
- selectors for username / password / OTP / token
- submit strategy

This allows one portal instance to adapt to many heterogeneous internal systems.

## Deployment

### Standard

- `docker-compose.yml`
- `Dockerfile`

### Optional secure gateway

- `deploy/nginx/`
- `deploy/caddy/`

The default production-friendly path is Docker with a bind-mounted `data/` volume.

## Design principles

- self-hosted first
- low operational complexity
- configurable over hard-coded
- local data ownership
- pragmatic internal-tool UX
- privacy-aware open-source publication
