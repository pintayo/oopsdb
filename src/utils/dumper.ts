import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { DbConfig, getBackupsDir } from './config';

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

export async function createSnapshot(config: DbConfig): Promise<string> {
  const backupsDir = getBackupsDir();
  const ts = timestamp();
  let outFile: string;

  switch (config.type) {
    case 'postgres': {
      outFile = path.join(backupsDir, `pg_${ts}.sql`);
      const host = config.host || 'localhost';
      const port = config.port || 5432;
      const envPrefix = config.password
        ? `PGPASSWORD=${shellEscape(config.password)} `
        : '';
      const cmd = `${envPrefix}pg_dump -h ${shellEscape(host)} -p ${port} -U ${shellEscape(config.user || 'postgres')} ${shellEscape(config.database)} > ${shellEscape(outFile)}`;
      await runCommand(cmd);
      break;
    }

    case 'mysql': {
      outFile = path.join(backupsDir, `mysql_${ts}.sql`);
      const host = config.host || 'localhost';
      const port = config.port || 3306;
      const passFlag = config.password
        ? `-p${shellEscape(config.password)}`
        : '';
      const cmd = `mysqldump -h ${shellEscape(host)} -P ${port} -u ${shellEscape(config.user || 'root')} ${passFlag} ${shellEscape(config.database)} > ${shellEscape(outFile)}`;
      await runCommand(cmd);
      break;
    }

    case 'sqlite': {
      outFile = path.join(backupsDir, `sqlite_${ts}.db`);
      const cmd = `sqlite3 ${shellEscape(config.database)} ".backup '${shellEscape(outFile)}'"`;
      await runCommand(cmd);
      break;
    }

    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }

  return outFile;
}

export async function restoreSnapshot(config: DbConfig, snapshotPath: string): Promise<void> {
  switch (config.type) {
    case 'postgres': {
      const host = config.host || 'localhost';
      const port = config.port || 5432;
      const envPrefix = config.password
        ? `PGPASSWORD=${shellEscape(config.password)} `
        : '';
      const cmd = `${envPrefix}psql -h ${shellEscape(host)} -p ${port} -U ${shellEscape(config.user || 'postgres')} ${shellEscape(config.database)} < ${shellEscape(snapshotPath)}`;
      await runCommand(cmd);
      break;
    }

    case 'mysql': {
      const host = config.host || 'localhost';
      const port = config.port || 3306;
      const passFlag = config.password
        ? `-p${shellEscape(config.password)}`
        : '';
      const cmd = `mysql -h ${shellEscape(host)} -P ${port} -u ${shellEscape(config.user || 'root')} ${passFlag} ${shellEscape(config.database)} < ${shellEscape(snapshotPath)}`;
      await runCommand(cmd);
      break;
    }

    case 'sqlite': {
      // For SQLite, just copy the backup file over the original
      fs.copyFileSync(snapshotPath, config.database);
      break;
    }

    default:
      throw new Error(`Unsupported database type: ${config.type}`);
  }
}

export function listSnapshots(): { file: string; time: Date; size: number }[] {
  const backupsDir = getBackupsDir();
  if (!fs.existsSync(backupsDir)) return [];

  return fs
    .readdirSync(backupsDir)
    .filter((f) => f.endsWith('.sql') || f.endsWith('.db'))
    .map((f) => {
      const fullPath = path.join(backupsDir, f);
      const stat = fs.statSync(fullPath);
      return { file: fullPath, time: stat.mtime, size: stat.size };
    })
    .sort((a, b) => b.time.getTime() - a.time.getTime());
}

function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
