'use client';

import { useEffect } from 'react';
import { useAccount } from 'wagmi';

// ── Referral attribution ────────────────────────────────────────────────────
// Captures ?ref=CODE on load (before the wallet exists) and binds the wallet
// to the referrer once the address is available. One attempt per wallet —
// the server enforces the real rules (new wallet only, first touch wins).

const REF_KEY = 'referralCode';
const BIND_KEY = 'referralBindDone';

export function useReferral() {
  const { address } = useAccount();

  // Capture the code as early as possible; keep the first one seen.
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get('ref');
      if (ref && /^[A-Za-z0-9]{4,16}$/.test(ref) && !localStorage.getItem(REF_KEY)) {
        localStorage.setItem(REF_KEY, ref.toUpperCase());
      }
    } catch {
      // storage unavailable — silently skip
    }
  }, []);

  // Bind once the wallet is known.
  useEffect(() => {
    if (!address) return;
    let code: string | null = null;
    try {
      if (localStorage.getItem(BIND_KEY) === address.toLowerCase()) return;
      code = localStorage.getItem(REF_KEY);
    } catch {
      return;
    }
    if (!code) return;

    fetch('/api/referral/bind', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, address }),
    })
      .then((r) => r.json())
      .then(() => {
        try { localStorage.setItem(BIND_KEY, address.toLowerCase()); } catch {}
      })
      .catch(() => {
        // network hiccup — retry next session (server dedupes anyway)
      });
  }, [address]);
}
