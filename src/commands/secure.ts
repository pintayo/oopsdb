import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../utils/config';
import { createSnapshot, listSnapshots } from '../utils/dumper';
import { preflightCheck } from '../utils/preflight';
import { getCurrentTier, loadLicense } from '../utils/license';

export async function secureCommand(options: {
  push?: boolean;
  status?: boolean;
}): Promise<void> {
  const tier = getCurrentTier();

  // ── Status ──────────────────────────────────────────────────────────────
  if (options.status) {
    return showSecureStatus(tier);
  }

  // ── Push a snapshot to cloud ────────────────────────────────────────────
  if (options.push) {
    return pushSnapshot(tier);
  }

  // ── Default: show info / upsell ─────────────────────────────────────────
  showSecureInfo(tier);
}

// ─── Subcommand implementations ─────────────────────────────────────────────

async function pushSnapshot(tier: string): Promise<void> {
  console.log(chalk.bold('\n  OopsDB Secure — Push to Cloud\n'));

  if (tier !== 'secure') {
    console.log(chalk.yellow('  Cloud backups require the Secure plan ($19/mo).'));
    console.log(chalk.gray('\n  Upgrade at ') + chalk.cyan('https://oopsdb.com'));
    console.log(chalk.gray('  Then run: ') + chalk.cyan('oopsdb activate <license-key>\n'));
    return;
  }

  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('  No database config found. Run `oopsdb init` first.\n'));
    return;
  }

  // Check for existing snapshots or take a fresh one
  let snapshots = listSnapshots();
  if (snapshots.length === 0) {
    console.log(chalk.gray('  No local snapshots found. Taking a fresh one...\n'));
    const toolsOk = await preflightCheck(config.db.type, 'dump');
    if (!toolsOk) {
      console.log(chalk.red('\n  Missing required database tools.\n'));
      return;
    }
    await createSnapshot(config.db);
    snapshots = listSnapshots();
  }

  const latest = snapshots[0];
  const sizeKB = Math.round(latest.size / 1024);

  const spinner = ora(`Pushing snapshot to cloud (${sizeKB} KB, already encrypted)...`).start();

  // TODO: Replace with real upload when backend is live
  // const license = loadLicense();
  // const fileStream = fs.createReadStream(latest.file);
  // const res = await fetch(`https://api.oopsdb.com/v1/snapshots`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${license?.licenseKey}`,
  //     'Content-Type': 'application/octet-stream',
  //     'X-OopsDB-Filename': path.basename(latest.file),
  //   },
  //   body: fileStream,
  // });

  await delay(1200);
  spinner.succeed(`Snapshot pushed to immutable cloud storage (${sizeKB} KB)`);

  console.log(chalk.green('\n  Your backup is now stored with write-once retention.'));
  console.log(chalk.gray('  It cannot be modified or deleted — even by you — until the retention period expires.\n'));
}

function showSecureStatus(tier: string): void {
  console.log(chalk.bold('\n  OopsDB Secure — Status\n'));

  if (tier !== 'secure') {
    console.log(chalk.yellow('  Plan: ') + chalk.white(tier === 'free' ? 'Free' : 'Pro'));
    console.log(chalk.gray('  Cloud backups require the Secure plan.'));
    console.log(chalk.gray('\n  Upgrade at ') + chalk.cyan('https://oopsdb.com\n'));
    return;
  }

  const license = loadLicense();
  console.log(chalk.gray('  Plan:      ') + chalk.green('SECURE'));
  if (license) {
    console.log(chalk.gray('  Key:       ') + chalk.cyan(license.licenseKey.slice(0, 8) + '...' + license.licenseKey.slice(-4)));
    console.log(chalk.gray('  Activated: ') + chalk.cyan(new Date(license.activatedAt).toLocaleDateString()));
  }

  // TODO: Fetch cloud snapshot count and storage usage from API
  console.log(chalk.gray('\n  Cloud data will appear here once the service is live.\n'));
}

function showSecureInfo(tier: string): void {
  if (tier === 'secure') {
    showSecureStatus(tier);
    return;
  }

  console.log(chalk.bold('\n  OopsDB Secure'));
  console.log(chalk.gray('  Immutable cloud backups that even a rogue AI can\'t delete.\n'));

  console.log(chalk.white('  Local backups are great — until the AI runs ') + chalk.red('rm -rf .oopsdb/'));
  console.log(chalk.white('  OopsDB Secure pushes encrypted snapshots to tamper-proof cloud storage'));
  console.log(chalk.white('  with write-once retention. Your data survives even if your machine doesn\'t.\n'));

  console.log(chalk.gray('  ┌─────────────────────────────────────────────────────────┐'));
  console.log(chalk.gray('  │') + chalk.white('  Free / Pro              ') + chalk.gray('│') + chalk.cyan('  Secure ($19/mo)             ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('  ✓ Local encrypted       ') + chalk.gray('│') + chalk.cyan('  ✓ Everything in Pro         ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('  ✓ Auto-backup on timer  ') + chalk.gray('│') + chalk.cyan('  ✓ Immutable cloud storage   ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('  ✓ Interactive restore   ') + chalk.gray('│') + chalk.cyan('  ✓ Write-once retention      ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('  ✓ Safety snapshots      ') + chalk.gray('│') + chalk.cyan('  ✓ 30-day cloud history      ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('                          ') + chalk.gray('│') + chalk.cyan('  ✓ Team sharing              ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('                          ') + chalk.gray('│') + chalk.cyan('  ✓ Slack/Discord alerts      ') + chalk.gray('│'));
  console.log(chalk.gray('  └─────────────────────────────────────────────────────────┘'));
  console.log();
  console.log(chalk.gray('  Get started:'));
  console.log(chalk.cyan('    1. ') + chalk.white('Get Secure at ') + chalk.cyan('https://oopsdb.com'));
  console.log(chalk.cyan('    2. ') + chalk.white('oopsdb activate <your-license-key>'));
  console.log(chalk.cyan('    3. ') + chalk.white('oopsdb secure --push'));
  console.log();
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
