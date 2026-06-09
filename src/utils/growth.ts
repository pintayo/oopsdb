import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { getConfigDir } from './config';
import { getCurrentTier } from './license';

/**
 * Growth hooks — honest, frequency-capped nudges.
 * Rules: never block, never break a command, never nag paid users,
 * never show more than once per 24h (except the first time).
 */

interface GrowthState {
  snapshotCount: number;
  lastNudgeAt: number; // epoch ms
  nudgeCount: number;
}

let shownThisRun = false; // watch mode: max once per process

function statePath(): string {
  return path.join(getConfigDir(), 'growth.json');
}

function loadState(): GrowthState {
  try {
    return { snapshotCount: 0, lastNudgeAt: 0, nudgeCount: 0, ...JSON.parse(fs.readFileSync(statePath(), 'utf8')) };
  } catch {
    return { snapshotCount: 0, lastNudgeAt: 0, nudgeCount: 0 };
  }
}

function saveState(s: GrowthState): void {
  try {
    fs.writeFileSync(statePath(), JSON.stringify(s), 'utf8');
  } catch {
    /* never break the command over a nudge */
  }
}

function vaultNudgeBody(): string {
  return [
    '',
    chalk.yellow('  ⚠  This backup only lives on this machine.'),
    chalk.gray('     Disk dies, laptop stolen, `rm -rf` goes one level too high — backups go with it.'),
    '',
    '     ' + chalk.bold('oopsdb secure') + chalk.gray(' → encrypted, immutable cloud vault. €8/mo.'),
    chalk.gray('     Even a rogue AI with your shell can\'t delete it: ') + chalk.cyan('https://oopsdb.com'),
    '',
  ].join('\n');
}

/**
 * Call after every successful snapshot. Decides for itself whether to speak.
 */
export function recordSnapshotAndMaybeNudge(source: 'snapshot' | 'watch'): void {
  try {
    if (getCurrentTier() !== 'free') return;
    const s = loadState();
    s.snapshotCount += 1;

    const dayMs = 24 * 60 * 60 * 1000;
    const due =
      s.snapshotCount === 1 ||
      (Date.now() - s.lastNudgeAt > dayMs && !shownThisRun);

    if (due && !(source === 'watch' && shownThisRun)) {
      console.log(vaultNudgeBody());
      s.lastNudgeAt = Date.now();
      s.nudgeCount += 1;
      shownThisRun = true;
    }
    saveState(s);
  } catch {
    /* growth must never break backups */
  }
}

/**
 * Call after a successful restore — the "it just saved me" moment.
 */
export function showRestoreSaveMoment(): void {
  try {
    const text = encodeURIComponent(
      'oopsdb just rolled my database back like nothing happened. ' +
        'Local encrypted snapshots for Postgres/Supabase/MySQL/SQLite — free CLI: https://oopsdb.com'
    );
    console.log(
      [
        chalk.gray('  If OopsDB just saved you, tell one other person who codes with AI —'),
        chalk.gray('  it\'s how this tool stays alive: ') + chalk.cyan(`https://x.com/intent/post?text=${text}`),
        '',
      ].join('\n')
    );
    if (getCurrentTier() === 'free') {
      console.log(
        [
          chalk.yellow('  One thing: this snapshot lived on this machine.'),
          chalk.gray('  If the disaster had been the disk itself, there\'d have been nothing to restore.'),
          '  ' + chalk.bold('oopsdb secure') + chalk.gray(' → off-site vault, €8/mo: ') + chalk.cyan('https://oopsdb.com'),
          '',
        ].join('\n')
      );
    }
  } catch {
    /* never break restore output */
  }
}
