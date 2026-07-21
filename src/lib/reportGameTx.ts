// Fire-and-forget referral transaction reporter. Called from tx hook success
// paths with a confirmed transaction hash. Never throws, never blocks the
// gameplay flow; the server ignores wallets without a pending referral bind.
export function reportGameTx(address: string | undefined, txHash: string | undefined): void {
  if (!address || !txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) return;
  try {
    void fetch('/api/referral/tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, txHash }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // ignore — reporting must never affect gameplay
  }
}
