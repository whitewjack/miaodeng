# API

Base URL:

```text
http://localhost:6680
```

Most write endpoints use JSON request bodies.

## Authentication

Login:

```http
POST /api/auth
Content-Type: application/json
```

Request:

```json
{
  "user": "alice",
  "password": "your-password",
  "remember": true
}
```

Success response:

```json
{
  "ok": true,
  "token": "xxx",
  "token_type": "Bearer",
  "user": "alice",
  "role": "editor"
}
```

Authenticated requests support:

- `Authorization: Bearer <token>`
- `X-Auth-Token: <token>`

## Session

### Get current session

```http
GET /api/session
```

- `200`: session valid
- `401`: session invalid or expired

## Users

### Check user existence

```http
GET /api/user/check?user=alice
```

### Register user

```http
POST /api/register
```

Request:

```json
{
  "user": "alice",
  "password": "your-password"
}
```

### Change password

```http
POST /api/change-password
```

Request:

```json
{
  "user": "alice",
  "old_password": "old-password",
  "new_password": "new-password"
}
```

### List users

```http
GET /api/users
```

### Delete user

```http
DELETE /api/users/{user}
```

Notes:

- requires admin permission
- `default` user cannot be deleted

## Systems

System APIs are user-scoped through `?user=...`.

### List systems

```http
GET /api/systems?user=alice
```

Behavior:

- authenticated users receive full credentials
- unauthenticated readers receive redacted credentials

### Create system

```http
POST /api/systems?user=alice
```

### Update system

```http
PUT /api/systems/{id}?user=alice
```

### Delete system

```http
DELETE /api/systems/{id}?user=alice
```

### Pin / unpin system

```http
PUT /api/systems/{id}/pin?user=alice
```

### Reorder systems

```http
POST /api/systems/reorder?user=alice
```

Request:

```json
{
  "order": [3, 1, 2]
}
```

### Import systems

```http
POST /api/systems/import?user=alice
```

Request:

```json
{
  "mode": "merge",
  "systems": []
}
```

Modes:

- `merge`
- `replace`

### Export systems

```http
GET /api/systems/export?user=alice
GET /api/systems/export?user=alice&include_cred=1
```

Notes:

- `include_cred=1` requires authentication
- default export removes sensitive fields

### Health check for a target URL

```http
POST /api/systems/health
```

Request:

```json
{
  "url": "https://example.com/login"
}
```

## Login rules

### List rules

```http
GET /api/login-rules?user=alice
```

### Save rules

```http
PUT /api/login-rules?user=alice
```

Request:

```json
{
  "items": []
}
```

## Audit logs

Admin only.

### Query audit logs

```http
GET /api/audit-logs?page=1&page_size=20&user=alice&action=system.add
```

## Backups

Admin only.

### List backups

```http
GET /api/backups
```

### Create backup

```http
POST /api/backups
```

### Restore backup

```http
POST /api/backups/restore
```

Request:

```json
{
  "file": "backup-file-name.db"
}
```

## Likes and messages

### Get likes

```http
GET /api/likes
```

### Toggle like

```http
POST /api/likes
```

### Get messages

```http
GET /api/messages
```

### Create message

```http
POST /api/messages
```

## Version center

### Get portal and plugin version info

```http
GET /api/version-center
```

## Static assets

Useful built-in assets:

- `/sso-portal.html`
- `/CHANGELOG.md`
- `/chrome-extension/manifest.json`
- `/auto-login-extension.zip`
- `/miaodeng-latest.zip`

## Notes

- API behavior is intentionally pragmatic and optimized for self-hosted internal tooling
- response fields may evolve with product iterations
- for exact contract examples, also see `tests/test_server_api.py`

