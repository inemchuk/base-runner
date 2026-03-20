'use client';

export async function resolveBasenames(addresses: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    const res = await fetch('/api/resolve-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses }),
    });
    const { results } = await res.json();
    for (const { address, name } of results) {
      result.set(address.toLowerCase(), name ?? `${address.slice(0, 6)}…${address.slice(-4)}`);
    }
  } catch {}
  // fallback for any missing
  for (const addr of addresses) {
    if (!result.has(addr.toLowerCase())) {
      result.set(addr.toLowerCase(), `${addr.slice(0, 6)}…${addr.slice(-4)}`);
    }
  }
  return result;
}
