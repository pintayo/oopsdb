import * as inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig, loadConfig, DbConfig, OopsConfig, generateMasterKey } from '../utils/config';
import { createSnapshot, restoreSnapshot } from '../utils/dumper';
import { preflightCheck } from '../utils/preflight';
import { getCurrentTier } from '../utils/license';

export async function initCommand(options: { recovery?: string } = {}): Promise<void> {
  console.log(chalk.bold('\n  OopsDB Setup\n'));
  console.log(chalk.gray('  Protect your database from AI-powered disasters.\n'));

  const existing = loadConfig();
  if (existing) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'OopsDB is already configured in this directory. Overwrite?',
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.yellow('\n  Setup cancelled.\n'));
      return;
    }
  }

  const { dbType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'dbType',
      message: 'What database are you using?',
      choices: [
        { name: 'Supabase', value: 'supabase' },
        { name: 'PostgreSQL (Neon, local, other hosted)', value: 'postgres' },
        { name: 'MySQL / MariaDB', value: 'mysql' },
        { name: 'SQLite (local file)', value: 'sqlite' },
      ],
    },
  ]);

  // Supabase and plain Postgres both use pg_dump/psql
  const toolType = dbType === 'supabase' ? 'postgres' : dbType;

  // Pre-flight: check that the required DB tools are installed
  console.log(chalk.gray('\n  Checking for required tools...\n'));
  const toolsOk = await preflightCheck(toolType, 'both');
  if (!toolsOk) {
    console.log(chalk.red('\n  Missing required database tools. Install them and re-run `oopsdb init`.\n'));
    process.exit(1);
  }
  console.log();

  let dbConfig: DbConfig;

  if (dbType === 'supabase') {
    dbConfig = await setupSupabase();
  } else if (dbType === 'sqlite') {
    const { database } = await inquirer.prompt([
      {
        type: 'input',
        name: 'database',
        message: 'Path to your SQLite database file:',
        validate: (input: string) => {
          if (input.length === 0) return 'Please enter a path';
          const resolved = path.resolve(input);
          if (!fs.existsSync(resolved)) return `File not found: ${resolved}`;
          return true;
        },
      },
    ]);
    dbConfig = { type: 'sqlite', database: path.resolve(database) };
  } else {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'host',
        message: 'Database host:',
        default: 'localhost',
      },
      {
        type: 'input',
        name: 'port',
        message: 'Database port:',
        default: dbType === 'postgres' ? '5432' : '3306',
        validate: (input: string) => {
          const port = parseInt(input, 10);
          if (isNaN(port) || port < 1 || port > 65535) return 'Port must be a number between 1 and 65535';
          return true;
        },
      },
      {
        type: 'input',
        name: 'user',
        message: 'Database user:',
        default: dbType === 'postgres' ? 'postgres' : 'root',
      },
      {
        type: 'password',
        name: 'password',
        message: 'Database password:',
      },
      {
        type: 'input',
        name: 'database',
        message: 'Database name:',
        validate: (input: string) => (input.length > 0 ? true : 'Please enter a database name'),
      },
    ]);

    dbConfig = {
      type: dbType,
      host: answers.host,
      port: parseInt(answers.port, 10),
      user: answers.user,
      password: answers.password,
      database: answers.database,
    };
  }

  // Handle Master Key & Recovery
  const isRecovery = !!options.recovery;
  const masterKey = options.recovery || generateMasterKey();

  const config: OopsConfig = {
    db: dbConfig,
    createdAt: new Date().toISOString(),
    masterKey,
  };

  saveConfig(config);
  console.log(chalk.green('\n  Config saved to .oopsdb/config.json (encrypted local block)\n'));

  // If this is a new setup, force them to look at the master key
  if (!isRecovery) {
    console.log(chalk.bgRed.white.bold('\n  CRITICAL SECURITY STEP: SAVE YOUR MASTER KEY  '));
    console.log(chalk.red('  If an AI deletes your project folder or you switch devices,'));
    console.log(chalk.red('  this is the ONLY WAY to decrypt your cloud backups.'));
    console.log(chalk.red('  Save it in 1Password or another password manager right now:\n'));
    console.log(chalk.yellow.bold(`  ${masterKey}\n`));
    
    await inquirer.prompt([
      {
        type: 'confirm',
        name: 'keySaved',
        message: 'I have securely saved my Master Key.',
        default: false,
        validate: (input: boolean) => input ? true : 'You must save the Master Key to continue.',
      },
    ]);
  } else {
    console.log(chalk.blue.bold('\n  Recovery Mode Active: Master Key loaded from flag.\n'));
  }

  const { takeSnapshot } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'takeSnapshot',
      message: 'Take an initial snapshot now?',
      default: true,
    },
  ]);

  if (takeSnapshot) {
    const spinner = ora('Taking initial snapshot...').start();
    try {
      const file = await createSnapshot(dbConfig);
      spinner.succeed(`Snapshot saved: ${file}`);
    } catch (err: any) {
      spinner.fail(`Snapshot failed: ${err.message}`);
      console.log(chalk.yellow('\n  Tip: Make sure your database tools (pg_dump, mysqldump, sqlite3) are installed.\n'));
    }
  }

  console.log(chalk.bold('\n  You\'re all set! Next steps:\n'));
  console.log(chalk.cyan('    oopsdb watch       ') + chalk.gray('Start auto-backing up'));
  console.log(chalk.cyan('    oopsdb snapshot    ') + chalk.gray('Take a manual snapshot'));
  console.log(chalk.cyan('    oopsdb restore     ') + chalk.gray('Roll back to a backup'));
  console.log(chalk.cyan('    oopsdb status      ') + chalk.gray('See your backups'));
  console.log();
  console.log(chalk.gray('  ─────────────────────────────────────────────────'));
  console.log(chalk.magenta('  New: ') + chalk.white('oopsdb secure'));
  console.log(chalk.gray('  Immutable cloud backups that even a rogue AI can\'t delete.'));
  console.log(chalk.gray('  Learn more: ') + chalk.cyan('oopsdb secure') + chalk.gray(' or ') + chalk.cyan('https://oopsdb.com/secure'));
  console.log();
}

/**
 * Parse a Supabase/Postgres connection string into DbConfig components.
 * Supports: postgresql://user:password@host:port/database?sslmode=require
 */
function parseConnectionString(connStr: string): DbConfig {
  const url = new URL(connStr);
  return {
    type: 'postgres',
    supabase: true,
    host: url.hostname,
    port: parseInt(url.port, 10) || 5432,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1) || 'postgres',
    connectionString: connStr,
    sslmode: url.searchParams.get('sslmode') || 'require',
  };
}

async function setupSupabase(): Promise<DbConfig> {
  console.log(chalk.cyan('  Supabase Setup'));
  console.log(chalk.gray('  Find your connection string in Supabase Dashboard → Settings → Database\n'));

  const { method } = await inquirer.prompt([
    {
      type: 'list',
      name: 'method',
      message: 'How do you want to connect?',
      choices: [
        { name: 'Paste connection string (recommended)', value: 'connstring' },
        { name: 'Enter details manually', value: 'manual' },
      ],
    },
  ]);

  if (method === 'connstring') {
    const { connString } = await inquirer.prompt([
      {
        type: 'password',
        name: 'connString',
        message: 'Paste your Supabase connection string:',
        validate: (input: string) => {
          if (!input.startsWith('postgresql://') && !input.startsWith('postgres://')) {
            return 'Connection string must start with postgresql:// or postgres://';
          }
          try {
            new URL(input);
            return true;
          } catch {
            return 'Invalid connection string format';
          }
        },
      },
    ]);

    const config = parseConnectionString(connString);

    console.log(chalk.gray(`\n  Parsed: ${config.host}:${config.port}/${config.database} (user: ${config.user})`));
    console.log(chalk.gray(`  SSL: ${config.sslmode}`));
    console.log(chalk.green('  Supabase-specific flags: --no-owner --no-privileges --no-subscriptions\n'));

    return config;
  }

  // Manual entry
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'host',
      message: 'Supabase database host:',
      default: 'db.YOUR_PROJECT_REF.supabase.co',
      validate: (input: string) => input.length > 0 ? true : 'Please enter a host',
    },
    {
      type: 'input',
      name: 'port',
      message: 'Port:',
      default: '5432',
      validate: (input: string) => {
        const port = parseInt(input, 10);
        if (isNaN(port) || port < 1 || port > 65535) return 'Port must be 1-65535';
        return true;
      },
    },
    {
      type: 'input',
      name: 'user',
      message: 'Database user:',
      default: 'postgres',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Database password:',
    },
    {
      type: 'input',
      name: 'database',
      message: 'Database name:',
      default: 'postgres',
    },
  ]);

  console.log(chalk.green('\n  Supabase-specific flags will be applied automatically.\n'));

  return {
    type: 'postgres',
    supabase: true,
    host: answers.host,
    port: parseInt(answers.port, 10),
    user: answers.user,
    password: answers.password,
    database: answers.database,
    sslmode: 'require',
  };
}
