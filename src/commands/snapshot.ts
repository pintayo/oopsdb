import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../utils/config';
import { createSnapshot } from '../utils/dumper';
import * as fs from 'fs';

export async function snapshotCommand(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('\n  No config found. Run `oopsdb init` first.\n'));
    process.exit(1);
  }

  console.log(chalk.bold('\n  OopsDB Manual Snapshot\n'));
  console.log(chalk.gray(`  Database: ${config.db.type} - ${config.db.database}\n`));

  const spinner = ora('Taking snapshot...').start();
  try {
    const file = await createSnapshot(config.db);
    const sizeKB = Math.round(fs.statSync(file).size / 1024);
    spinner.succeed(`Snapshot saved: ${file} (${sizeKB} KB)`);
    console.log(chalk.green('\n  Done! Run `oopsdb restore` if you need to roll back.\n'));
  } catch (err: any) {
    spinner.fail(`Snapshot failed: ${err.message}`);
    console.log(chalk.yellow('\n  Tip: Make sure your database tools are installed and the database is running.\n'));
    process.exit(1);
  }
}
