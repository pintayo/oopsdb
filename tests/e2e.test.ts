import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Run a shell command and return stdout */
function run(cmd: string, env?: NodeJS.ProcessEnv): string {
  return execSync(cmd, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  }).trim();
}

/** Run a command with SQL piped to stdin (avoids shell quoting nightmares) */
function runSQL(cmd: string, sql: string, env?: NodeJS.ProcessEnv): string {
  return execSync(cmd, {
    input: sql,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 30_000,
  }).trim();
}

/** Create a temp working directory */
function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oopsdb-e2e-'));
}

/** Write an oopsdb config to a directory (bypasses interactive init) */
function writeConfig(
  workDir: string,
  dbConfig: {
    type: 'postgres' | 'mysql' | 'sqlite';
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database: string;
  }
) {
  const configDir = path.join(workDir, '.oopsdb');
  const backupsDir = path.join(configDir, 'backups');
  fs.mkdirSync(configDir, { recursive: true });
  fs.mkdirSync(backupsDir, { recursive: true });

  const machineKey = crypto
    .createHash('sha256')
    .update(`oopsdb-config-${process.env.USER || 'default'}-${os.hostname()}`)
    .digest();

  const masterKey = crypto.randomBytes(32).toString('hex');

  const config = { db: dbConfig, createdAt: new Date().toISOString(), masterKey };
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', machineKey, iv);
  let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  fs.writeFileSync(
    path.join(configDir, 'config.json'),
    iv.toString('hex') + ':' + encrypted,
    'utf8'
  );
}

/** Dynamic import with cache-busting so process.cwd() is re-evaluated */
async function importDumper() {
  const modPath = require.resolve('../dist/utils/dumper');
  delete require.cache[modPath];
  const configPath = require.resolve('../dist/utils/config');
  delete require.cache[configPath];
  return await import('../dist/utils/dumper');
}

// ─── Seed SQL (piped to stdin to avoid shell escaping issues) ─────────────────

const SEED_TABLE = 'oopsdb_e2e_test';

function pgSeedSQL(): string {
  return `
CREATE TABLE ${SEED_TABLE} (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  data JSONB NOT NULL
);
INSERT INTO ${SEED_TABLE} VALUES (1, 'Alice', '🚀🔥', '{"role":"admin","nested":{"x":1}}'::jsonb);
INSERT INTO ${SEED_TABLE} VALUES (2, 'Bob', '💾✨', '{"role":"user","tags":["a","b"]}'::jsonb);
INSERT INTO ${SEED_TABLE} VALUES (3, 'Charlie O''Brien', '🎉🇺🇸', '{"role":"viewer","special":"quote''s test"}'::jsonb);
`;
}

function mysqlSeedSQL(): string {
  return `
CREATE TABLE ${SEED_TABLE} (
  id INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  emoji VARCHAR(255) NOT NULL,
  data JSON NOT NULL
);
INSERT INTO ${SEED_TABLE} VALUES (1, 'Alice', '🚀🔥', '{"role":"admin","nested":{"x":1}}');
INSERT INTO ${SEED_TABLE} VALUES (2, 'Bob', '💾✨', '{"role":"user","tags":["a","b"]}');
INSERT INTO ${SEED_TABLE} VALUES (3, 'Charlie O''Brien', '🎉🇺🇸', '{"role":"viewer","special":"quote''s test"}');
`;
}

function sqliteSeedSQL(): string {
  return `
CREATE TABLE ${SEED_TABLE} (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  data TEXT NOT NULL
);
INSERT INTO ${SEED_TABLE} VALUES (1, 'Alice', '🚀🔥', '{"role":"admin","nested":{"x":1}}');
INSERT INTO ${SEED_TABLE} VALUES (2, 'Bob', '💾✨', '{"role":"user","tags":["a","b"]}');
INSERT INTO ${SEED_TABLE} VALUES (3, 'Charlie O''Brien', '🎉🇺🇸', '{"role":"viewer","special":"quote''s test"}');
`;
}

// ─── PostgreSQL E2E ───────────────────────────────────────────────────────────

describe('PostgreSQL E2E', () => {
  const DB = 'oopsdb_e2e_pg';
  const USER = 'postgres';
  const PASS = 'testpass';
  const HOST = '127.0.0.1';
  const PORT = 5432;
  const pgEnv = { PGPASSWORD: PASS };
  let workDir: string;

  const psqlCmd = `psql -h ${HOST} -p ${PORT} -U ${USER} -v ON_ERROR_STOP=1`;

  beforeAll(() => {
    try { runSQL(`${psqlCmd}`, `DROP DATABASE IF EXISTS ${DB};`, pgEnv); } catch { /* ignore */ }
    runSQL(`${psqlCmd}`, `CREATE DATABASE ${DB};`, pgEnv);
    runSQL(`${psqlCmd} -d ${DB}`, pgSeedSQL(), pgEnv);
  });

  afterAll(() => {
    try { runSQL(`${psqlCmd}`, `DROP DATABASE IF EXISTS ${DB};`, pgEnv); } catch { /* ignore */ }
  });

  beforeEach(() => {
    workDir = makeTempDir();
    writeConfig(workDir, { type: 'postgres', host: HOST, port: PORT, user: USER, password: PASS, database: DB });
  });

  afterEach(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('snapshot → DROP TABLE → restore → verify data', async () => {
    const origCwd = process.cwd();
    try {
      process.chdir(workDir);
      const { createSnapshot, restoreSnapshot, listSnapshots } = await importDumper();

      // Take snapshot
      const snapshotFile = await createSnapshot({
        type: 'postgres', host: HOST, port: PORT, user: USER, password: PASS, database: DB,
      });

      expect(fs.existsSync(snapshotFile)).toBe(true);
      expect(fs.statSync(snapshotFile).size).toBeGreaterThan(0);
      expect(snapshotFile).toMatch(/\.sql\.enc$/);

      // Verify encrypted — raw bytes should NOT contain readable SQL
      const rawContent = fs.readFileSync(snapshotFile);
      expect(rawContent.toString('utf8')).not.toContain('CREATE TABLE');

      // Verify it shows up in listSnapshots
      const snapshots = listSnapshots();
      expect(snapshots.length).toBe(1);

      // Simulate AI disaster: DROP TABLE
      runSQL(`${psqlCmd} -d ${DB}`, `DROP TABLE ${SEED_TABLE};`, pgEnv);

      // Verify the table is gone
      expect(() =>
        runSQL(`${psqlCmd} -d ${DB}`, `SELECT count(*) FROM ${SEED_TABLE};`, pgEnv)
      ).toThrow();

      // Restore
      await restoreSnapshot(
        { type: 'postgres', host: HOST, port: PORT, user: USER, password: PASS, database: DB },
        snapshotFile
      );

      // Verify data is fully restored
      const result = runSQL(
        `${psqlCmd} -d ${DB} -t -A`,
        `SELECT id, name, emoji FROM ${SEED_TABLE} ORDER BY id;`,
        pgEnv
      );

      const lines = result.split('\n').filter(Boolean);
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('Alice');
      expect(lines[0]).toContain('🚀🔥');
      expect(lines[1]).toContain('Bob');
      expect(lines[1]).toContain('💾✨');
      expect(lines[2]).toContain("O'Brien");
      expect(lines[2]).toContain('🎉🇺🇸');

      // Verify JSON data survived round-trip
      const jsonResult = runSQL(
        `${psqlCmd} -d ${DB} -t -A`,
        `SELECT data->>'role' FROM ${SEED_TABLE} WHERE id=1;`,
        pgEnv
      );
      expect(jsonResult).toBe('admin');
    } finally {
      process.chdir(origCwd);
    }
  }, 60_000);
});

// ─── MySQL E2E ────────────────────────────────────────────────────────────────

describe('MySQL E2E', () => {
  const DB = 'oopsdb_e2e_mysql';
  const USER = 'oopstest';
  const PASS = 'testpass';
  const HOST = '127.0.0.1';
  const PORT = 3306;
  let workDir: string;

  const mysqlCmd = `mysql -h ${HOST} -P ${PORT} -u ${USER} -p${PASS}`;

  beforeAll(() => {
    try { runSQL(mysqlCmd, `DROP DATABASE IF EXISTS ${DB};`); } catch { /* ignore */ }
    runSQL(mysqlCmd, `CREATE DATABASE ${DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    runSQL(`${mysqlCmd} ${DB}`, mysqlSeedSQL());
  });

  afterAll(() => {
    try { runSQL(mysqlCmd, `DROP DATABASE IF EXISTS ${DB};`); } catch { /* ignore */ }
  });

  beforeEach(() => {
    workDir = makeTempDir();
    writeConfig(workDir, { type: 'mysql', host: HOST, port: PORT, user: USER, password: PASS, database: DB });
  });

  afterEach(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('snapshot → DROP TABLE → restore → verify data', async () => {
    const origCwd = process.cwd();
    try {
      process.chdir(workDir);
      const { createSnapshot, restoreSnapshot } = await importDumper();

      // Take snapshot
      const snapshotFile = await createSnapshot({
        type: 'mysql', host: HOST, port: PORT, user: USER, password: PASS, database: DB,
      });

      expect(fs.existsSync(snapshotFile)).toBe(true);
      expect(snapshotFile).toMatch(/\.sql\.enc$/);

      // Verify encrypted
      const rawContent = fs.readFileSync(snapshotFile);
      expect(rawContent.toString('utf8')).not.toContain('CREATE TABLE');

      // Simulate AI disaster
      runSQL(`${mysqlCmd} ${DB}`, `DROP TABLE ${SEED_TABLE};`);

      // Verify gone
      expect(() =>
        runSQL(`${mysqlCmd} ${DB}`, `SELECT * FROM ${SEED_TABLE};`)
      ).toThrow();

      // Restore
      await restoreSnapshot(
        { type: 'mysql', host: HOST, port: PORT, user: USER, password: PASS, database: DB },
        snapshotFile
      );

      // Verify data
      const result = runSQL(
        `${mysqlCmd} ${DB} -N`,
        `SELECT id, name, emoji FROM ${SEED_TABLE} ORDER BY id;`
      );

      const lines = result.split('\n').filter(Boolean);
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('Alice');
      expect(lines[0]).toContain('🚀🔥');
      expect(lines[1]).toContain('Bob');
      expect(lines[2]).toContain("O'Brien");

      // Verify JSON
      const jsonResult = runSQL(
        `${mysqlCmd} ${DB} -N`,
        `SELECT JSON_UNQUOTE(JSON_EXTRACT(data, '$.role')) FROM ${SEED_TABLE} WHERE id=1;`
      );
      expect(jsonResult).toBe('admin');
    } finally {
      process.chdir(origCwd);
    }
  }, 60_000);
});

// ─── SQLite E2E ───────────────────────────────────────────────────────────────

describe('SQLite E2E', () => {
  let workDir: string;
  let dbPath: string;

  beforeEach(() => {
    workDir = makeTempDir();
    dbPath = path.join(workDir, 'test.db');

    // Pipe seed SQL to sqlite3 via stdin
    runSQL(`sqlite3 "${dbPath}"`, sqliteSeedSQL());

    writeConfig(workDir, { type: 'sqlite', database: dbPath });
  });

  afterEach(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('snapshot → delete DB file → restore → verify data', async () => {
    const origCwd = process.cwd();
    try {
      process.chdir(workDir);
      const { createSnapshot, restoreSnapshot } = await importDumper();

      // Take snapshot
      const snapshotFile = await createSnapshot({ type: 'sqlite', database: dbPath });

      expect(fs.existsSync(snapshotFile)).toBe(true);
      expect(snapshotFile).toMatch(/\.db\.enc$/);

      // Verify encrypted
      const rawContent = fs.readFileSync(snapshotFile);
      expect(rawContent.toString('utf8')).not.toContain('CREATE TABLE');

      // Simulate AI disaster: delete the entire database file
      fs.unlinkSync(dbPath);
      expect(fs.existsSync(dbPath)).toBe(false);

      // Restore
      await restoreSnapshot({ type: 'sqlite', database: dbPath }, snapshotFile);

      // Verify data
      const result = runSQL(`sqlite3 "${dbPath}"`, `SELECT id, name, emoji FROM ${SEED_TABLE} ORDER BY id;`);
      const lines = result.split('\n').filter(Boolean);
      expect(lines.length).toBe(3);
      expect(lines[0]).toContain('Alice');
      expect(lines[0]).toContain('🚀🔥');
      expect(lines[1]).toContain('Bob');
      expect(lines[2]).toContain("O'Brien");

      // Verify JSON
      const jsonResult = runSQL(
        `sqlite3 "${dbPath}"`,
        `SELECT json_extract(data, '$.role') FROM ${SEED_TABLE} WHERE id=1;`
      );
      expect(jsonResult).toBe('admin');
    } finally {
      process.chdir(origCwd);
    }
  });

  it('backup works while database is in WAL mode with active writes', async () => {
    const origCwd = process.cwd();
    try {
      process.chdir(workDir);
      const { createSnapshot, restoreSnapshot } = await importDumper();

      // Enable WAL mode
      runSQL(`sqlite3 "${dbPath}"`, 'PRAGMA journal_mode=WAL;');

      // Verify WAL is active
      const mode = runSQL(`sqlite3 "${dbPath}"`, 'PRAGMA journal_mode;');
      expect(mode).toBe('wal');

      // Start a background process that holds an EXCLUSIVE lock, writes, then commits
      // This simulates an app actively using the database
      const locker = spawn('sqlite3', [dbPath], { stdio: ['pipe', 'pipe', 'pipe'] });
      locker.stdin.write('BEGIN EXCLUSIVE;\n');
      locker.stdin.write(`INSERT INTO ${SEED_TABLE} VALUES (99, 'Locker', '🔒', '{"locked":true}');\n`);

      // Give the locker time to acquire the lock
      await new Promise((r) => setTimeout(r, 500));

      // Commit so data is in WAL but WAL file persists
      locker.stdin.write('COMMIT;\n');
      await new Promise((r) => setTimeout(r, 300));

      // Take snapshot while WAL file exists
      const snapshotFile = await createSnapshot({ type: 'sqlite', database: dbPath });
      expect(fs.existsSync(snapshotFile)).toBe(true);

      // Clean up locker process
      locker.stdin.end();
      await new Promise<void>((resolve) => locker.on('close', resolve));

      // Delete original DB + WAL/SHM files
      fs.unlinkSync(dbPath);
      [dbPath + '-wal', dbPath + '-shm'].forEach((f) => {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      });

      // Restore from encrypted backup
      await restoreSnapshot({ type: 'sqlite', database: dbPath }, snapshotFile);

      // Verify the WAL-committed row is present
      const result = runSQL(
        `sqlite3 "${dbPath}"`,
        `SELECT id, name FROM ${SEED_TABLE} WHERE id=99;`
      );
      expect(result).toContain('99');
      expect(result).toContain('Locker');

      // All original data intact too
      const count = runSQL(`sqlite3 "${dbPath}"`, `SELECT count(*) FROM ${SEED_TABLE};`);
      expect(parseInt(count, 10)).toBe(4); // 3 seed rows + 1 WAL-committed row
    } finally {
      process.chdir(origCwd);
    }
  });
});
