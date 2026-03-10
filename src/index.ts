#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { watchCommand } from './commands/watch';
import { restoreCommand } from './commands/restore';
import { statusCommand } from './commands/status';
import { snapshotCommand } from './commands/snapshot';
import { secureCommand } from './commands/secure';
import { cleanCommand } from './commands/clean';
import { activateCommand, deactivateCommand, licenseStatusCommand } from './commands/activate';
import { shieldCommand } from './commands/shield';
import { lockCommand } from './commands/lock';
import { unlockCommand } from './commands/unlock';

// Read version from package.json at runtime
const pkg = require('../package.json');

const program = new Command();

program
  .name('oopsdb')
  .description('Don\'t let AI nuke your database. Auto-backup and 1-click restore.')
  .version(pkg.version);

program
  .command('init')
  .description('Set up database connection for backups')
  .option('--recovery <key>', 'Recover configuration using a saved Master Key')
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

program
  .command('shield')
  .description('Start a database proxy interceptor that prevents destructive queries')
  .option('-p, --port <port>', 'Proxy port', '5433')
  .action(shieldCommand);

program
  .command('lock')
  .description('Bulletproof your Postgres database against schema deletion')
  .action(lockCommand);

program
  .command('unlock')
  .description('Temporarily allow schema migrations (auto-relocks after 60s)')
  .action(unlockCommand);

program
  .command('secure')
  .description('Immutable cloud backups — tamper-proof, AI-proof')
  .option('--push', 'Push latest snapshot to immutable cloud storage')
  .option('--status', 'Show Secure activation status')
  .action(secureCommand);

program
  .command('activate <license-key>')
  .description('Activate a Secure license key')
  .action(activateCommand);

program
  .command('deactivate')
  .description('Deactivate your license on this machine')
  .action(deactivateCommand);

program
  .command('license')
  .description('Show current license status and plan')
  .action(licenseStatusCommand);

program
  .command('clean')
  .description('Remove all OopsDB data (.oopsdb/) from current project')
  .option('--yes', 'Skip confirmation prompt')
  .action(cleanCommand);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
  console.log('\n  \x1b[35mNew:\x1b[0m \x1b[1moopsdb secure\x1b[0m — Immutable cloud backups that even a rogue AI can\'t delete.');
  console.log('  \x1b[90mLearn more:\x1b[0m \x1b[36mhttps://oopsdb.com/secure\x1b[0m\n');
}
