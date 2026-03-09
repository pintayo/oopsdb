import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const CONFIG_DIR = path.join(process.cwd(), '.oopsdb');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const BACKUPS_DIR = path.join(CONFIG_DIR, 'backups');

// Simple encryption using a machine-local key derived from hostname + username
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(`oopsdb-${process.env.USER || 'default'}-${require('os').hostname()}`)
  .digest();

export interface DbConfig {
  type: 'postgres' | 'mysql' | 'sqlite';
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database: string;
  connectionString?: string;
}

export interface OopsConfig {
  db: DbConfig;
  createdAt: string;
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
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
  const encrypted = encrypt(JSON.stringify(config));
  fs.writeFileSync(CONFIG_FILE, encrypted, 'utf8');
}

export function loadConfig(): OopsConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    const encrypted = fs.readFileSync(CONFIG_FILE, 'utf8');
    const decrypted = decrypt(encrypted);
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

export function getEncryptionKey(): Buffer {
  return ENCRYPTION_KEY;
}
