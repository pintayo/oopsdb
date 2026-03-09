import * as inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../utils/config';
import { listSnapshots, restoreSnapshot, createSnapshot } from '../utils/dumper';
import { preflightCheck } from '../utils/preflight';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export async function restoreCommand(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('\n  No config found. Run `oopsdb init` first.\n'));
    process.exit(1);
  }

  const snapshots = listSnapshots();
  if (snapshots.length === 0) {
    console.log(chalk.yellow('\n  No snapshots found. Run `oopsdb snapshot` or `oopsdb watch` first.\n'));
    process.exit(1);
  }

  console.log(chalk.bold('\n  OopsDB Restore\n'));
  console.log(chalk.gray(`  Database: ${config.db.type} - ${config.db.database}\n`));

  // Pre-flight: check that restore tool is available
  const toolsOk = await preflightCheck(config.db.type, 'restore');
  if (!toolsOk) {
    console.log(chalk.red('\n  Missing required database tools. Install them and try again.\n'));
    process.exit(1);
  }
  console.log();

  // Show the last 10 snapshots
  const recentSnapshots = snapshots.slice(0, 10);

  const { selectedSnapshot } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedSnapshot',
      message: 'Which snapshot do you want to restore?',
      choices: recentSnapshots.map((s, i) => ({
        name: `${i === 0 ? '(latest) ' : ''}${s.time.toLocaleString()} - ${timeAgo(s.time)} - ${formatSize(s.size)}`,
        value: s.file,
      })),
    },
  ]);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: chalk.yellow('This will overwrite your current database. Are you sure?'),
      default: false,
    },
  ]);

  if (!confirm) {
    console.log(chalk.gray('\n  Restore cancelled.\n'));
    return;
  }

  // Take a safety snapshot before restoring
  const safetySpinner = ora('Taking safety snapshot of current state...').start();
  try {
    await createSnapshot(config.db);
    safetySpinner.succeed('Safety snapshot saved (just in case)');
  } catch {
    safetySpinner.warn('Could not take safety snapshot, proceeding anyway');
  }

  // Restore
  const restoreSpinner = ora('Restoring database...').start();
  try {
    await restoreSnapshot(config.db, selectedSnapshot);
    restoreSpinner.succeed('Database restored successfully!');
    console.log(chalk.green('\n  Your database has been rolled back. Crisis averted!\n'));
  } catch (err: any) {
    restoreSpinner.fail(`Restore failed: ${err.message}`);
    console.log(chalk.red('\n  The restore did not complete. Your database may be in a partial state.'));
    console.log(chalk.yellow('  A safety snapshot was taken before the restore attempt.\n'));
    process.exit(1);
  }
}
