import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../utils/config';
import { createSnapshot } from '../utils/dumper';
import { runPsqlCommand } from '../utils/psql';

export async function unlockCommand(): Promise<void> {
    const config = loadConfig();
    if (!config) {
        console.log(chalk.red('\n  No config found. Run `oopsdb init` first.\n'));
        process.exit(1);
        return;
    }

    if (config.db.type !== 'postgres') {
        console.log(chalk.yellow('\n  OopsDB Antigravity (Lock/Unlock) is currently only supported for PostgreSQL (including Supabase).\n'));
        return;
    }

    console.log(chalk.bold('\n  OopsDB Antigravity ' + chalk.yellow('UNLOCK')));

    // 1. Take a snapshot
    const snapSpinner = ora('Securing a fresh snapshot before unlocking...').start();
    try {
        await createSnapshot(config.db);
        snapSpinner.succeed('Fresh safety snapshot secured.');
    } catch (err: any) {
        snapSpinner.fail(`Failed to take safety snapshot: ${err.message}`);
        console.log(chalk.red('\n  Aborting unlock. We must secure your data first.\n'));
        return;
    }

    // 2. Drop the trigger
    const sql = `DROP EVENT TRIGGER IF EXISTS oopsdb_protect_schema;`;
    const unlockSpinner = ora('Dropping Antigravity locks...').start();

    try {
        await runPsqlCommand(config.db, sql);
        unlockSpinner.succeed('Lock removed.');
        console.log(chalk.bgYellow.black.bold('\n  WARNING  ') + chalk.yellow(' Schema modifications are now ALLOWED.'));
        console.log(chalk.gray('  You have 60 seconds to run your migrations.'));

        // 3. Setup re-lock timeout
        let timer = 60;
        const interval = setInterval(() => {
            process.stdout.write(`\r  ${chalk.cyan(timer)} seconds remaining...`);
            timer--;
            if (timer < 0) {
                clearInterval(interval);
                process.stdout.write('\n');
                reLock(config.db);
            }
        }, 1000);

    } catch (err: any) {
        unlockSpinner.fail(`Failed to remove lock: ${err.message}`);
    }
}

async function reLock(dbConfig: any) {
    const relockSpinner = ora('Time is up. Re-engaging Antigravity Lock...').start();
    const sql = `
CREATE EVENT TRIGGER oopsdb_protect_schema
  ON ddl_command_start
  EXECUTE FUNCTION oopsdb_block_ddl();
`;
    try {
        await runPsqlCommand(dbConfig, sql);
        relockSpinner.succeed('Antigravity Lock re-engaged.');
        console.log(chalk.green('\n  Your database schema is bulletproof again.\n'));
        process.exit(0);
    } catch (err: any) {
        relockSpinner.fail(`Failed to re-engage lock: ${err.message}`);
        console.log(chalk.red('\n  CRITICAL WARNING: Database remains unprotected! Run `oopsdb lock` manually.\n'));
        process.exit(1);
    }
}
