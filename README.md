# OopsDB

**Don't let AI nuke your database.**

Auto-backup and 1-click restore for developers using Claude Code, Cursor, Windsurf, and other AI coding agents.

---

## The Problem

You're vibing. Claude Code is cranking through tasks. Then it decides the fastest way to fix a migration is `DROP TABLE users`. Or it runs `DELETE FROM orders` without a `WHERE` clause. Or it helpfully "cleans up" your SQLite file.

Your data is gone. Your afternoon is gone. Your will to live is negotiable.

## The Fix

```bash
npm install -g oopsdb
oopsdb init      # connect your DB (Supabase, Postgres, MySQL, SQLite)
oopsdb watch     # auto-backup every 5 min
# ... AI nukes your DB ...
oopsdb restore   # pick a snapshot, roll back instantly
```

That's it. Three commands. Your data survives the AI apocalypse.

## What It Does

- **Auto-backups** on a timer (`oopsdb watch`) — set it and forget it
- **Manual snapshots** (`oopsdb snapshot`) — before risky migrations or YOLO prompts
- **Interactive restore** (`oopsdb restore`) — pick any snapshot, roll back in seconds
- **Safety snapshots** — automatically backs up your current state before restoring, so you can't oops your oops
- **Encrypted at rest** — AES-256-CBC encryption on every backup file
- **Zero cloud, zero accounts** — everything stays on your machine
- **Streaming backups** — near-zero memory footprint regardless of DB size

## Supported Databases

| Database | Backup Tool | Restore Tool |
|----------|------------|--------------|
| **Supabase** | `pg_dump` (with Supabase flags) | `psql` |
| PostgreSQL (Neon, local, other hosted) | `pg_dump` | `psql` |
| MySQL / MariaDB | `mysqldump` | `mysql` |
| SQLite | `sqlite3` | `sqlite3` |

### Supabase (first-class support)

OopsDB has dedicated Supabase support. Just paste your connection string:

```bash
oopsdb init
# → Select "Supabase"
# → Paste your connection string from Supabase Dashboard → Settings → Database
# → Done. SSL and Supabase-specific pg_dump flags are handled automatically.
```

Supabase-specific flags applied automatically: `--no-owner`, `--no-privileges`, `--no-subscriptions`, `sslmode=require`.

## Commands

```
oopsdb init                Set up your database connection
oopsdb watch               Auto-backup every 5 minutes
oopsdb watch -i 1          Auto-backup every 1 minute (paranoid mode)
oopsdb snapshot            One-time manual backup
oopsdb restore             Interactive restore from any snapshot
oopsdb status              View backup history and stats
oopsdb activate <key>      Activate a Pro license
oopsdb deactivate          Deactivate your license on this machine
oopsdb license             Show current license status and plan
oopsdb secure              Immutable cloud backups (Coming Soon)
oopsdb clean               Remove all OopsDB data from project
```

## How It Works

1. `oopsdb init` walks you through connecting your database. Credentials are encrypted and saved locally in `.oopsdb/config.json`.
2. `oopsdb watch` runs the native dump tool (`pg_dump`, `mysqldump`, or `sqlite3 .backup`) at your chosen interval. Output is streamed through AES-256-CBC encryption directly to disk — memory usage stays flat even for large databases.
3. `oopsdb restore` shows your snapshots with timestamps and sizes. Pick one, confirm, and your database is rolled back. It takes a safety snapshot first, so you can always undo the undo.

## Requirements

Your system needs the native database CLI tools:

- **PostgreSQL**: `pg_dump` + `psql`
- **MySQL**: `mysqldump` + `mysql`
- **SQLite**: `sqlite3`

OopsDB checks for these on `init` and gives install instructions if they're missing.

## Security

- Credentials encrypted at rest (AES-256-CBC, machine-local key)
- Backup files encrypted at rest (AES-256-CBC, streaming encryption)
- Nothing leaves your machine — no cloud, no telemetry, no accounts
- Add `.oopsdb/` to `.gitignore` (already in ours)

## Coming Soon: `oopsdb secure`

Immutable cloud backups that even a rogue AI can't delete.

Local backups are great until the AI decides to `rm -rf .oopsdb/`. `oopsdb secure` pushes encrypted snapshots to tamper-proof cloud storage with write-once retention policies. Even if your entire machine gets wiped, your backups survive.

Sign up for early access at [oopsdb.com/secure](https://oopsdb.com/secure).

## License

MIT
