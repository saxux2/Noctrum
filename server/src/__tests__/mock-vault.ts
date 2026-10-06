// Stubbed vault-api `/transactions` for the pool wallet (see setup.ts).
// `incoming` holds transfers into the pool, newest first, in the CPT wire shape.
export const vaultState = { incoming: [] as Record<string, unknown>[], calls: 0 };

export function resetVault() {
  vaultState.incoming = [];
  vaultState.calls = 0;
}

/** Record a vault transfer of `amount` `token` from `sender` into the pool. */
export function poolReceives(sender: string, token: string, amount: string, over: Record<string, unknown> = {}) {
  const tx = {
    id: crypto.randomUUID(),
    type: "transfer",
    sender: sender.toLowerCase(),
    recipient: "pool",
    token: token.toLowerCase(),
    amount,
    is_incoming: true,
    is_sender_hidden: false,
    ...over,
  };
  vaultState.incoming.unshift(tx);
  return tx.id as string;
}
