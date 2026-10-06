import { describe, expect, test } from "bun:test";
import { ethers } from "ethers";
import { ApiError } from "../errors";
import { creditBalance, getBalance } from "../ledger";
import TransactionModel from "../models/transaction.model";
import { setPolicyCheck } from "../policy";
import { expectErrorShape, NETH, NUSD, post, signTyped, ts, wei } from "./helpers";

const alice = ethers.Wallet.createRandom();
const bob = ethers.Wallet.createRandom();

// Body exactly as client/src/lib/noctrum.ts, tg api.ts, e2e helpers and server external-api.ts send it.
async function transferBody(
  from: ethers.HDNodeWallet,
  recipient: string,
  amount: string,
  { flags = [] as string[], token = NUSD, timestamp = ts() } = {},
) {
  const message = { sender: from.address, recipient, token, amount, flags, timestamp };
  const auth = await signTyped(from, "Private Token Transfer", message);
  return { account: from.address, recipient, token, amount, flags, timestamp, auth };
}

async function shieldedFor(wallet: ethers.HDNodeWallet) {
  const timestamp = ts();
  const auth = await signTyped(wallet, "Generate Shielded Address", { account: wallet.address, timestamp });
  const res = await post("/shielded-address", { account: wallet.address, timestamp, auth });
  expect(res.status).toBe(200);
  return ((await res.json()) as { address: string }).address;
}

describe("POST /private-transfer", () => {
  test("moves the balance and returns a uuid v7 transaction_id", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(10)));
    const res = await post("/private-transfer", await transferBody(alice, bob.address, wei(4)));
    expect(res.status).toBe(200);
    const json: any = await res.json();
    expect(Object.keys(json)).toEqual(["transaction_id"]);
    expect(json.transaction_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    expect(await getBalance(alice.address, NUSD)).toBe(BigInt(wei(6)));
    expect(await getBalance(bob.address, NUSD)).toBe(BigInt(wei(4)));
    const tx = await TransactionModel.findOne({ id: json.transaction_id });
    expect(tx).toMatchObject({
      type: "transfer",
      sender: alice.address.toLowerCase(),
      recipient: bob.address.toLowerCase(),
      token: NUSD,
      amount: wei(4),
      isSenderHidden: false,
    });
  });

  test("CRE body (numeric timestamp, checksummed token) is accepted", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(1)));
    const body = await transferBody(alice, bob.address, wei(1), { token: ethers.getAddress(NUSD) });
    const res = await post("/private-transfer", body);
    expect(res.status).toBe(200);
    expect(await getBalance(bob.address, NUSD)).toBe(BigInt(wei(1)));
  });

  test("insufficient balance → 400, nothing moves", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(1)));
    const res = await post("/private-transfer", await transferBody(alice, bob.address, wei(2)));
    expect(res.status).toBe(400);
    expectErrorShape(await res.json(), "insufficient_balance");
    expect(await getBalance(alice.address, NUSD)).toBe(BigInt(wei(1)));
    expect(await getBalance(bob.address, NUSD)).toBe(0n);
    expect(await TransactionModel.countDocuments()).toBe(0);
  });

  test("balance is per token", async () => {
    await creditBalance(alice.address, NETH, BigInt(wei(5)));
    const res = await post("/private-transfer", await transferBody(alice, bob.address, wei(1)));
    expectErrorShape(await res.json(), "insufficient_balance");
  });

  test("concurrent transfers never overdraw", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(3)));
    const bodies = await Promise.all(
      Array.from({ length: 6 }, (_, i) => transferBody(alice, bob.address, wei(1), { timestamp: ts() - i })),
    );
    const results = await Promise.all(bodies.map((b) => post("/private-transfer", b)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(await getBalance(alice.address, NUSD)).toBe(0n);
    expect(await getBalance(bob.address, NUSD)).toBe(BigInt(wei(3)));
  });

  test("shielded recipient resolves to its owner", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(10)));
    const shielded = await shieldedFor(bob);
    const res = await post("/private-transfer", await transferBody(alice, shielded, wei(7)));
    expect(res.status).toBe(200);
    expect(await getBalance(bob.address, NUSD)).toBe(BigInt(wei(7)));
    expect(await getBalance(shielded, NUSD)).toBe(0n);
  });

  test("policy check sees the resolved recipient; denial → 403 and nothing moves", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(10)));
    const shielded = await shieldedFor(bob);
    const seen: unknown[] = [];
    setPolicyCheck(async (...args) => {
      seen.push(args);
      throw new ApiError("operation_denied_by_policy", "denied");
    });
    const res = await post("/private-transfer", await transferBody(alice, shielded, wei(1)));
    expect(res.status).toBe(403);
    expectErrorShape(await res.json(), "operation_denied_by_policy");
    expect(seen).toEqual([[alice.address.toLowerCase(), bob.address.toLowerCase(), NUSD, BigInt(wei(1))]]);
    expect(await getBalance(alice.address, NUSD)).toBe(BigInt(wei(10)));
  });

  test("invalid recipient → invalid_recipient", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(1)));
    for (const recipient of ["0x1234", "not-an-address", ethers.ZeroAddress]) {
      const body = { ...(await transferBody(alice, bob.address, wei(1))), recipient };
      const res = await post("/private-transfer", body);
      expect(res.status).toBe(400);
      expectErrorShape(await res.json(), "invalid_recipient");
    }
  });

  test("bad amount / token / flags → bad_request", async () => {
    const good = await transferBody(alice, bob.address, wei(1));
    for (const patch of [
      { amount: "0" },
      { amount: "-1" },
      { amount: "1.5" },
      { token: "0xnope" },
      { flags: "hide-sender" },
      { flags: ["shout"] },
    ]) {
      const res = await post("/private-transfer", { ...good, ...patch });
      expect(res.status).toBe(400);
      expectErrorShape(await res.json(), "bad_request");
    }
  });

  test("signature over a different recipient or amount fails", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(10)));
    const body = await transferBody(alice, bob.address, wei(1));
    for (const patch of [{ recipient: alice.address }, { amount: wei(2) }]) {
      const res = await post("/private-transfer", { ...body, ...patch });
      expect(res.status).toBe(401);
      expectErrorShape(await res.json(), "request_auth_failed");
    }
    expect(await getBalance(alice.address, NUSD)).toBe(BigInt(wei(10)));
  });

  test("signed by someone other than account → request_auth_failed", async () => {
    await creditBalance(alice.address, NUSD, BigInt(wei(10)));
    const body = await transferBody(bob, bob.address, wei(1));
    const res = await post("/private-transfer", { ...body, account: alice.address });
    expect(res.status).toBe(401);
    expectErrorShape(await res.json(), "request_auth_failed");
  });

  test.each(["hide-sender", "hideSender", "hide_sender"])("flag %s marks the sender hidden", async (flag) => {
    await creditBalance(alice.address, NUSD, BigInt(wei(1)));
    const res = await post("/private-transfer", await transferBody(alice, bob.address, wei(1), { flags: [flag] }));
    expect(res.status).toBe(200);
    const { transaction_id } = (await res.json()) as { transaction_id: string };
    expect((await TransactionModel.findOne({ id: transaction_id }))!.isSenderHidden).toBe(true);
  });
});

describe("POST /shielded-address", () => {
  test("returns a fresh checksummed 20-byte address each call", async () => {
    const a = await shieldedFor(alice);
    const b = await shieldedFor(alice);
    expect(ethers.isAddress(a)).toBe(true);
    expect(ethers.getAddress(a)).toBe(a);
    expect(a).not.toBe(b);
    expect(a.toLowerCase()).not.toBe(alice.address.toLowerCase());
  });

  test("auth errors", async () => {
    const timestamp = ts();
    const auth = await signTyped(bob, "Generate Shielded Address", { account: bob.address, timestamp });
    let res = await post("/shielded-address", { account: alice.address, timestamp, auth });
    expect(res.status).toBe(401);
    expectErrorShape(await res.json(), "request_auth_failed");

    res = await post("/shielded-address", { account: alice.address });
    expect(res.status).toBe(400);
    expectErrorShape(await res.json(), "bad_request");
  });
});
