import { createHmac } from 'crypto';

const SECRET = process.env.ANTI_CHEAT_SECRET ?? 'dev_secret_change_in_prod';

// Longest realistic game / token lifetime. Shared by score submission and the
// economy endpoints that reuse the same signed session token.
export const MAX_SESSION_AGE_MS = 30 * 60 * 1000;

// Anti-cheat checks run only when a real secret is configured. Local dev (no
// secret set) skips token verification to avoid friction — mirrors the posture
// in /api/score/submit.
export function isAntiCheatEnabled(): boolean {
  return process.env.ANTI_CHEAT_SECRET !== undefined;
}

export type TokenVerification =
  | { ok: true; issuedAt: number }
  | { ok: false; reason: string };

// Verifies a token minted by /api/score/session. `address` must be lowercased
// (the token is signed over the lowercased address).
export function verifySessionToken(token: string, address: string): TokenVerification {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return { ok: false, reason: 'malformed token' };

    const [tokenAddr, issuedAtStr, sig] = parts;
    const issuedAt = parseInt(issuedAtStr, 10);
    if (isNaN(issuedAt)) return { ok: false, reason: 'bad timestamp' };
    if (tokenAddr !== address) return { ok: false, reason: 'address mismatch' };

    const payload = `${tokenAddr}:${issuedAtStr}`;
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex');
    if (sig !== expected) return { ok: false, reason: 'invalid signature' };

    const age = Date.now() - issuedAt;
    if (age < 0) return { ok: false, reason: 'token from the future' };
    if (age > MAX_SESSION_AGE_MS) return { ok: false, reason: 'session expired' };

    return { ok: true, issuedAt };
  } catch {
    return { ok: false, reason: 'token parse error' };
  }
}
