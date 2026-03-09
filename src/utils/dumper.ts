import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { DbConfig, getBackupsDir, getEncryptionKey } from './config';

const CIPHER_ALGO = 'aes-256-cbc';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Creates an encrypted, streamed snapshot of the database.
 *
 * For Postgres/MySQL: spawns pg_dump/mysqldump and pipes stdout → cipher → file.
 * For SQLite: uses the native .backup command (always writes to a file), then
 * streams that temp file through the cipher into the final encrypted output.
 *
 * Memory footprint stays near-zero regardless of database size.
 */
export async function createSnapshot(config: DbConfig): Promise<string> {
  const backupsDir = getBackupsDir();
  const ts = timestamp();

  if (config.type === 'sqlite') {
    return createSqliteSnapshot(config, backupsDir, ts);
  }

  // Postgres and MySQL both emit SQL to stdout — stream it through the cipher
  const ext = config.type === 'postgres' ? 'pg' : 'mysql';
  const outFile = path.join(backupsDir, `${ext}_${ts}.sql.enc`);
  const { cmd, args, env } = getDumpCommand(config);

  const iv = crypto.randomBytes(16);
  // Write the IV as the first 16 bytes of the file
  const outStream = fs.createWriteStream(outFile);
  outStream.write(iv);

  const cipher = crypto.createCipheriv(CIPHER_ALGO, getEncryptionKey(), iv);
  const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exitPromise = new Promise<void>((resolve, reject) => {
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `${cmd} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });

  await Promise.all([
    pipeline(child.stdout, cipher, outStream),
    exitPromise,
  ]);

  return outFile;
}

/**
 * Restores a database from an encrypted snapshot file by streaming:
 * file → decipher → psql/mysql stdin.
 *
 * For SQLite: deciphers to a temp file, then copies over the original.
 */
export async function restoreSnapshot(config: DbConfig, snapshotPath: string): Promise<void> {
  if (config.type === 'sqlite') {
    return restoreSqliteSnapshot(config, snapshotPath);
  }

  const { cmd, args, env } = getRestoreCommand(config);
  const inStream = fs.createReadStream(snapshotPath);

  // Read the first 16 bytes as IV
  const iv = await readIV(snapshotPath);
  const fileStream = fs.createReadStream(snapshotPath, { start: 16 });
  const decipher = crypto.createDecipheriv(CIPHER_ALGO, getEncryptionKey(), iv);

  const child = spawn(cmd, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exitPromise = new Promise<void>((resolve, reject) => {
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `${cmd} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });

  await Promise.all([
    pipeline(fileStream, decipher, child.stdin),
    exitPromise,
  ]);
}

export function listSnapshots(): { file: string; time: Date; size: number }[] {
  const backupsDir = getBackupsDir();
  if (!fs.existsSync(backupsDir)) return [];

  return fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith('.sql.enc') || f.endsWith('.db.enc'))
    .map((f) => {
      const fullPath = path.join(backupsDir, f);
      const stat = fs.statSync(fullPath);
      return { file: fullPath, time: stat.mtime, size: stat.size };
    })
    .sort((a, b) => b.time.getTime() - a.time.getTime());
}

// ─── SQLite helpers ──────────────────────────────────────────────────────────

async function createSqliteSnapshot(
  config: DbConfig,
  backupsDir: string,
  ts: string
): Promise<string> {
  const outFile = path.join(backupsDir, `sqlite_${ts}.db.enc`);
  const tmpFile = path.join(backupsDir, `sqlite_${ts}.db.tmp`);

  // sqlite3 .backup writes directly to a file — we can't stream its stdout.
  // Use the native backup, then stream the result through the cipher.
  const child = spawn('sqlite3', [config.database, `.backup '${tmpFile}'`]);

  await new Promise<void>((resolve, reject) => {
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`sqlite3 backup exited with code ${code}`));
      else resolve();
    });
  });

  // Stream the tmp file through cipher to the encrypted output
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(CIPHER_ALGO, getEncryptionKey(), iv);
  const outStream = fs.createWriteStream(outFile);
  outStream.write(iv);

  await pipeline(fs.createReadStream(tmpFile), cipher, outStream);

  // Remove the unencrypted temp file
  fs.unlinkSync(tmpFile);

  return outFile;
}

async function restoreSqliteSnapshot(config: DbConfig, snapshotPath: string): Promise<void> {
  const iv = await readIV(snapshotPath);
  const decipher = crypto.createDecipheriv(CIPHER_ALGO, getEncryptionKey(), iv);
  const fileStream = fs.createReadStream(snapshotPath, { start: 16 });
  const outStream = fs.createWriteStream(config.database);

  await pipeline(fileStream, decipher, outStream);
}

// ─── Command builders ────────────────────────────────────────────────────────

function getDumpCommand(config: DbConfig): { cmd: string; args: string[]; env: NodeJS.ProcessEnv } {
  const env = { ...process.env };

  if (config.type === 'postgres') {
    if (config.password) env.PGPASSWORD = config.password;
    return {
      cmd: 'pg_dump',
      args: [
        '-h', config.host || 'localhost',
        '-p', String(config.port || 5432),
        '-U', config.user || 'postgres',
        config.database,
      ],
      env,
    };
  }

  // mysql
  const args = [
    '-h', config.host || 'localhost',
    '-P', String(config.port || 3306),
    '-u', config.user || 'root',
  ];
  if (config.password) args.push(`-p${config.password}`);
  args.push(config.database);

  return { cmd: 'mysqldump', args, env };
}

function getRestoreCommand(config: DbConfig): { cmd: string; args: string[]; env: NodeJS.ProcessEnv } {
  const env = { ...process.env };

  if (config.type === 'postgres') {
    if (config.password) env.PGPASSWORD = config.password;
    return {
      cmd: 'psql',
      args: [
        '-h', config.host || 'localhost',
        '-p', String(config.port || 5432),
        '-U', config.user || 'postgres',
        config.database,
      ],
      env,
    };
  }

  // mysql
  const args = [
    '-h', config.host || 'localhost',
    '-P', String(config.port || 3306),
    '-u', config.user || 'root',
  ];
  if (config.password) args.push(`-p${config.password}`);
  args.push(config.database);

  return { cmd: 'mysql', args, env };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function readIV(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { start: 0, end: 15 });
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
