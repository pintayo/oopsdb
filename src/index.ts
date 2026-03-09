#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { watchCommand } from './commands/watch';
import { restoreCommand } from './commands/restore';
import { statusCommand } from './commands/status';
import { snapshotCommand } from './commands/snapshot';

const program = new Command();

program
  .name('oopsdb')
  .description('Don\'t let AI nuke your database. Auto-backup and 1-click restore.')
  .version('1.0.0');

program
  .command('init')
  .description('Set up database connection for backups')
  .action(initCommand);

program
  .command('watch')
  .description('Start watching and backing up your database at intervals')
  .option('-i, --interval <minutes>', 'Backup interval in minutes', '5')
  .action(watchCommand);

program
  .command('snapshot')
  .description('Take a one-time snapshot right now')
  .action(snapshotCommand);

program
  .command('restore')
  .description('Restore your database from a backup')
  .action(restoreCommand);

program
  .command('status')
  .description('Show backup status and recent snapshots')
  .action(statusCommand);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
  console.log('\n  \x1b[35mComing Soon:\x1b[0m \x1b[1moopsdb secure\x1b[0m — Immutable cloud backups that even a rogue AI can\'t delete.');
  console.log('  \x1b[90mSign up at\x1b[0m \x1b[36mhttps://oopsdb.dev/secure\x1b[0m\n');
}
