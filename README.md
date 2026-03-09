# OopsDB

Don't let AI nuke your database. Auto-backup and 1-click restore for developers using Claude Code, OpenClaw, and other AI coding agents.

## The Problem

AI coding agents like Claude Code and OpenClaw have terminal access. Sometimes they decide the best way to fix a bug is to `DROP TABLE`, run `terraform destroy`, or wipe your SQLite file. When that happens, you need a backup — fast.

## Install

```bash
npm install -g oopsdb
```

## Quick Start

```bash
# 1. Set up your database connection
oopsdb init

# 2. Start auto-backing up (every 5 minutes by default)
oopsdb watch

# 3. AI nuked your DB? Roll back instantly
oopsdb restore
```

## Commands

| Command | Description |
|---------|-------------|
| `oopsdb init` | Configure your database connection (PostgreSQL, MySQL, SQLite) |
| `oopsdb watch` | Start background auto-backups at an interval |
| `oopsdb watch -i 1` | Auto-backup every 1 minute |
| `oopsdb snapshot` | Take a one-time manual snapshot |
| `oopsdb restore` | Pick a snapshot and roll back your database |
| `oopsdb status` | View backup status and recent snapshots |

## Supported Databases

- **PostgreSQL** (including Supabase, Neon, and other hosted Postgres)
- **MySQL / MariaDB**
- **SQLite**

## How It Works

1. `oopsdb init` saves your database credentials locally in an encrypted config file (`.oopsdb/config.json`)
2. `oopsdb watch` runs `pg_dump`, `mysqldump`, or `sqlite3 .backup` at your chosen interval
3. Snapshots are saved locally in `.oopsdb/backups/` with timestamps
4. `oopsdb restore` lets you pick any snapshot and restores it — it even takes a safety snapshot first

## Requirements

Your system needs the native database tools installed:

- PostgreSQL: `pg_dump` and `psql`
- MySQL: `mysqldump` and `mysql`
- SQLite: `sqlite3`

## Security

- Credentials are encrypted at rest using AES-256-CBC with a machine-local key
- All backups stay on your local machine — nothing leaves your computer
- Add `.oopsdb/` to your `.gitignore` (it's already in ours)

## License

MIT
