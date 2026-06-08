/// <reference types="@cloudflare/workers-types" />

// OopsDB cloud-vault — step 1 of 2.
// The CLI calls GET /api/upload-url (Bearer <licenseKey>) and receives a short-lived
// signed URL pointing at /api/blob. It then PUTs the backup there. We never expose
// S3 keys: storage is a native R2 binding (env.VAULT). Honest + abuse-proof:
//  - only a live, active license gets a URL
//  - hard per-account storage cap (refuse, don't bill) + retention pruning
//  - the signed token carries the remaining byte budget, so /api/blob can reject an
//    oversized file too — the cap cannot be exceeded.

interface Env {
  VAULT: R2Bucket;
  BLOB_SIGNING_SECRET: string;
}

type Tier = { id: string; label: string; keep: number; maxBytes: number };
const GB = 1024 * 1024 * 1024;
const TIERS: Record<string, Tier> = {
  pro:  { id: 'pro',  label: 'Pro',  keep: 7,  maxBytes: 2 * GB },
  plus: { id: 'plus', label: 'Plus', keep: 30, maxBytes: 20 * GB },
};

function tierForVariant(variantId?: string, variantName?: string): Tier {
  const id = String(variantId ?? '');
  const name = (variantName ?? '').toLowerCase();
  if (id === '1385287' || name.includes('plus') || name.includes('secure')) return TIERS.plus;
  return TIERS.pro;
}

async function validateLicense(licenseKey: string): Promise<{
  ok: boolean; customerId?: string; variantId?: string; variantName?: string;
}> {
  try {
    const res = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({ license_key: licenseKey }).toString(),
    });
    if (!res.ok) return { ok: false };
    const d: any = await res.json();
    if (!(d?.valid === true && d?.license_key?.status === 'active')) return { ok: false };
    return {
      ok: true,
      customerId: String(d?.meta?.customer_id ?? d?.license_key?.id ?? 'unknown'),
      variantId: d?.meta?.variant_id != null ? String(d.meta.variant_id) : undefined,
      variantName: d?.meta?.variant_name,
    };
  } catch { return { ok: false }; }
}

const enc = (s: string) => new TextEncoder().encode(s);
function b64url(bytes: Uint8Array): string {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function accountPrefix(seed: string): Promise<string> {
  const dg = await crypto.subtle.digest('SHA-256', enc(seed));
  return Array.from(new Uint8Array(dg)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function signToken(payload: object, secret: string): Promise<string> {
  const body = b64url(enc(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const auth = request.headers.get('Authorization') || '';
  const licenseKey = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!licenseKey) return json({ error: 'Missing license key.' }, 401);

  const lic = await validateLicense(licenseKey);
  if (!lic.ok) return json({ error: 'Invalid or inactive license. Manage it at https://oopsdb.com' }, 403);
  const tier = tierForVariant(lic.variantId, lic.variantName);

  const url = new URL(request.url);
  const fileName = url.searchParams.get('fileName');
  if (!fileName || /[\\/]/.test(fileName) || fileName.includes('..')) {
    return json({ error: 'A valid fileName query parameter is required.' }, 400);
  }

  const prefix = await accountPrefix(lic.customerId || licenseKey);
  const folder = `snapshots/${prefix}/`;

  // Current usage (R2 list, paginated)
  let objects: { key: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.VAULT.list({ prefix: folder, cursor });
    for (const o of page.objects) objects.push({ key: o.key, size: o.size });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  const used = objects.reduce((n, o) => n + o.size, 0);
  if (used >= tier.maxBytes) {
    return json({
      error: `Storage limit reached for the ${tier.label} plan (${(tier.maxBytes / GB).toFixed(0)} GB). ` +
        `Prune old snapshots or upgrade at https://oopsdb.com`,
      tier: tier.id, usedBytes: used, limitBytes: tier.maxBytes,
    }, 402);
  }

  // Retention: keep newest (tier.keep - 1) so the incoming makes `keep`.
  objects.sort((a, b) => (a.key < b.key ? -1 : 1)); // keys start with ms timestamp -> chronological
  const keepBefore = Math.max(tier.keep - 1, 0);
  if (objects.length > keepBefore) {
    const stale = objects.slice(0, objects.length - keepBefore).map((o) => o.key);
    if (stale.length) await env.VAULT.delete(stale);
  }

  const objectKey = `${folder}${Date.now()}-${fileName}`;
  const remaining = tier.maxBytes - used;
  const token = await signToken(
    { k: objectKey, e: Date.now() + 15 * 60 * 1000, m: remaining },
    env.BLOB_SIGNING_SECRET
  );
  const origin = new URL(request.url).origin;

  return json({
    uploadUrl: `${origin}/api/blob?t=${encodeURIComponent(token)}`,
    objectKey, plan: tier.id, retained: tier.keep, usedBytes: used, limitBytes: tier.maxBytes,
  }, 200);
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
