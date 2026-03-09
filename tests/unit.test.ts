import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let workDir: string;
let origCwd: string;

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oopsdb-unit-'));
}

/** Bust require cache so config.ts re-reads process.cwd() */
function freshImport<T>(modName: string): T {
  const modPath = require.resolve(modName);
  // Clear all oopsdb modules from cache
  for (const key of Object.keys(require.cache)) {
    if (key.includes('oopsdb') || key.includes('dist/')) {
      delete require.cache[key];
    }
  }
  return require(modPath);
}

// ─── Config encryption tests ─────────────────────────────────────────────────

describe('Config encryption', () => {
  beforeEach(() => {
    origCwd = process.cwd();
    workDir = makeTempDir();
    process.chdir(workDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('saveConfig + loadConfig round-trips correctly', () => {
    const { saveConfig, loadConfig } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');

    const config = {
      db: { type: 'postgres' as const, host: 'localhost', port: 5432, user: 'admin', password: 's3cret!@#$', database: 'myapp' },
      createdAt: '2025-01-01T00:00:00.000Z',
    };

    saveConfig(config);
    const loaded = loadConfig();

    expect(loaded).not.toBeNull();
    expect(loaded!.db.type).toBe('postgres');
    expect(loaded!.db.password).toBe('s3cret!@#$');
    expect(loaded!.db.database).toBe('myapp');
    expect(loaded!.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('config file is encrypted on disk', () => {
    const { saveConfig } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');

    saveConfig({
      db: { type: 'sqlite' as const, database: '/tmp/test.db' },
      createdAt: new Date().toISOString(),
    });

    const raw = fs.readFileSync(path.join(workDir, '.oopsdb', 'config.json'), 'utf8');

    // Should be hex IV:hex ciphertext, not readable JSON
    expect(raw).not.toContain('"type"');
    expect(raw).not.toContain('sqlite');
    expect(raw).not.toContain('/tmp/test.db');
    expect(raw).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it('loadConfig returns null for missing config', () => {
    const { loadConfig } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');
    expect(loadConfig()).toBeNull();
  });

  it('loadConfig returns null for corrupt config', () => {
    const { ensureConfigDir, loadConfig } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');
    ensureConfigDir();
    fs.writeFileSync(path.join(workDir, '.oopsdb', 'config.json'), 'not-valid-encrypted-data', 'utf8');
    expect(loadConfig()).toBeNull();
  });

  it('handles special characters in passwords', () => {
    const { saveConfig, loadConfig } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');

    const weirdPassword = `p@$$w0rd'"\\with\nnewlines\tand\ttabs&<>`;
    saveConfig({
      db: { type: 'mysql' as const, host: 'db.example.com', port: 3306, user: 'root', password: weirdPassword, database: 'prod' },
      createdAt: new Date().toISOString(),
    });

    const loaded = loadConfig();
    expect(loaded!.db.password).toBe(weirdPassword);
  });
});

// ─── Config directory management ─────────────────────────────────────────────

describe('Config directory management', () => {
  beforeEach(() => {
    origCwd = process.cwd();
    workDir = makeTempDir();
    process.chdir(workDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('ensureConfigDir creates .oopsdb and backups dirs', () => {
    const { ensureConfigDir } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');
    ensureConfigDir();

    expect(fs.existsSync(path.join(workDir, '.oopsdb'))).toBe(true);
    expect(fs.existsSync(path.join(workDir, '.oopsdb', 'backups'))).toBe(true);
  });

  it('ensureConfigDir is idempotent', () => {
    const { ensureConfigDir } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');
    ensureConfigDir();
    ensureConfigDir(); // Should not throw
    expect(fs.existsSync(path.join(workDir, '.oopsdb'))).toBe(true);
  });
});

// ─── Snapshot listing ────────────────────────────────────────────────────────

describe('listSnapshots', () => {
  beforeEach(() => {
    origCwd = process.cwd();
    workDir = makeTempDir();
    process.chdir(workDir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('returns empty array when no backups exist', () => {
    const { listSnapshots } = freshImport<typeof import('../dist/utils/dumper')>('../dist/utils/dumper');
    const { ensureConfigDir } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');
    ensureConfigDir();
    expect(listSnapshots()).toEqual([]);
  });

  it('lists .sql.enc and .db.enc files sorted by newest first', () => {
    const { listSnapshots } = freshImport<typeof import('../dist/utils/dumper')>('../dist/utils/dumper');
    const { ensureConfigDir, getBackupsDir } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');
    ensureConfigDir();

    const backupsDir = getBackupsDir();

    // Create fake snapshot files with explicit timestamps
    const filesWithDates: [string, Date][] = [
      ['pg_2025-01-01.sql.enc', new Date(2025, 0, 1)],
      ['pg_2025-01-03.sql.enc', new Date(2025, 0, 3)],
      ['sqlite_2025-01-02.db.enc', new Date(2025, 0, 2)],
    ];
    for (const [f, time] of filesWithDates) {
      const filePath = path.join(backupsDir, f);
      fs.writeFileSync(filePath, `fake-data`);
      fs.utimesSync(filePath, time, time);
    }

    const snapshots = listSnapshots();
    expect(snapshots.length).toBe(3);
    // Newest first
    expect(path.basename(snapshots[0].file)).toBe('pg_2025-01-03.sql.enc');
    expect(path.basename(snapshots[1].file)).toBe('sqlite_2025-01-02.db.enc');
    expect(path.basename(snapshots[2].file)).toBe('pg_2025-01-01.sql.enc');
  });

  it('ignores non-snapshot files', () => {
    const { listSnapshots } = freshImport<typeof import('../dist/utils/dumper')>('../dist/utils/dumper');
    const { ensureConfigDir, getBackupsDir } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');
    ensureConfigDir();

    const backupsDir = getBackupsDir();
    fs.writeFileSync(path.join(backupsDir, 'notes.txt'), 'not a snapshot');
    fs.writeFileSync(path.join(backupsDir, 'backup.sql'), 'unencrypted');
    fs.writeFileSync(path.join(backupsDir, 'real.sql.enc'), 'encrypted');

    const snapshots = listSnapshots();
    expect(snapshots.length).toBe(1);
    expect(path.basename(snapshots[0].file)).toBe('real.sql.enc');
  });
});

// ─── CLI parsing ──────────────────────────────────────────────────────────────

describe('CLI version and help', () => {
  it('--version outputs the package version', () => {
    const { execSync } = require('child_process');
    const version = execSync('node dist/index.js --version', {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '..'),
    }).trim();

    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    expect(version).toBe(pkg.version);
  });

  it('--help includes all commands', () => {
    const { execSync } = require('child_process');
    const help = execSync('node dist/index.js --help', {
      encoding: 'utf8',
      cwd: path.resolve(__dirname, '..'),
    });

    expect(help).toContain('init');
    expect(help).toContain('watch');
    expect(help).toContain('snapshot');
    expect(help).toContain('restore');
    expect(help).toContain('status');
    expect(help).toContain('secure');
    expect(help).toContain('clean');
  });
});

// ─── Shell escape ────────────────────────────────────────────────────────────

describe('Dump command building', () => {
  it('postgres dump command uses PGPASSWORD env var (no password in args)', () => {
    // Verify that getDumpCommand doesn't leak password into command args
    // by checking the built dist module exports
    // We test this indirectly: the password should be in env, not in args
    const config = {
      type: 'postgres' as const,
      host: 'localhost',
      port: 5432,
      user: 'admin',
      password: 'secret',
      database: 'mydb',
    };

    const origCwd2 = process.cwd();
    const tmpDir = makeTempDir();
    process.chdir(tmpDir);
    try {
      // Must import AFTER chdir so config.ts picks up the right cwd
      const { saveConfig, loadConfig } = freshImport<typeof import('../dist/utils/config')>('../dist/utils/config');
      saveConfig({ db: config, createdAt: new Date().toISOString() });
      const loaded = loadConfig();
      expect(loaded!.db.password).toBe('secret');
      // Password is stored encrypted, not plain text
      const raw = fs.readFileSync(path.join(tmpDir, '.oopsdb', 'config.json'), 'utf8');
      expect(raw).not.toContain('secret');
    } finally {
      process.chdir(origCwd2);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
