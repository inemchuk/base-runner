// Client-side helper that mints and caches a signed session token for the
// economy sync endpoints (/api/shop, /api/economy/hydrate). Independent from
// the per-game token in useLeaderboard so consuming one never invalidates the
// other. Refreshed before the server's 30-minute expiry.
const TOKEN_TTL_MS = 25 * 60 * 1000;

let cache: { address: string; token: string; fetchedAt: number } | null = null;

export async function getEconomySessionToken(address: string): Promise<string | null> {
  const addr = address.toLowerCase();
  if (cache && cache.address === addr && Date.now() - cache.fetchedAt < TOKEN_TTL_MS) {
    return cache.token;
  }
  try {
    const res = await fetch('/api/score/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: addr }),
    });
    const data = await res.json();
    if (data?.token) {
      cache = { address: addr, token: data.token, fetchedAt: Date.now() };
      return data.token;
    }
  } catch (err) {
    console.error('economy session token fetch error:', err);
  }
  return null;
}
