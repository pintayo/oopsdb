/// <reference types="@cloudflare/workers-types" />

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

interface Env {
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_S3_BUCKET: string;
  SECURE_AUTH_TOKEN: string; // A shared secret between the CLI and the Backend to prevent abuse
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;

    // 1. Basic Auth / License Validation
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || authHeader !== `Bearer ${env.SECURE_AUTH_TOKEN}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(request.url);
    const fileName = url.searchParams.get('fileName');

    if (!fileName) {
      return new Response(JSON.stringify({ error: 'fileName query parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Configure AWS S3 Client
    const s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    });

    // 3. Generate Pre-Signed PUT URL
    // We isolate snapshots by license/user timestamp to avoid overwrites.
    // In a real app, you would extract the user ID from the license token.
    const objectKey = `snapshots/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: objectKey,
      ContentType: 'application/octet-stream', // Required for encrypted binary blobs
    });

    // The Pre-Signed URL is valid for exactly 15 minutes
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return new Response(JSON.stringify({ uploadUrl: signedUrl }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Important: Allow the CLI to hit this endpoint
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
