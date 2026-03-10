import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as dotenv from 'dotenv';
import * as path from 'path';
import chalk from 'chalk';

// Load the exact .env file we created for Cloudflare
dotenv.config({ path: path.join(__dirname, '../website/.env') });

async function testS3() {
  console.log(chalk.bold('\n  Testing AWS S3 Credentials and Upload Flow...\n'));

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const bucketName = process.env.AWS_S3_BUCKET;

  if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
    console.log(chalk.red('  ❌ Missing AWS variables in `website/.env`'));
    process.exit(1);
  }

  try {
    const s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    const testKey = `test-upload-${Date.now()}.txt`;
    console.log(chalk.gray(`  Generating Pre-Signed URL for gs://${bucketName}/${testKey}...`));

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      ContentType: 'text/plain',
    });

    // 1. Test URL Generation
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });
    console.log(chalk.green('  ✅ URL Generated successfully!'));

    // 2. Test actual PUT Upload
    console.log(chalk.gray('  Executing PUT request to Pre-Signed URL...'));
    const response = await fetch(signedUrl, {
      method: 'PUT',
      body: 'This is a test file to verify OopsDB AWS permissions.',
      headers: {
        'Content-Type': 'text/plain',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Upload rejected by AWS: ${response.status} ${response.statusText}\n${err}`);
    }
    console.log(chalk.green('  ✅ File Uploaded successfully!'));

    // 3. Test Delete Object (expected to fail for security)
    console.log(chalk.gray('  Testing immutable vault (attempting to delete file)...'));
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));
      console.log(chalk.yellow('  ⚠️ Warning: Your IAM user has DeleteObject permissions. For maximum rogue AI protection, we recommend removing s3:DeleteObject from the IAM policy.'));
    } catch (delErr: any) {
      if (delErr.name === 'AccessDenied' || delErr.$metadata?.httpStatusCode === 403) {
        console.log(chalk.green('  ✅ Vault is Immutable! (DeleteObject was blocked as expected)'));
      } else {
        throw delErr;
      }
    }

    console.log(chalk.blue.bold('\n  🚀 All AWS S3 Systems Go! Proceed to deployment.\n'));
  } catch (error: any) {
    console.log(chalk.red(`\n  ❌ Test Failed: ${error.message}\n`));
    console.log(chalk.yellow('  Ensure your IAM user has `s3:PutObject` permissions for the bucket.'));
    process.exit(1);
  }
}

testS3();
