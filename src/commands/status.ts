import chalk from 'chalk';
import { loadConfig, getBackupsDir } from '../utils/config';
import { listSnapshots } from '../utils/dumper';
import * as path from 'path';

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

export async function statusCommand(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('\n  No config found. Run `oopsdb init` first.\n'));
    process.exit(1);
  }

  const snapshots = listSnapshots();

  console.log(chalk.bold('\n  OopsDB Status\n'));
  console.log(chalk.gray('  Database'));
  console.log(`    Type:     ${chalk.cyan(config.db.type)}`);
  console.log(`    Name:     ${chalk.cyan(config.db.database)}`);
  if (config.db.host) {
    console.log(`    Host:     ${chalk.cyan(config.db.host + ':' + config.db.port)}`);
  }
  console.log(`    Since:    ${chalk.cyan(new Date(config.createdAt).toLocaleDateString())}`);
  console.log();

  console.log(chalk.gray('  Backups'));
  console.log(`    Location: ${chalk.cyan(getBackupsDir())}`);
  console.log(`    Total:    ${chalk.cyan(String(snapshots.length))} snapshot(s)`);

  if (snapshots.length > 0) {
    const totalSize = snapshots.reduce((sum, s) => sum + s.size, 0);
    console.log(`    Size:     ${chalk.cyan(formatSize(totalSize))}`);
    console.log(`    Latest:   ${chalk.cyan(timeAgo(snapshots[0].time))} (${snapshots[0].time.toLocaleString()})`);
    console.log(`    Oldest:   ${chalk.cyan(timeAgo(snapshots[snapshots.length - 1].time))} (${snapshots[snapshots.length - 1].time.toLocaleString()})`);

    console.log(chalk.gray('\n  Recent Snapshots'));
    snapshots.slice(0, 5).forEach((s, i) => {
      const name = path.basename(s.file);
      const marker = i === 0 ? chalk.green(' (latest)') : '';
      console.log(`    ${chalk.gray(`${i + 1}.`)} ${name} - ${formatSize(s.size)} - ${timeAgo(s.time)}${marker}`);
    });

    if (snapshots.length > 5) {
      console.log(chalk.gray(`    ... and ${snapshots.length - 5} more`));
    }
  } else {
    console.log(chalk.yellow('\n    No snapshots yet. Run `oopsdb watch` or `oopsdb snapshot` to start.'));
  }

  console.log();
}
