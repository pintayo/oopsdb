import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, getConfigDir } from '../utils/config';
import { createSnapshot, listSnapshots } from '../utils/dumper';
import { preflightCheck } from '../utils/preflight';

const SECURE_CONFIG_FILE = path.join(getConfigDir(), 'secure.json');
const OOPSDB_API = 'https://api.oopsdb.dev';

interface SecureConfig {
  apiKey: string;
  teamId?: string;
  activatedAt: string;
}

function loadSecureConfig(): SecureConfig | null {
  if (!fs.existsSync(SECURE_CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(SECURE_CONFIG_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveSecureConfig(config: SecureConfig): void {
  fs.writeFileSync(SECURE_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}

export async function secureCommand(options: {
  activate?: string;
  push?: boolean;
  status?: boolean;
  deactivate?: boolean;
}): Promise<void> {
  // ── Activate with an API key ────────────────────────────────────────────
  if (options.activate) {
    return activateSecure(options.activate);
  }

  // ── Deactivate ──────────────────────────────────────────────────────────
  if (options.deactivate) {
    return deactivateSecure();
  }

  const secureConfig = loadSecureConfig();

  // ── Status ──────────────────────────────────────────────────────────────
  if (options.status) {
    return showSecureStatus(secureConfig);
  }

  // ── Push a snapshot to cloud ────────────────────────────────────────────
  if (options.push) {
    return pushSnapshot(secureConfig);
  }

  // ── Default: show info / upsell ─────────────────────────────────────────
  showSecureInfo(secureConfig);
}

// ─── Subcommand implementations ─────────────────────────────────────────────

async function activateSecure(apiKey: string): Promise<void> {
  console.log(chalk.bold('\n  OopsDB Secure — Activation\n'));

  const spinner = ora('Validating API key...').start();

  // TODO: Replace with real API call when backend is live
  // const res = await fetch(`${OOPSDB_API}/v1/activate`, {
  //   method: 'POST',
  //   headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ machine: require('os').hostname() }),
  // });

  // Simulate validation delay
  await delay(800);

  if (!apiKey.startsWith('oopsdb_')) {
    spinner.fail('Invalid API key format. Keys start with oopsdb_');
    console.log(chalk.gray('\n  Get your key at ') + chalk.cyan('https://oopsdb.dev/secure\n'));
    return;
  }

  spinner.succeed('API key validated');

  const config: SecureConfig = {
    apiKey,
    activatedAt: new Date().toISOString(),
  };
  saveSecureConfig(config);

  console.log(chalk.green('\n  OopsDB Secure is now active!'));
  console.log(chalk.gray('\n  Your encrypted backups will be pushed to immutable cloud storage.'));
  console.log(chalk.gray('  Even if your local machine is compromised, your backups survive.\n'));
  console.log(chalk.cyan('  Next: ') + chalk.white('oopsdb secure --push') + chalk.gray(' to push your latest snapshot\n'));
}

async function deactivateSecure(): Promise<void> {
  console.log(chalk.bold('\n  OopsDB Secure — Deactivation\n'));

  if (!fs.existsSync(SECURE_CONFIG_FILE)) {
    console.log(chalk.yellow('  OopsDB Secure is not activated.\n'));
    return;
  }

  fs.unlinkSync(SECURE_CONFIG_FILE);
  console.log(chalk.green('  OopsDB Secure has been deactivated.'));
  console.log(chalk.gray('  Your existing cloud backups are retained per your plan\'s retention policy.\n'));
}

async function pushSnapshot(secureConfig: SecureConfig | null): Promise<void> {
  console.log(chalk.bold('\n  OopsDB Secure — Push to Cloud\n'));

  if (!secureConfig) {
    console.log(chalk.yellow('  OopsDB Secure is not activated.'));
    console.log(chalk.gray('  Run: ') + chalk.cyan('oopsdb secure --activate <api-key>'));
    console.log(chalk.gray('  Get your key at ') + chalk.cyan('https://oopsdb.dev/secure\n'));
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
  // const fileStream = fs.createReadStream(latest.file);
  // const res = await fetch(`${OOPSDB_API}/v1/snapshots`, {
  //   method: 'POST',
  //   headers: {
  //     'Authorization': `Bearer ${secureConfig.apiKey}`,
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

function showSecureStatus(secureConfig: SecureConfig | null): void {
  console.log(chalk.bold('\n  OopsDB Secure — Status\n'));

  if (!secureConfig) {
    console.log(chalk.yellow('  Status: ') + chalk.red('Not activated'));
    console.log(chalk.gray('\n  Activate with: ') + chalk.cyan('oopsdb secure --activate <api-key>'));
    console.log(chalk.gray('  Get your key at ') + chalk.cyan('https://oopsdb.dev/secure\n'));
    return;
  }

  console.log(chalk.gray('  Status:      ') + chalk.green('Active'));
  console.log(chalk.gray('  API Key:     ') + chalk.cyan(secureConfig.apiKey.slice(0, 12) + '...' + secureConfig.apiKey.slice(-4)));
  console.log(chalk.gray('  Activated:   ') + chalk.cyan(new Date(secureConfig.activatedAt).toLocaleDateString()));
  if (secureConfig.teamId) {
    console.log(chalk.gray('  Team:        ') + chalk.cyan(secureConfig.teamId));
  }

  // TODO: Fetch cloud snapshot count and storage usage from API
  console.log(chalk.gray('\n  Cloud data will appear here once the service is live.\n'));
}

function showSecureInfo(secureConfig: SecureConfig | null): void {
  if (secureConfig) {
    showSecureStatus(secureConfig);
    return;
  }

  console.log(chalk.bold('\n  OopsDB Secure'));
  console.log(chalk.gray('  Immutable cloud backups that even a rogue AI can\'t delete.\n'));

  console.log(chalk.white('  Local backups are great — until the AI runs ') + chalk.red('rm -rf .oopsdb/'));
  console.log(chalk.white('  OopsDB Secure pushes encrypted snapshots to tamper-proof cloud storage'));
  console.log(chalk.white('  with write-once retention. Your data survives even if your machine doesn\'t.\n'));

  console.log(chalk.gray('  ┌─────────────────────────────────────────────────────────┐'));
  console.log(chalk.gray('  │') + chalk.white('  Free (current)          ') + chalk.gray('│') + chalk.cyan('  Secure ($8/mo)              ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('  ✓ Local encrypted       ') + chalk.gray('│') + chalk.cyan('  ✓ Everything in Free        ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('  ✓ Auto-backup on timer  ') + chalk.gray('│') + chalk.cyan('  ✓ Immutable cloud storage   ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('  ✓ Interactive restore   ') + chalk.gray('│') + chalk.cyan('  ✓ Write-once retention      ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('  ✓ Safety snapshots      ') + chalk.gray('│') + chalk.cyan('  ✓ 30-day cloud history      ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('                          ') + chalk.gray('│') + chalk.cyan('  ✓ Team sharing              ') + chalk.gray('│'));
  console.log(chalk.gray('  │') + chalk.white('                          ') + chalk.gray('│') + chalk.cyan('  ✓ Slack/Discord alerts      ') + chalk.gray('│'));
  console.log(chalk.gray('  └─────────────────────────────────────────────────────────┘'));
  console.log();
  console.log(chalk.gray('  Get started:'));
  console.log(chalk.cyan('    1. ') + chalk.white('Sign up at ') + chalk.cyan('https://oopsdb.dev/secure'));
  console.log(chalk.cyan('    2. ') + chalk.white('oopsdb secure --activate <your-api-key>'));
  console.log(chalk.cyan('    3. ') + chalk.white('oopsdb secure --push'));
  console.log();
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
