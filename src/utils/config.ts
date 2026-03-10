import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const CONFIG_DIR = path.join(process.cwd(), '.oopsdb');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const BACKUPS_DIR = path.join(CONFIG_DIR, 'backups');

// We no longer use a deterministic machine key because it binds the user to a specific machine.
// Instead, we will generate a secure random 256-bit MASTER_KEY upon initialization.

export interface DbConfig {
  type: 'postgres' | 'mysql' | 'sqlite';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
  connectionString?: string;
  /** When true, uses Supabase-specific pg_dump flags (--no-owner, --no-privileges, --no-subscriptions) */
  supabase?: boolean;
  /** SSL mode for Postgres connections (e.g., 'require', 'verify-full') */
  sslmode?: string;
}

export interface OopsConfig {
  db: DbConfig;
  createdAt: string;
  masterKey: string; // Stored as a hex string representing the 32-byte key
}

// We encrypt the config file itself using a static machine-local key so that
// rogue processes can't easily read the master key in plain text from the file system.
// Note: This machineKey is NOT used for the database backups, only the config.json.
const MACHINE_KEY = crypto
  .createHash('sha256')
  .update(`oopsdb-config-${process.env.USER || 'default'}-${require('os').hostname()}`)
  .digest();

function encryptConfig(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', MACHINE_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptConfig(text: string): string {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', MACHINE_KEY, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function ensureConfigDir(): void {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
  } catch (err: any) {
    if (err.code === 'EACCES') {
      throw new Error(`Permission denied creating ${CONFIG_DIR}. Check directory permissions.`);
    }
    if (err.code === 'ENOSPC') {
      throw new Error('Disk full. Free up space and try again.');
    }
    throw err;
  }
}

export function saveConfig(config: OopsConfig): void {
  ensureConfigDir();
  const encrypted = encryptConfig(JSON.stringify(config));
  fs.writeFileSync(CONFIG_FILE, encrypted, 'utf8');
}

export function loadConfig(): OopsConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    const encrypted = fs.readFileSync(CONFIG_FILE, 'utf8');
    const decrypted = decryptConfig(encrypted);
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

export function getBackupsDir(): string {
  ensureConfigDir();
  return BACKUPS_DIR;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function generateMasterKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function getEncryptionKey(): Buffer {
  const config = loadConfig();
  if (!config || !config.masterKey) {
    throw new Error('No Master Key found. Please run `oopsdb init` to set up your keys.');
  }
  return Buffer.from(config.masterKey, 'hex');
}
