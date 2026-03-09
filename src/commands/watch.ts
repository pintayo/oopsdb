import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../utils/config';
import { createSnapshot, listSnapshots } from '../utils/dumper';
import { preflightCheck } from '../utils/preflight';

export async function watchCommand(options: { interval: string }): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('\n  No config found. Run `oopsdb init` first.\n'));
    process.exit(1);
  }

  // Pre-flight: check that dump tool is available
  console.log(chalk.gray('\n  Checking for required tools...\n'));
  const toolsOk = await preflightCheck(config.db.type, 'dump');
  if (!toolsOk) {
    console.log(chalk.red('\n  Missing required database tools. Install them and try again.\n'));
    process.exit(1);
  }

  const intervalMinutes = parseInt(options.interval, 10);
  if (isNaN(intervalMinutes) || intervalMinutes < 1) {
    console.log(chalk.red('\n  Interval must be at least 1 minute.\n'));
    process.exit(1);
  }

  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(chalk.bold('\n  OopsDB Watch Mode\n'));
  console.log(chalk.gray(`  Database: ${config.db.type} - ${config.db.database}`));
  console.log(chalk.gray(`  Interval: every ${intervalMinutes} minute(s)`));
  console.log(chalk.gray('  Press Ctrl+C to stop.\n'));

  // Take an immediate snapshot on start
  await takeSnapshotWithLog(config.db);

  // Set up the interval
  const timer = setInterval(async () => {
    await takeSnapshotWithLog(config.db);
  }, intervalMs);

  // Clean exit on Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(timer);
    const snapshots = listSnapshots();
    console.log(chalk.bold(`\n\n  Watch stopped. ${snapshots.length} total snapshot(s) saved.\n`));
    process.exit(0);
  });
}

async function takeSnapshotWithLog(dbConfig: any): Promise<void> {
  const spinner = ora(`[${new Date().toLocaleTimeString()}] Taking snapshot...`).start();
  try {
    const file = await createSnapshot(dbConfig);
    const sizeKB = Math.round(require('fs').statSync(file).size / 1024);
    spinner.succeed(`[${new Date().toLocaleTimeString()}] Snapshot saved (${sizeKB} KB)`);
  } catch (err: any) {
    spinner.fail(`[${new Date().toLocaleTimeString()}] Snapshot failed: ${err.message}`);
  }
}
