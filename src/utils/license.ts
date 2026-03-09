import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';

// License stored globally in ~/.oopsdb/license.json (not per-project)
const GLOBAL_CONFIG_DIR = path.join(os.homedir(), '.oopsdb');
const LICENSE_FILE = path.join(GLOBAL_CONFIG_DIR, 'license.json');

// LemonSqueezy license API
const LEMONSQUEEZY_API = 'https://api.lemonsqueezy.com/v1/licenses';

export type Tier = 'free' | 'pro' | 'secure';

export interface LicenseInfo {
  licenseKey: string;
  instanceId: string;
  tier: Tier;
  activatedAt: string;
  customerName?: string;
  customerEmail?: string;
  variantName?: string;
}

function ensureGlobalDir(): void {
  if (!fs.existsSync(GLOBAL_CONFIG_DIR)) {
    fs.mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
  }
}

export function loadLicense(): LicenseInfo | null {
  if (!fs.existsSync(LICENSE_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveLicense(license: LicenseInfo): void {
  ensureGlobalDir();
  fs.writeFileSync(LICENSE_FILE, JSON.stringify(license, null, 2), 'utf8');
}

export function removeLicense(): void {
  if (fs.existsSync(LICENSE_FILE)) {
    fs.unlinkSync(LICENSE_FILE);
  }
}

export function getCurrentTier(): Tier {
  const license = loadLicense();
  if (!license) return 'free';
  return license.tier;
}

export function requiresLicense(dbType: string): boolean {
  return dbType !== 'sqlite';
}

function getInstanceName(): string {
  return `${os.userInfo().username}@${os.hostname()}`;
}

/**
 * Determine the tier from the LemonSqueezy variant name.
 */
function tierFromVariant(variantName: string): Tier {
  const lower = variantName.toLowerCase();
  if (lower.includes('secure')) return 'secure';
  if (lower.includes('pro')) return 'pro';
  return 'pro'; // default paid tier
}

/**
 * Make a POST request to LemonSqueezy license API.
 */
function lemonSqueezyRequest(endpoint: string, body: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams(body).toString();

    const options = {
      hostname: 'api.lemonsqueezy.com',
      path: `/v1/licenses/${endpoint}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid response from license server`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Could not reach license server: ${err.message}`));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('License server request timed out'));
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Activate a license key with LemonSqueezy.
 * Returns the license info on success, throws on failure.
 */
export async function activateLicense(licenseKey: string): Promise<LicenseInfo> {
  const instanceName = getInstanceName();

  const response = await lemonSqueezyRequest('activate', {
    license_key: licenseKey,
    instance_name: instanceName,
  });

  if (response.error) {
    throw new Error(response.error);
  }

  if (!response.activated && !response.license_key) {
    throw new Error(response.error || 'Activation failed. Check your license key.');
  }

  const variantName = response.meta?.variant_name || '';
  const tier = tierFromVariant(variantName);

  const license: LicenseInfo = {
    licenseKey,
    instanceId: response.instance?.id || '',
    tier,
    activatedAt: new Date().toISOString(),
    customerName: response.meta?.customer_name,
    customerEmail: response.meta?.customer_email,
    variantName,
  };

  saveLicense(license);
  return license;
}

/**
 * Deactivate the current license.
 */
export async function deactivateLicense(): Promise<void> {
  const license = loadLicense();
  if (!license) {
    throw new Error('No active license found.');
  }

  const response = await lemonSqueezyRequest('deactivate', {
    license_key: license.licenseKey,
    instance_id: license.instanceId,
  });

  if (response.error && !response.deactivated) {
    throw new Error(response.error);
  }

  removeLicense();
}

/**
 * Validate the current license is still active.
 * Returns true if valid, false if invalid/expired.
 * On network error, returns true (offline grace).
 */
export async function validateLicense(): Promise<boolean> {
  const license = loadLicense();
  if (!license) return false;

  try {
    const response = await lemonSqueezyRequest('validate', {
      license_key: license.licenseKey,
      instance_id: license.instanceId,
    });

    return response.valid === true;
  } catch {
    // Offline grace: if we can't reach the server, trust the local license
    return true;
  }
}
