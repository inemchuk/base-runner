// ── Base App notifications (dashboard.base.org) ────────────────────────────
// Wallet-address based notifications API. Users opt in by pinning the app in
// Base App AND enabling notifications. Delivery is Base App only.
//
// Docs: https://docs.base.org/apps/technical-guides/base-notifications

const API_BASE = 'https://dashboard.base.org/api/v1/notifications';

function appUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error('NEXT_PUBLIC_APP_URL is not set');
  return url;
}

function apiKey(): string {
  const key = process.env.BASE_NOTIFICATIONS_API_KEY;
  if (!key) throw new Error('BASE_NOTIFICATIONS_API_KEY is not set');
  return key;
}

// Base API constraints
const MAX_TITLE = 30;
const MAX_MESSAGE = 200;
const MAX_ADDRESSES_PER_REQUEST = 1000;

export interface SendResult {
  ok: boolean;
  status: number;
  body: unknown;
}

/**
 * Fetch wallet addresses that have notifications enabled for this app.
 * Follows cursor pagination defensively (the API returns paginated results).
 */
export async function fetchOptedInAddresses(): Promise<string[]> {
  const addresses: string[] = [];
  let cursor: string | undefined;

  // Hard cap on pages to avoid runaway loops if pagination shape differs.
  for (let page = 0; page < 100; page++) {
    const params = new URLSearchParams({
      app_url: appUrl(),
      notification_enabled: 'true',
    });
    if (cursor) params.set('cursor', cursor);

    const res = await fetch(`${API_BASE}/app/users?${params.toString()}`, {
      headers: { 'x-api-key': apiKey() },
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`fetchOptedInAddresses failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      users?: Array<{ wallet_address?: string; address?: string }>;
      data?: Array<{ wallet_address?: string; address?: string }>;
      next_cursor?: string;
      cursor?: string;
    };

    const rows = data.users ?? data.data ?? [];
    for (const r of rows) {
      const addr = r.wallet_address ?? r.address;
      if (addr) addresses.push(addr.toLowerCase());
    }

    cursor = data.next_cursor ?? data.cursor;
    if (!cursor || rows.length === 0) break;
  }

  return Array.from(new Set(addresses));
}

/**
 * Send a notification to specific wallet addresses (chunked to 1000/request).
 * targetPath, if provided, must start with "/" and stays within the app domain.
 */
export async function sendBaseNotification(opts: {
  walletAddresses: string[];
  title: string;
  message: string;
  targetPath?: string;
}): Promise<SendResult[]> {
  const title = opts.title.slice(0, MAX_TITLE);
  const message = opts.message.slice(0, MAX_MESSAGE);
  const targetPath = opts.targetPath;

  if (targetPath && !targetPath.startsWith('/')) {
    throw new Error('targetPath must start with "/"');
  }

  const unique = Array.from(new Set(opts.walletAddresses.map((a) => a.toLowerCase())));
  const results: SendResult[] = [];

  for (let i = 0; i < unique.length; i += MAX_ADDRESSES_PER_REQUEST) {
    const chunk = unique.slice(i, i + MAX_ADDRESSES_PER_REQUEST);

    const res = await fetch(`${API_BASE}/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey(),
      },
      body: JSON.stringify({
        app_url: appUrl(),
        wallet_addresses: chunk,
        title,
        message,
        ...(targetPath ? { target_path: targetPath } : {}),
      }),
    });

    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text(); }
    results.push({ ok: res.ok, status: res.status, body });
  }

  return results;
}

/** Broadcast to every opted-in user. Returns the per-chunk send results. */
export async function broadcastBaseNotification(opts: {
  title: string;
  message: string;
  targetPath?: string;
}): Promise<{ recipients: number; results: SendResult[] }> {
  const walletAddresses = await fetchOptedInAddresses();
  if (walletAddresses.length === 0) return { recipients: 0, results: [] };
  const results = await sendBaseNotification({ walletAddresses, ...opts });
  return { recipients: walletAddresses.length, results };
}
