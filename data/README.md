# Runtime data directory

This folder is intentionally kept out of version control.

It may contain:

- SQLite database files
- user/system credential data
- generated encryption keys
- admin password hashes
- automatic backup files
- local TLS certificates

For open-source publication, **never commit any real files from this directory**.

Keep only:

- `data/.gitignore`
- `data/README.md`

