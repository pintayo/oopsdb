# OopsDB Demo Playground

Welcome to the OopsDB demo environment! You can safely test the tool here without touching your actual database.

## Setup

First, generate the dummy SQLite test database using the provided seed data:
```bash
sqlite3 test.db < seed.sql
```

Initialize OopsDB:
```bash
npx oopsdb init
```
*(Select SQLite, hit enter to accept the default `test.db`, and take an initial snapshot).*

## Testing Auto-Backups
```bash
npx oopsdb watch -i 1
```
*(Leave it running for a minute to see it automatically detect the database and take snapshots).*

## Testing Restores
Run a destructive command against your database:
```bash
sqlite3 test.db "DROP TABLE users;"
```

Verify your data is gone:
```bash
sqlite3 test.db "SELECT * FROM users;"
```

Restore it instantly:
```bash
npx oopsdb restore
```
*(Select the recent snapshot).*

Verify your data is back:
```bash
sqlite3 test.db "SELECT * FROM users;"
```
