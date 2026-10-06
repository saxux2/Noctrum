import type { ClientSession } from "mongoose";
import BalanceModel from "./models/balance.model";

export async function getBalance(account: string, token: string, session?: ClientSession) {
  const row = await BalanceModel.findOne({
    account: account.toLowerCase(),
    token: token.toLowerCase(),
  }).session(session ?? null);
  return BigInt(row?.amount ?? "0");
}

export async function creditBalance(
  account: string,
  token: string,
  amount: bigint,
  session?: ClientSession,
) {
  const current = await getBalance(account, token, session);
  await BalanceModel.updateOne(
    { account: account.toLowerCase(), token: token.toLowerCase() },
    { $set: { amount: (current + amount).toString() } },
    { upsert: true, session },
  );
}

/** Returns false (no write) when the balance is insufficient. */
export async function debitBalance(
  account: string,
  token: string,
  amount: bigint,
  session?: ClientSession,
) {
  const current = await getBalance(account, token, session);
  if (current < amount) return false;
  await BalanceModel.updateOne(
    { account: account.toLowerCase(), token: token.toLowerCase() },
    { $set: { amount: (current - amount).toString() } },
    { upsert: true, session },
  );
  return true;
}

export async function listBalances(account: string) {
  const rows = await BalanceModel.find({ account: account.toLowerCase() }).sort({ token: 1 });
  return rows.map((r) => ({ token: r.token, amount: r.amount }));
}
