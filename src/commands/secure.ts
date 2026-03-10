import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../utils/config';
import { loadLicense } from '../utils/license';
import { listSnapshots } from '../utils/dumper';

export async function secureCommand(options: {
  push?: boolean;
  status?: boolean;
}): Promise<void> {
  console.log(chalk.bold('\n  OopsDB Secure'));
  console.log(chalk.gray('  Immutable cloud backups that even a rogue AI can\'t delete.\n'));

  const config = loadConfig();
  if (!config) {
    console.log(chalk.red('  No config found. Run `oopsdb init` first.\n'));
    process.exit(1);
    return;
  }

  const license = loadLicense();
  if (!license || license.tier !== 'secure') {
    console.log(chalk.yellow('  Secure features require a Secure license.'));
    console.log(chalk.gray('  Get one at ') + chalk.cyan('https://oopsdb.com\n'));
    return;
  }

  // Find the latest snapshot
  const snapshots = listSnapshots();
  if (snapshots.length === 0) {
    console.log(chalk.red('  No snapshots found. Run `oopsdb snapshot` to create one.\n'));
    return;
  }

  const latestFile = snapshots[0].file;
  const fileName = path.basename(latestFile);
  const fileSizeInBytes = fs.statSync(latestFile).size;
  const fileSizeMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);

  console.log(chalk.blue(`  Found latest snapshot: ${fileName} (${fileSizeMB} MB)`));

  const baseUrl = process.env.TEST_LOCAL_API ? 'http://localhost:8788' : 'https://oopsdb.com';
  console.log(chalk.gray(`  Requesting secure upload token...\n`));

  let actualUploadUrl = '';
  try {
    const res = await fetch(`${baseUrl}/api/upload-url?fileName=${fileName}`, {
      headers: {
        'Authorization': `Bearer ${license.licenseKey}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(chalk.red(`  Failed to get upload token: ${res.status} ${res.statusText}`));
      console.log(chalk.gray(`  Details: ${errText}\n`));
      return;
    }

    const data = await res.json() as { uploadUrl: string };
    actualUploadUrl = data.uploadUrl;
  } catch (err: any) {
    console.log(chalk.red(`  Network error reaching backend: ${err.message}\n`));
    return;
  }

  await uploadToS3(latestFile, actualUploadUrl);
}

async function uploadToS3(filePath: string, uploadUrl: string): Promise<void> {
  const size = fs.statSync(filePath).size;
  const fileStream = fs.createReadStream(filePath);

  const spinner = ora(`Uploading to S3 Cloud Vault...`).start();

  try {
    const response = await fetch(uploadUrl, {
      method: 'PUT',
      // @ts-ignore - needed for Node native fetch with streams
      body: fileStream,
      duplex: 'half',
      headers: {
        'Content-Length': size.toString()
      }
    });

    if (!response.ok) {
      spinner.fail(`Upload failed: ${response.status} ${response.statusText}`);
      console.log(chalk.gray(`  Check your connection or license status.\n`));
    } else {
      spinner.succeed('Snapshot safely stored in immutable S3 Cloud Vault.');
      console.log(chalk.green('\n  Done! Your database is now AI-proof.\n'));
    }
  } catch (err: any) {
    spinner.fail(`Upload failed: ${err.message}`);
  }
}
