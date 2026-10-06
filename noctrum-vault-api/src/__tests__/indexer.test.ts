import { describe, expect, test } from "bun:test";
import { ethers } from "ethers";
import { DEPOSIT_TOPIC, getLastProcessedBlock, indexOnce, VAULT_EVENTS, type LogSource } from "../indexer";
import { getBalance } from "../ledger";
import IndexerStateModel from "../models/indexer-state.model";
import TransactionModel from "../models/transaction.model";
import { NETH, NUSD, wei } from "./helpers";

const VAULT = "0x65877F6BFd3f2D293454658BCb290b112397Eeb5";
const user = ethers.Wallet.createRandom().address;

function depositLog(blockNumber: number, index: number, token: string, amount: string, who = user) {
  const { topics, data } = VAULT_EVENTS.encodeEventLog("Deposit", [who, token, amount]);
  return {
    address: VAULT,
    topics,
    data,
    blockNumber,
    index,
    transactionHash: ethers.keccak256(ethers.toUtf8Bytes(`${blockNumber}:${index}`)),
    removed: false,
  } as unknown as ethers.Log;
}

/** In-memory chain. Records every call so tests can assert the tag and ranges. */
function fakeChain(finalized: number, logs: ethers.Log[]) {
  const chain = {
    finalized,
    logs,
    calls: { blockTags: [] as string[], ranges: [] as [number, number][] },
    source: undefined as unknown as LogSource,
  };
  chain.source = {
    async getBlock(tag) {
      chain.calls.blockTags.push(tag);
      return { number: chain.finalized };
    },
    async getLogs(filter) {
      const from = Number(filter.fromBlock);
      const to = Number(filter.toBlock);
      chain.calls.ranges.push([from, to]);
      expect(filter.address).toBe(VAULT);
      expect(filter.topics).toEqual([DEPOSIT_TOPIC]);
      return chain.logs.filter((l) => l.blockNumber >= from && l.blockNumber <= to);
    },
  };
  return chain;
}

async function drain(source: LogSource) {
  for (let i = 0; i < 1000; i++) {
    const r = await indexOnce(source);
    if (r.toBlock === null) return;
  }
  throw new Error("indexer did not catch up");
}

describe("deposit indexer", () => {
  test("credits deposits and records history", async () => {
    const chain = fakeChain(1010, [depositLog(1003, 0, NUSD, wei(10)), depositLog(1005, 2, NETH, wei(1))]);
    const r = await indexOnce(chain.source);
    expect(r).toMatchObject({ fromBlock: 1000, toBlock: 1010, deposits: 2 });
    expect(await getBalance(user, NUSD)).toBe(BigInt(wei(10)));
    expect(await getBalance(user, NETH)).toBe(BigInt(wei(1)));

    const txs = await TransactionModel.find({ type: "deposit" }).sort({ blockNumber: 1 });
    expect(txs).toHaveLength(2);
    expect(txs[0]).toMatchObject({ account: user.toLowerCase(), token: NUSD, amount: wei(10) });
    expect(txs[0]!.txHash).toBe(chain.logs[0]!.transactionHash.toLowerCase());
  });

  test("only reads up to the finalized head", async () => {
    const chain = fakeChain(1050, [depositLog(1040, 0, NUSD, wei(1)), depositLog(1060, 0, NUSD, wei(5))]);
    await drain(chain.source);
    expect(chain.calls.blockTags.every((t) => t === "finalized")).toBe(true);
    expect(await getBalance(user, NUSD)).toBe(BigInt(wei(1)));
    expect(await getLastProcessedBlock()).toBe(1050);

    chain.finalized = 1070; // block 1060 finalizes
    await drain(chain.source);
    expect(await getBalance(user, NUSD)).toBe(BigInt(wei(6)));
  });

  test("pages in ≤ 100-block windows and persists the cursor", async () => {
    const chain = fakeChain(1349, [depositLog(1000, 0, NUSD, wei(1)), depositLog(1349, 0, NUSD, wei(2))]);
    await drain(chain.source);
    expect(chain.calls.ranges).toEqual([
      [1000, 1099],
      [1100, 1199],
      [1200, 1299],
      [1300, 1349],
    ]);
    for (const [a, b] of chain.calls.ranges) expect(b - a + 1).toBeLessThanOrEqual(100);
    expect((await IndexerStateModel.findOne({ key: "vault" }))!.lastProcessedBlock).toBe(1349);
    expect(await getBalance(user, NUSD)).toBe(BigInt(wei(3)));
  });

  test("is idempotent per (txHash, logIndex)", async () => {
    const log = depositLog(1002, 1, NUSD, wei(10));
    const chain = fakeChain(1010, [log, log]); // duplicate delivery in one page
    await drain(chain.source);
    expect(await getBalance(user, NUSD)).toBe(BigInt(wei(10)));

    // Cursor rewound (e.g. restored backup): a re-scan must not double-credit.
    await IndexerStateModel.updateOne({ key: "vault" }, { $set: { lastProcessedBlock: 999 } });
    await drain(chain.source);
    expect(await getBalance(user, NUSD)).toBe(BigInt(wei(10)));
    expect(await TransactionModel.countDocuments()).toBe(1);

    // Same tx, different log index is a distinct deposit.
    chain.logs.push({ ...log, index: 2 } as ethers.Log);
    await IndexerStateModel.updateOne({ key: "vault" }, { $set: { lastProcessedBlock: 999 } });
    await drain(chain.source);
    expect(await getBalance(user, NUSD)).toBe(BigInt(wei(20)));
  });

  test("a failed page leaves balances and cursor untouched", async () => {
    const chain = fakeChain(1010, [depositLog(1001, 0, NUSD, wei(10))]);
    const bad = { ...depositLog(1002, 0, NUSD, wei(1)), data: "0x" } as ethers.Log;
    chain.logs.push(bad);
    await expect(indexOnce(chain.source)).rejects.toThrow();
    expect(await getBalance(user, NUSD)).toBe(0n);
    expect(await getLastProcessedBlock()).toBe(999);
  });

  test("nothing to do when caught up", async () => {
    const chain = fakeChain(999, []);
    expect(await indexOnce(chain.source)).toMatchObject({ toBlock: null, deposits: 0 });
    expect(chain.calls.ranges).toHaveLength(0);
  });
});
