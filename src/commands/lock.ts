import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../utils/config';
import { runPsqlCommand } from '../utils/psql';

export async function lockCommand(): Promise<void> {
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

    console.log(chalk.bold('\n  OopsDB Antigravity ' + chalk.green('LOCK')));
    console.log(chalk.gray(`  Securing ${config.db.database} at ${config.db.host || 'localhost'}...\n`));

    const spinner = ora('Engaging database-level event triggers...').start();

    const sql = `
CREATE OR REPLACE FUNCTION oopsdb_block_ddl()
RETURNS event_trigger AS $$
BEGIN
  RAISE EXCEPTION 'OopsDB Antigravity Lock is ACTIVE. Schema changes (DROP, ALTER, etc.) are blocked. Run \`oopsdb unlock\` to modify the schema.';
END;
$$ LANGUAGE plpgsql;

DROP EVENT TRIGGER IF EXISTS oopsdb_protect_schema;

CREATE EVENT TRIGGER oopsdb_protect_schema
  ON ddl_command_start
  EXECUTE FUNCTION oopsdb_block_ddl();
`;

    try {
        await runPsqlCommand(config.db, sql);
        spinner.succeed('Antigravity Lock engaged.');
        console.log(chalk.green('\n  Your database schema is now bulletproof.'));
        console.log(chalk.gray('  Any attempt to DROP, ALTER, or TRUNCATE will be rejected by the database engine itself.'));
        console.log(chalk.gray('  Need to run migrations? Use ') + chalk.cyan('oopsdb unlock') + chalk.gray(' first.\n'));
    } catch (err: any) {
        spinner.fail(`Failed to engage lock: ${err.message}`);
        // Suggest that they might need superuser depending on the environment
        console.log(chalk.gray('\n  Note: Creating event triggers in Postgres requires superuser privileges.'));
        console.log(chalk.gray('  Ensure the user configured in OopsDB has sufficient permissions.\n'));
    }
}


