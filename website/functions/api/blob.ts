/// <reference types="@cloudflare/workers-types" />

// OopsDB cloud-vault — step 2 of 2.
// Receives the CLI's PUT of the encrypted backup and streams it into R2.
// Authorization is the short-lived HMAC token issued by /api/upload-url — the
// big upload never re-hits LemonSqueezy, and the token carries the object key +
// remaining byte budget, so an oversized file is rejected (the cap holds).

interface Env {
  VAULT: R2Bucket;
  BLOB_SIGNING_SECRET: string;
}

const enc = (s: string) => new TextEncoder().encode(s);
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function verifyToken(token: string, secret: string): Promise<{ k: string; e: number; m: number } | null> {
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = b64urlToBytes(token.slice(dot + 1));
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('HMAC', key, sig, enc(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(body)));
    if (typeof payload.k !== 'string' || typeof payload.e !== 'number') return null;
    if (Date.now() > payload.e) return null; // expired
    return payload;
  } catch { return null; }
}

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const token = url.searchParams.get('t') || '';
  const claims = await verifyToken(token, env.BLOB_SIGNING_SECRET);
  if (!claims) return json({ error: 'Invalid or expired upload token.' }, 403);

  // Enforce the remaining byte budget against the declared size.
  const len = Number(request.headers.get('Content-Length') || '0');
  if (claims.m && len > claims.m) {
    return json({ error: 'This backup exceeds your plan storage budget. Upgrade or prune at https://oopsdb.com' }, 413);
  }
  if (!request.body) return json({ error: 'Empty body.' }, 400);

  await env.VAULT.put(claims.k, request.body, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });

  return json({ ok: true, objectKey: claims.k }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
