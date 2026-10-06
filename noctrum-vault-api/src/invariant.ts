import { ethers } from "ethers";
import { config } from "./config";
import { getLastProcessedBlock } from "./indexer";
import BalanceModel from "./models/balance.model";
import TransactionModel from "./models/transaction.model";

// Reads the vault's token holdings at a given block (lets tests inject a fake).
export interface HoldingsSource {
  vaultBalance(token: string, blockTag: number): Promise<bigint>;
}

export type InvariantRow = {
  token: string;
  vault: string;
  ledger: string;
  pending: string;
  ok: boolean;
};

async function ledgerTotals() {
  const totals = new Map<string, { ledger: bigint; pending: bigint }>();
  const row = (token: string) => {
    let t = totals.get(token);
    if (!t) totals.set(token, (t = { ledger: 0n, pending: 0n }));
    return t;
  };
  for (const b of await BalanceModel.find({}, { token: 1, amount: 1 }).lean()) {
    row(b.token).ledger += BigInt(b.amount);
  }
  const pending = await TransactionModel.find(
    { type: "withdrawal", status: "pending" },
    { token: 1, amount: 1 },
  ).lean();
  for (const w of pending) row(w.token).pending += BigInt(w.amount);
  return totals;
}

/**
 * For each token: vault.balanceOf ≥ Σ private balances + Σ pending tickets (BACKEND §2.4).
 * The vault is read at the indexer's last processed block, so on-chain deposits and
 * redemptions the ledger has not seen yet cannot cause false alarms. Returns null if the
 * indexer moved during the read (try again next round).
 */
export async function checkInvariant(source: HoldingsSource) {
  const block = await getLastProcessedBlock();
  const totals = await ledgerTotals();
  if ((await getLastProcessedBlock()) !== block) return null;

  const rows: InvariantRow[] = [];
  for (const [token, { ledger, pending }] of totals) {
    const vault = await source.vaultBalance(token, block);
    rows.push({
      token,
      vault: vault.toString(),
      ledger: ledger.toString(),
      pending: pending.toString(),
      ok: vault >= ledger + pending,
    });
  }
  for (const r of rows.filter((r) => !r.ok)) {
    console.error(
      `[invariant] ALERT token ${r.token} at block ${block}: vault ${r.vault} < ledger ${r.ledger} + pending ${r.pending}`,
    );
  }
  return { block, rows, ok: rows.every((r) => r.ok) };
}

export function rpcHoldings(provider: ethers.Provider): HoldingsSource {
  const erc20 = new ethers.Interface(["function balanceOf(address) view returns (uint256)"]);
  return {
    async vaultBalance(token, blockTag) {
      const data = await provider.call({
        to: token,
        data: erc20.encodeFunctionData("balanceOf", [config.VAULT_ADDRESS]),
        blockTag,
      });
      return erc20.decodeFunctionResult("balanceOf", data)[0] as bigint;
    },
  };
}

export function startInvariantJob(
  source: HoldingsSource = rpcHoldings(
    new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, { staticNetwork: true }),
  ),
) {
  const run = () =>
    checkInvariant(source).catch((err) =>
      console.error("[invariant]", err instanceof Error ? err.message : err),
    );
  run();
  const timer = setInterval(run, config.INVARIANT_MS);
  return () => clearInterval(timer);
}
