import * as inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { saveConfig, loadConfig, DbConfig, OopsConfig } from '../utils/config';
import { createSnapshot } from '../utils/dumper';

export async function initCommand(): Promise<void> {
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
        { name: 'PostgreSQL (Supabase, Neon, local)', value: 'postgres' },
        { name: 'MySQL / MariaDB', value: 'mysql' },
        { name: 'SQLite (local file)', value: 'sqlite' },
      ],
    },
  ]);

  let dbConfig: DbConfig;

  if (dbType === 'sqlite') {
    const { database } = await inquirer.prompt([
      {
        type: 'input',
        name: 'database',
        message: 'Path to your SQLite database file:',
        validate: (input: string) => (input.length > 0 ? true : 'Please enter a path'),
      },
    ]);
    dbConfig = { type: 'sqlite', database };
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

  const config: OopsConfig = {
    db: dbConfig,
    createdAt: new Date().toISOString(),
  };

  saveConfig(config);
  console.log(chalk.green('\n  Config saved to .oopsdb/config.json (encrypted)\n'));

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
}
