import * as inquirer from 'inquirer';
import chalk from 'chalk';
import * as fs from 'fs';
import { getConfigDir } from '../utils/config';
import { listSnapshots } from '../utils/dumper';

export async function cleanCommand(options: { yes?: boolean }): Promise<void> {
  const configDir = getConfigDir();

  if (!fs.existsSync(configDir)) {
    console.log(chalk.yellow('\n  Nothing to clean — no .oopsdb/ directory found.\n'));
    return;
  }

  const snapshots = listSnapshots();
  const dirSize = getDirSize(configDir);

  console.log(chalk.bold('\n  OopsDB Clean\n'));
  console.log(chalk.gray(`  Directory:  ${configDir}`));
  console.log(chalk.gray(`  Snapshots:  ${snapshots.length}`));
  console.log(chalk.gray(`  Total size: ${formatSize(dirSize)}\n`));

  if (!options.yes) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.yellow('This will permanently delete all backups and config. Continue?'),
        default: false,
      },
    ]);

    if (!confirm) {
      console.log(chalk.gray('\n  Clean cancelled.\n'));
      return;
    }
  }

  fs.rmSync(configDir, { recursive: true, force: true });
  console.log(chalk.green(`\n  Removed ${configDir} (${snapshots.length} snapshot(s), ${formatSize(dirSize)})\n`));
}

function getDirSize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      total += getDirSize(full);
    } else {
      total += fs.statSync(full).size;
    }
  }
  return total;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
