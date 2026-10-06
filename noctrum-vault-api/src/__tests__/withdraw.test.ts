import { describe, expect, test } from "bun:test";
import { ethers } from "ethers";
import { EIP712_DOMAIN } from "../auth";
import { indexOnce, VAULT_EVENTS, type LogSource } from "../indexer";
import { checkInvariant, type HoldingsSource } from "../invariant";
import { creditBalance, getBalance } from "../ledger";
import IndexerStateModel from "../models/indexer-state.model";
import TransactionModel from "../models/transaction.model";
import { setWithdrawPolicyCheck } from "../policy";
import { ApiError } from "../errors";
import {
  hashWithdrawTicket,
  signWithdrawTicket,
  sweepExpiredTickets,
  WITHDRAW_TICKET_TYPES,
} from "../withdrawals";
import { expectErrorShape, NETH, NUSD, post, signTyped, ts, wei } from "./helpers";

const VAULT = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
const SIGNER = new ethers.Wallet(process.env.TICKET_SIGNER_PRIVATE_KEY!);

/** Client body shape (client/src/lib/noctrum.ts requestWithdrawTicket). */
async function withdrawBody(wallet: ethers.HDNodeWallet, token: string, amount: string, timestamp = ts()) {
  const message = { account: wallet.address, token, amount, timestamp };
  const auth = await signTyped(wallet, "Withdraw Tokens", message);
  return { ...message, auth };
}

async function funded(amount = wei(100), token = NUSD) {
  const wallet = ethers.Wallet.createRandom();
  await creditBalance(wallet.address, token, BigInt(amount));
  return wallet;
}

function decodeTicket(ticket: string) {
  const bytes = ethers.getBytes(ticket);
  return {
    length: bytes.length,
    nonce: BigInt(ethers.hexlify(bytes.slice(0, 16))),
    deadline: Number(BigInt(ethers.hexlify(bytes.slice(16, 24)))),
    signature: ethers.hexlify(bytes.slice(24)),
  };
}

function withdrawLog(blockNumber: number, user: string, token: string, amount: string, ticketHash: string) {
  const { topics, data } = VAULT_EVENTS.encodeEventLog("Withdraw", [user, token, amount, ticketHash]);
  return {
    address: VAULT,
    topics,
    data,
    blockNumber,
    index: 0,
    transactionHash: ethers.keccak256(ethers.toUtf8Bytes(`w${blockNumber}:${ticketHash}`)),
    removed: false,
  } as unknown as ethers.Log;
}

/** Finalized head at `number` with timestamp `timestamp`; serves the given logs. */
function chain(number: number, timestamp: number, logs: ethers.Log[] = []) {
  const c = { number, timestamp, logs };
  const source: LogSource = {
    async getBlock() {
      return { number: c.number, timestamp: c.timestamp };
    },
    async getLogs(filter) {
      const from = Number(filter.fromBlock);
      const to = Number(filter.toBlock);
      return c.logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to);
    },
  };
  return { c, source };
}

async function drain(source: LogSource) {
  for (let i = 0; i < 100; i++) if ((await indexOnce(source)).toBlock === null) return;
}

describe("withdraw ticket", () => {
  const fields = {
    withdrawer: "0x93df365bafc36e655cbd30d736a6c5401583d7b2",
    token: NUSD,
    amount: 10n ** 18n,
    nonce: 2n ** 128n - 1n,
    deadline: 2 ** 40,
  };

  test("is nonce(16) ‖ deadline(8) ‖ sig(65) = 89 bytes", async () => {
    const { ticket } = await signWithdrawTicket(SIGNER, fields);
    const t = decodeTicket(ticket);
    expect(t.length).toBe(89);
    expect(t.nonce).toBe(fields.nonce);
    expect(t.deadline).toBe(fields.deadline);
    expect(ethers.getBytes(t.signature)).toHaveLength(65);
  });

  test("small nonce/deadline are left-padded", async () => {
    const { ticket } = await signWithdrawTicket(SIGNER, { ...fields, nonce: 1n, deadline: 5 });
    expect(ticket.slice(0, 2 + 48)).toBe("0x" + "00".repeat(15) + "01" + "00".repeat(7) + "05");
  });

  test("signature recovers to the ticket signer over WithdrawTicket on the vault domain", async () => {
    const { ticket, ticketHash } = await signWithdrawTicket(SIGNER, fields);
    const { signature } = decodeTicket(ticket);
    expect(ethers.verifyTypedData(EIP712_DOMAIN, WITHDRAW_TICKET_TYPES, fields, signature)).toBe(SIGNER.address);
    expect(ethers.recoverAddress(ticketHash, signature)).toBe(SIGNER.address);
    // Struct string must equal NoctrumVault.WITHDRAW_TICKET_TYPEHASH.
    expect(ethers.TypedDataEncoder.from(WITHDRAW_TICKET_TYPES).encodeType("WithdrawTicket")).toBe(
      "WithdrawTicket(address withdrawer,address token,uint256 amount,uint128 nonce,uint64 deadline)",
    );
    expect(EIP712_DOMAIN).toMatchObject({ name: "NoctrumPrivateToken", version: "0.0.1", chainId: 10143 });
  });
});

describe("POST /withdraw", () => {
  test("debits, returns the CPT shape and stores a pending withdrawal", async () => {
    const wallet = await funded(wei(100));
    const before = Math.floor(Date.now() / 1000);
    const res = await post("/withdraw", await withdrawBody(wallet, NUSD, wei(40)));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;

    expect(Object.keys(json).sort()).toEqual(["account", "amount", "deadline", "id", "ticket", "token"]);
    expect(json.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(json.account).toBe(wallet.address);
    expect(json.token).toBe(ethers.getAddress(NUSD));
    expect(json.amount).toBe(wei(40));
    expect(typeof json.deadline).toBe("number");
    expect(json.deadline).toBeGreaterThanOrEqual(before + 3600);
    expect(json.deadline).toBeLessThanOrEqual(before + 3602);

    const t = decodeTicket(json.ticket);
    expect(t.length).toBe(89);
    expect(t.deadline).toBe(json.deadline);
    const signed = { withdrawer: wallet.address, token: NUSD, amount: BigInt(wei(40)), nonce: t.nonce, deadline: t.deadline };
    expect(ethers.verifyTypedData(EIP712_DOMAIN, WITHDRAW_TICKET_TYPES, signed, t.signature)).toBe(SIGNER.address);

    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(60)));
    const row = await TransactionModel.findOne({ id: json.id }).lean();
    expect(row).toMatchObject({
      type: "withdrawal",
      account: wallet.address.toLowerCase(),
      token: NUSD,
      amount: wei(40),
      status: "pending",
      nonce: t.nonce.toString(),
      deadline: json.deadline,
      ticketHash: hashWithdrawTicket(signed).toLowerCase(),
    });
  });

  test("shows up in /transactions as a pending withdrawal", async () => {
    const wallet = await funded();
    const { id } = (await (await post("/withdraw", await withdrawBody(wallet, NUSD, wei(1)))).json()) as any;
    const message = { account: wallet.address, timestamp: ts(), cursor: "", limit: 10 };
    const auth = await signTyped(wallet, "List Transactions", message);
    const list = (await (await post("/transactions", { ...message, auth })).json()) as any;
    expect(list.transactions).toEqual([
      { id, type: "withdrawal", account: wallet.address.toLowerCase(), token: NUSD, amount: wei(1), status: "pending" },
    ]);
  });

  test("each ticket gets a fresh nonce", async () => {
    const wallet = await funded();
    const a = (await (await post("/withdraw", await withdrawBody(wallet, NUSD, wei(1)))).json()) as any;
    const b = (await (await post("/withdraw", await withdrawBody(wallet, NUSD, wei(1)))).json()) as any;
    expect(decodeTicket(a.ticket).nonce).not.toBe(decodeTicket(b.ticket).nonce);
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(98)));
  });

  test("insufficient balance → 400, nothing stored", async () => {
    const wallet = await funded(wei(5));
    const res = await post("/withdraw", await withdrawBody(wallet, NUSD, wei(6)));
    expect(res.status).toBe(400);
    expectErrorShape(await res.json(), "insufficient_balance");
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(5)));
    expect(await TransactionModel.countDocuments({ type: "withdrawal" })).toBe(0);
  });

  test("balance is per token", async () => {
    const wallet = await funded(wei(5), NUSD);
    const res = await post("/withdraw", await withdrawBody(wallet, NETH, wei(1)));
    expectErrorShape(await res.json(), "insufficient_balance");
  });

  test("concurrent requests never overdraw", async () => {
    const wallet = await funded(wei(10));
    const bodies = await Promise.all(Array.from({ length: 5 }, () => withdrawBody(wallet, NUSD, wei(3))));
    const results = await Promise.all(bodies.map((b) => post("/withdraw", b)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(1)));
  });

  test("policy denial → 403 and nothing moves; unregistered token → bad_request", async () => {
    const wallet = await funded();
    const seen: unknown[] = [];
    setWithdrawPolicyCheck(async (...args) => {
      seen.push(args);
      throw new ApiError("operation_denied_by_policy", "Withdrawal rejected by policy");
    });
    const res = await post("/withdraw", await withdrawBody(wallet, NUSD, wei(1)));
    expect(res.status).toBe(403);
    expectErrorShape(await res.json(), "operation_denied_by_policy");
    expect(seen).toEqual([[wallet.address.toLowerCase(), NUSD, BigInt(wei(1))]]);
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(100)));

    setWithdrawPolicyCheck(async (_w, token) => {
      throw new ApiError("bad_request", `Token ${token} is not registered in the vault`);
    });
    expectErrorShape(await (await post("/withdraw", await withdrawBody(wallet, NUSD, wei(1)))).json(), "bad_request");
  });

  test("bad amount / token / missing fields → bad_request", async () => {
    const wallet = await funded();
    for (const amount of ["0", "-1", "1.5", "abc"]) {
      const body = { account: wallet.address, token: NUSD, amount, timestamp: ts(), auth: "0x00" };
      expectErrorShape(await (await post("/withdraw", body)).json(), "bad_request");
    }
    const badToken = { account: wallet.address, token: "0x1234", amount: wei(1), timestamp: ts(), auth: "0x00" };
    expectErrorShape(await (await post("/withdraw", badToken)).json(), "bad_request");
    expectErrorShape(await (await post("/withdraw", { account: wallet.address })).json(), "bad_request");
  });

  test("auth errors", async () => {
    const wallet = await funded();
    const other = ethers.Wallet.createRandom();

    const body = await withdrawBody(wallet, NUSD, wei(1));
    const forged = { ...body, auth: (await withdrawBody(other, NUSD, wei(1))).auth };
    let res = await post("/withdraw", forged);
    expect(res.status).toBe(401);
    expectErrorShape(await res.json(), "request_auth_failed");

    res = await post("/withdraw", { ...body, amount: wei(2) }); // tampered amount
    expectErrorShape(await res.json(), "request_auth_failed");

    res = await post("/withdraw", await withdrawBody(wallet, NUSD, wei(1), ts() - 301));
    expectErrorShape(await res.json(), "request_auth_expired");
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(100)));
  });
});

describe("withdrawal lifecycle", () => {
  async function issue(amount = wei(40)) {
    const wallet = await funded();
    const json = (await (await post("/withdraw", await withdrawBody(wallet, NUSD, amount))).json()) as any;
    const row = (await TransactionModel.findOne({ id: json.id }).lean())!;
    return { wallet, json, row };
  }

  test("indexer completes the ticket from the Withdraw event, idempotently", async () => {
    const { wallet, json, row } = await issue();
    const log = withdrawLog(1005, wallet.address, NUSD, wei(40), row.ticketHash!);
    const { source } = chain(1010, json.deadline - 100, [log]);
    const r = await indexOnce(source);
    expect(r).toMatchObject({ withdrawals: 1, deposits: 0 });

    const done = (await TransactionModel.findOne({ id: json.id }).lean())!;
    expect(done).toMatchObject({ status: "completed", txHash: log.transactionHash.toLowerCase(), blockNumber: 1005 });
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(60)));

    // Re-scan: no change.
    await IndexerStateModel.updateOne({ key: "vault" }, { $set: { lastProcessedBlock: 999 } });
    expect((await indexOnce(source)).withdrawals).toBe(0);
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(60)));
  });

  test("a Withdraw for an unknown ticket is skipped", async () => {
    const log = withdrawLog(1001, ethers.Wallet.createRandom().address, NUSD, wei(1), ethers.ZeroHash.replace(/0$/, "1"));
    const { source } = chain(1010, 0, [log]);
    expect(await indexOnce(source)).toMatchObject({ withdrawals: 0, toBlock: 1010 });
  });

  test("refund waits for the indexer to pass the deadline, then re-credits once", async () => {
    const { wallet, json } = await issue();
    const { c, source } = chain(1010, json.deadline - 1);

    await drain(source);
    expect(await sweepExpiredTickets()).toBe(0); // still redeemable

    c.timestamp = json.deadline; // a block at the deadline can still redeem it
    await drain(source);
    expect(await sweepExpiredTickets()).toBe(0);

    c.number = 1020; // indexer is behind: head timestamp unknown until it catches up
    c.timestamp = json.deadline + 1;
    await IndexerStateModel.updateOne({ key: "vault" }, { $set: { lastProcessedBlock: 900 } });
    await indexOnce(source); // page 901-1000, not caught up
    expect(await sweepExpiredTickets()).toBe(0);

    await drain(source);
    expect(await sweepExpiredTickets()).toBe(1);
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(100)));
    expect((await TransactionModel.findOne({ id: json.id }).lean())!.status).toBe("refunded");

    expect(await sweepExpiredTickets()).toBe(0);
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(100)));
  });

  test("a ticket redeemed before the deadline is completed, never refunded", async () => {
    const { wallet, json, row } = await issue();
    const log = withdrawLog(1003, wallet.address, NUSD, wei(40), row.ticketHash!);
    const { source } = chain(1010, json.deadline + 500, [log]);
    await drain(source);
    expect(await sweepExpiredTickets()).toBe(0);
    expect((await TransactionModel.findOne({ id: json.id }).lean())!.status).toBe("completed");
    expect(await getBalance(wallet.address, NUSD)).toBe(BigInt(wei(60)));
  });

  test("no refunds before the indexer has ever caught up", async () => {
    const { json } = await issue();
    await TransactionModel.updateOne({ id: json.id }, { $set: { deadline: 1 } });
    expect(await sweepExpiredTickets()).toBe(0);
  });
});

describe("invariant job", () => {
  function holdings(map: Record<string, bigint>) {
    const calls: [string, number][] = [];
    const source: HoldingsSource = {
      async vaultBalance(token, blockTag) {
        calls.push([token, blockTag]);
        return map[token] ?? 0n;
      },
    };
    return { source, calls };
  }

  test("vault ≥ Σ balances + Σ pending tickets, read at the last indexed block", async () => {
    const wallet = await funded(wei(100));
    await creditBalance(ethers.Wallet.createRandom().address, NUSD, BigInt(wei(50)));
    await creditBalance(wallet.address, NETH, BigInt(wei(2)));
    await post("/withdraw", await withdrawBody(wallet, NUSD, wei(30))); // 120 ledger + 30 pending
    await IndexerStateModel.create({ key: "vault", lastProcessedBlock: 1234 });

    const { source, calls } = holdings({ [NUSD]: BigInt(wei(150)), [NETH]: BigInt(wei(2)) });
    const report = (await checkInvariant(source))!;
    expect(report.ok).toBe(true);
    expect(report.block).toBe(1234);
    expect(calls.every(([, b]) => b === 1234)).toBe(true);
    expect(report.rows.find((r) => r.token === NUSD)).toMatchObject({
      vault: wei(150),
      ledger: wei(120),
      pending: wei(30),
      ok: true,
    });
  });

  test("flags a token whose vault holdings fall short", async () => {
    const wallet = await funded(wei(100));
    await post("/withdraw", await withdrawBody(wallet, NUSD, wei(30)));
    const { source } = holdings({ [NUSD]: BigInt(wei(100)) - 1n });
    const report = (await checkInvariant(source))!;
    expect(report.ok).toBe(false);
    expect(report.rows).toEqual([{ token: NUSD, vault: (BigInt(wei(100)) - 1n).toString(), ledger: wei(70), pending: wei(30), ok: false }]);
  });

  test("completed and refunded tickets are not pending", async () => {
    const wallet = await funded(wei(100));
    const { id } = (await (await post("/withdraw", await withdrawBody(wallet, NUSD, wei(30)))).json()) as any;
    await TransactionModel.updateOne({ id }, { $set: { status: "completed" } });
    const { source } = holdings({ [NUSD]: BigInt(wei(70)) });
    expect((await checkInvariant(source))!.ok).toBe(true);
  });
});
