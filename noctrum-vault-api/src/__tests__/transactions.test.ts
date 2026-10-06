import { describe, expect, test } from "bun:test";
import { ethers } from "ethers";
import { creditBalance } from "../ledger";
import TransactionModel from "../models/transaction.model";
import { expectErrorShape, NUSD, post, signTyped, ts, wei } from "./helpers";

const alice = ethers.Wallet.createRandom();
const bob = ethers.Wallet.createRandom();
const carol = ethers.Wallet.createRandom();

// Raycast external-api.ts: body = {...message, auth} (cursor always present, "" on page 1).
// CPT api-scripts/transactions.ts: cursor omitted when empty, signed as "".
async function txBody(wallet: ethers.HDNodeWallet, limit = 20, cursor = "", omitEmptyCursor = false) {
  const message = { account: wallet.address, timestamp: ts(), cursor, limit };
  const auth = await signTyped(wallet, "List Transactions", message);
  const body: Record<string, unknown> = { ...message, auth };
  if (omitEmptyCursor && !cursor) delete body.cursor;
  return body;
}

async function list(wallet: ethers.HDNodeWallet, limit = 20, cursor = "") {
  const res = await post("/transactions", await txBody(wallet, limit, cursor));
  expect(res.status).toBe(200);
  return (await res.json()) as any;
}

async function transfer(from: ethers.HDNodeWallet, recipient: string, amount: string, flags: string[] = []) {
  const timestamp = ts();
  const message = { sender: from.address, recipient, token: NUSD, amount, flags, timestamp };
  const auth = await signTyped(from, "Private Token Transfer", message);
  const res = await post("/private-transfer", { account: from.address, recipient, token: NUSD, amount, flags, timestamp, auth });
  expect(res.status).toBe(200);
  return ((await res.json()) as { transaction_id: string }).transaction_id;
}

async function shieldedFor(wallet: ethers.HDNodeWallet) {
  const timestamp = ts();
  const auth = await signTyped(wallet, "Generate Shielded Address", { account: wallet.address, timestamp });
  const res = await post("/shielded-address", { account: wallet.address, timestamp, auth });
  return ((await res.json()) as { address: string }).address;
}

async function seedDeposit(who: string, amount: string) {
  await TransactionModel.create({
    id: Bun.randomUUIDv7(),
    type: "deposit",
    account: who.toLowerCase(),
    token: NUSD,
    amount,
    txHash: "0x" + "ab".repeat(32),
    eventKey: `${"0x" + "ab".repeat(32)}:${Math.random()}`,
    createdAt: Date.now(),
  });
  await creditBalance(who, NUSD, BigInt(amount));
}

describe("POST /transactions", () => {
  test("empty history", async () => {
    expect(await list(alice)).toEqual({ transactions: [], has_more: false, next_cursor: null });
  });

  test("CPT shapes for deposit, outgoing and incoming transfer", async () => {
    await seedDeposit(alice.address, wei(10));
    await transfer(alice, bob.address, wei(3));

    const a = await list(alice);
    expect(a.transactions).toHaveLength(2);
    const [out, dep] = a.transactions; // newest first
    expect(dep).toEqual({
      id: expect.any(String),
      type: "deposit",
      account: alice.address.toLowerCase(),
      token: NUSD,
      amount: wei(10),
      tx_hash: "0x" + "ab".repeat(32),
    });
    expect(out).toEqual({
      id: expect.any(String),
      type: "transfer",
      sender: alice.address.toLowerCase(),
      recipient: bob.address.toLowerCase(),
      token: NUSD,
      amount: wei(3),
      is_incoming: false,
      is_sender_hidden: false,
    });

    const b = await list(bob);
    expect(b.transactions).toEqual([{ ...out, is_incoming: true }]);
    expect(await list(carol)).toMatchObject({ transactions: [] });
  });

  test("hide-sender: recipient does not see the sender, sender still does", async () => {
    await seedDeposit(alice.address, wei(1));
    await transfer(alice, bob.address, wei(1), ["hide-sender"]);

    const [incoming] = (await list(bob)).transactions;
    expect(incoming).not.toHaveProperty("sender");
    expect(incoming).toMatchObject({ is_incoming: true, is_sender_hidden: true });

    const [outgoing] = (await list(alice)).transactions;
    expect(outgoing).toMatchObject({ sender: alice.address.toLowerCase(), is_sender_hidden: true });
  });

  test("shielded transfer: sender never learns the owner", async () => {
    await seedDeposit(alice.address, wei(1));
    const shielded = await shieldedFor(bob);
    await transfer(alice, shielded, wei(1));

    const [outgoing] = (await list(alice)).transactions;
    expect(outgoing.recipient).toBe(shielded.toLowerCase());
    expect(JSON.stringify(outgoing)).not.toContain(bob.address.toLowerCase().slice(2));

    const [incoming] = (await list(bob)).transactions;
    expect(incoming).toMatchObject({ recipient: shielded.toLowerCase(), is_incoming: true });
  });

  test("withdrawal rows carry status", async () => {
    await TransactionModel.create({
      id: Bun.randomUUIDv7(),
      type: "withdrawal",
      account: alice.address.toLowerCase(),
      token: NUSD,
      amount: wei(2),
      status: "pending",
      createdAt: Date.now(),
    });
    expect((await list(alice)).transactions).toEqual([
      { id: expect.any(String), type: "withdrawal", account: alice.address.toLowerCase(), token: NUSD, amount: wei(2), status: "pending" },
    ]);
  });

  test("cursor pagination walks every item once, newest first", async () => {
    await seedDeposit(alice.address, wei(10));
    const ids: string[] = [];
    for (let i = 1; i <= 4; i++) ids.push(await transfer(alice, bob.address, String(i)));

    const seen: string[] = [];
    let cursor = "";
    let pages = 0;
    for (;;) {
      const page = await list(alice, 2, cursor);
      pages++;
      seen.push(...page.transactions.map((t: any) => t.id));
      if (!page.has_more) {
        expect(page.next_cursor).toBeNull();
        break;
      }
      expect(page.next_cursor).toBe(page.transactions.at(-1).id);
      cursor = page.next_cursor;
    }
    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(seen.slice(0, 4)).toEqual([...ids].reverse());
    expect(seen).toEqual([...seen].sort().reverse());
  });

  test("cursor omitted from the body is signed as \"\"", async () => {
    await seedDeposit(alice.address, wei(1));
    const res = await post("/transactions", await txBody(alice, 10, "", true));
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).transactions).toHaveLength(1);
  });

  test("errors", async () => {
    let res = await post("/transactions", { ...(await txBody(alice)), limit: 21 });
    expectErrorShape(await res.json(), "request_auth_failed");

    res = await post("/transactions", await txBody(alice, 0));
    expect(res.status).toBe(400);
    expectErrorShape(await res.json(), "bad_request");

    res = await post("/transactions", await txBody(alice, 10, "not-a-uuid"));
    expect(res.status).toBe(400);
    expectErrorShape(await res.json(), "bad_request");

    const body = await txBody(bob);
    res = await post("/transactions", { ...body, account: alice.address });
    expect(res.status).toBe(401);
    expectErrorShape(await res.json(), "request_auth_failed");
  });
});
