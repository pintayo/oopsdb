import { exec } from 'child_process';
import chalk from 'chalk';
import { DbConfig } from './config';

interface ToolCheck {
  command: string;
  versionFlag: string;
  name: string;
  installHint: string;
}

const TOOL_MAP: Record<DbConfig['type'], { dump: ToolCheck; restore: ToolCheck }> = {
  postgres: {
    dump: {
      command: 'pg_dump',
      versionFlag: '--version',
      name: 'pg_dump',
      installHint:
        '  brew install postgresql     (macOS)\n' +
        '  sudo apt install postgresql-client  (Ubuntu/Debian)\n' +
        '  choco install postgresql     (Windows)',
    },
    restore: {
      command: 'psql',
      versionFlag: '--version',
      name: 'psql',
      installHint:
        '  brew install postgresql     (macOS)\n' +
        '  sudo apt install postgresql-client  (Ubuntu/Debian)\n' +
        '  choco install postgresql     (Windows)',
    },
  },
  mysql: {
    dump: {
      command: 'mysqldump',
      versionFlag: '--version',
      name: 'mysqldump',
      installHint:
        '  brew install mysql-client    (macOS)\n' +
        '  sudo apt install mysql-client   (Ubuntu/Debian)\n' +
        '  choco install mysql-cli      (Windows)',
    },
    restore: {
      command: 'mysql',
      versionFlag: '--version',
      name: 'mysql',
      installHint:
        '  brew install mysql-client    (macOS)\n' +
        '  sudo apt install mysql-client   (Ubuntu/Debian)\n' +
        '  choco install mysql-cli      (Windows)',
    },
  },
  sqlite: {
    dump: {
      command: 'sqlite3',
      versionFlag: '--version',
      name: 'sqlite3',
      installHint:
        '  brew install sqlite          (macOS)\n' +
        '  sudo apt install sqlite3     (Ubuntu/Debian)\n' +
        '  choco install sqlite         (Windows)',
    },
    restore: {
      command: 'sqlite3',
      versionFlag: '--version',
      name: 'sqlite3',
      installHint:
        '  brew install sqlite          (macOS)\n' +
        '  sudo apt install sqlite3     (Ubuntu/Debian)\n' +
        '  choco install sqlite         (Windows)',
    },
  },
};

function checkTool(tool: ToolCheck): Promise<string | null> {
  return new Promise((resolve) => {
    exec(`${tool.command} ${tool.versionFlag}`, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim().split('\n')[0]);
      }
    });
  });
}

export async function preflightCheck(
  dbType: DbConfig['type'],
  mode: 'dump' | 'restore' | 'both' = 'both'
): Promise<boolean> {
  const tools = TOOL_MAP[dbType];
  const checks: ToolCheck[] = [];

  if (mode === 'dump' || mode === 'both') checks.push(tools.dump);
  if (mode === 'restore' || mode === 'both') {
    // Avoid duplicate check for sqlite (same tool)
    if (tools.restore.command !== tools.dump.command || mode === 'restore') {
      checks.push(tools.restore);
    }
  }

  let allGood = true;

  for (const tool of checks) {
    const version = await checkTool(tool);
    if (version) {
      console.log(chalk.green(`  ✓ ${tool.name} found`) + chalk.gray(` (${version})`));
    } else {
      console.log(chalk.red(`  ✗ ${tool.name} not found`));
      console.log(chalk.yellow(`\n  Install it:\n${tool.installHint}\n`));
      allGood = false;
    }
  }

  return allGood;
}
