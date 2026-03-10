import chalk from 'chalk';
import ora from 'ora';
import { activateLicense, deactivateLicense, loadLicense } from '../utils/license';

export async function activateCommand(licenseKey: string): Promise<void> {
  console.log(chalk.bold('\n  OopsDB — License Activation\n'));

  if (!licenseKey || licenseKey.trim().length === 0) {
    console.log(chalk.red('  Please provide your license key.'));
    console.log(chalk.gray('\n  Usage: ') + chalk.cyan('oopsdb activate <license-key>'));
    console.log(chalk.gray('  Get your key at ') + chalk.cyan('https://oopsdb.com\n'));
    return;
  }

  const spinner = ora('Activating license...').start();

  try {
    const license = await activateLicense(licenseKey.trim());
    spinner.succeed('License activated!');

    console.log(chalk.green('\n  You\'re on the ' + chalk.bold(license.tier.toUpperCase()) + ' plan.'));
    if (license.customerEmail) {
      console.log(chalk.gray('  Email: ') + chalk.cyan(license.customerEmail));
    }
    console.log(chalk.gray('  Variant: ') + chalk.cyan(license.variantName || license.tier));

    if (license.tier === 'secure') {
      console.log(chalk.gray('\n  You now have access to:'));
      console.log(chalk.cyan('    ✓ ') + chalk.white('Immutable cloud backups'));
      console.log(chalk.cyan('    ✓ ') + chalk.white('E2E encrypted cloud storage'));
      console.log(chalk.cyan('    ✓ ') + chalk.white('30-day retention'));
      console.log(chalk.cyan('    ✓ ') + chalk.white('Restorable from any machine'));
    }

    console.log(chalk.gray('\n  Next: ') + chalk.cyan('oopsdb init') + chalk.gray(' to set up your database\n'));
  } catch (err: any) {
    spinner.fail('Activation failed');
    console.log(chalk.red(`\n  ${err.message}`));
    console.log(chalk.gray('\n  Make sure your license key is correct.'));
    console.log(chalk.gray('  Get help at ') + chalk.cyan('https://oopsdb.com\n'));
  }
}

export async function deactivateCommand(): Promise<void> {
  console.log(chalk.bold('\n  OopsDB — License Deactivation\n'));

  const license = loadLicense();
  if (!license) {
    console.log(chalk.yellow('  No active license found.\n'));
    return;
  }

  const spinner = ora('Deactivating license...').start();

  try {
    await deactivateLicense();
    spinner.succeed('License deactivated');
    console.log(chalk.gray('\n  Secure license deactivated. Local backups still work — they\'re free forever.'));
    console.log(chalk.gray('  You can re-activate anytime with: ') + chalk.cyan('oopsdb activate <key>\n'));
  } catch (err: any) {
    spinner.fail('Deactivation failed');
    console.log(chalk.red(`\n  ${err.message}\n`));
  }
}

export async function licenseStatusCommand(): Promise<void> {
  const license = loadLicense();

  console.log(chalk.bold('\n  OopsDB — License Status\n'));

  if (!license) {
    console.log(chalk.gray('  Plan:   ') + chalk.white('Free (all local features)'));
    console.log(chalk.gray('\n  Want cloud backups? ') + chalk.cyan('https://oopsdb.com') + chalk.gray(' → then run ') + chalk.cyan('oopsdb activate <key>\n'));
    return;
  }

  console.log(chalk.gray('  Plan:      ') + chalk.green(license.tier.toUpperCase()));
  console.log(chalk.gray('  Key:       ') + chalk.cyan(license.licenseKey.slice(0, 8) + '...' + license.licenseKey.slice(-4)));
  console.log(chalk.gray('  Activated: ') + chalk.cyan(new Date(license.activatedAt).toLocaleDateString()));
  if (license.customerEmail) {
    console.log(chalk.gray('  Email:     ') + chalk.cyan(license.customerEmail));
  }
  if (license.variantName) {
    console.log(chalk.gray('  Variant:   ') + chalk.cyan(license.variantName));
  }
  console.log();
}
