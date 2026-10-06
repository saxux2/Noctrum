import { ethers } from "ethers";
import mongoose from "mongoose";
import { config } from "./config";
import { creditBalance } from "./ledger";
import IndexerStateModel from "./models/indexer-state.model";
import TransactionModel from "./models/transaction.model";
import { sweepExpiredTickets } from "./withdrawals";

export const VAULT_EVENTS = new ethers.Interface([
  "event Deposit(address indexed user, address indexed token, uint256 amount)",
  "event Withdraw(address indexed user, address indexed token, uint256 amount, bytes32 indexed withdrawTicketHash)",
]);
export const DEPOSIT_TOPIC = VAULT_EVENTS.getEvent("Deposit")!.topicHash;
export const WITHDRAW_TOPIC = VAULT_EVENTS.getEvent("Withdraw")!.topicHash;

const STATE_KEY = "vault";

// The subset of ethers.Provider the indexer needs (lets tests inject a fake).
export interface LogSource {
  getBlock(tag: "finalized"): Promise<{ number: number; timestamp: number } | null>;
  getLogs(filter: ethers.Filter): Promise<ethers.Log[]>;
}

export async function getLastProcessedBlock() {
  const state = await IndexerStateModel.findOne({ key: STATE_KEY });
  return state?.lastProcessedBlock ?? config.START_BLOCK - 1;
}

async function applyDeposit(log: ethers.Log, session: mongoose.ClientSession) {
  const eventKey = `${log.transactionHash.toLowerCase()}:${log.index}`;
  if (await TransactionModel.exists({ eventKey }).session(session)) return false;

  const { args } = VAULT_EVENTS.parseLog(log)!;
  const user = (args.user as string).toLowerCase();
  const token = (args.token as string).toLowerCase();
  const amount = args.amount as bigint;

  await TransactionModel.create(
    [
      {
        id: Bun.randomUUIDv7(),
        type: "deposit",
        account: user,
        token,
        amount: amount.toString(),
        txHash: log.transactionHash.toLowerCase(),
        eventKey,
        blockNumber: log.blockNumber,
        createdAt: Date.now(),
      },
    ],
    { session },
  );
  await creditBalance(user, token, amount, session);
  return true;
}

/** Completes the pending withdrawal whose ticket digest the vault emitted. */
async function applyWithdraw(log: ethers.Log, session: mongoose.ClientSession) {
  const { args } = VAULT_EVENTS.parseLog(log)!;
  const ticketHash = (args.withdrawTicketHash as string).toLowerCase();
  const txHash = log.transactionHash.toLowerCase();

  const tx = await TransactionModel.findOne({ type: "withdrawal", ticketHash }).session(session);
  if (!tx) {
    console.warn(`[indexer] Withdraw ${txHash} redeems unknown ticket ${ticketHash}`);
    return false;
  }
  if (tx.status === "completed") return false;
  if (tx.status === "refunded") {
    // Must not happen (the sweeper waits for the indexer to pass the deadline); the invariant job will flag it.
    console.error(`[indexer] ALERT: refunded ticket ${ticketHash} (withdrawal ${tx.id}) was redeemed in ${txHash}`);
  }
  tx.status = "completed";
  tx.txHash = txHash;
  tx.eventKey = `${txHash}:${log.index}`;
  tx.blockNumber = log.blockNumber;
  await tx.save({ session });
  return true;
}

/**
 * Index one page (≤ LOG_RANGE blocks) up to the finalized head.
 * Credits and the cursor move in one Mongo transaction, so a page is applied
 * exactly once; a replayed log is skipped by its (txHash, logIndex) key.
 */
export async function indexOnce(source: LogSource) {
  const head = await source.getBlock("finalized");
  if (!head) return { fromBlock: null, toBlock: null, deposits: 0, withdrawals: 0 };

  const last = await getLastProcessedBlock();
  const fromBlock = last + 1;
  if (fromBlock > head.number) {
    await IndexerStateModel.updateOne(
      { key: STATE_KEY, lastProcessedBlock: head.number },
      { $max: { lastProcessedTimestamp: head.timestamp } },
    );
    return { fromBlock: null, toBlock: null, deposits: 0, withdrawals: 0 };
  }
  const toBlock = Math.min(fromBlock + config.LOG_RANGE - 1, head.number);

  const logs = await source.getLogs({
    address: config.VAULT_ADDRESS,
    topics: [[DEPOSIT_TOPIC, WITHDRAW_TOPIC]],
    fromBlock,
    toBlock,
  });
  logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

  const caughtUp = toBlock === head.number;
  let deposits = 0;
  let withdrawals = 0;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      deposits = 0;
      withdrawals = 0;
      for (const log of logs) {
        if (log.removed) continue;
        if (log.topics[0] === WITHDRAW_TOPIC) {
          if (await applyWithdraw(log, session)) withdrawals++;
        } else if (await applyDeposit(log, session)) {
          deposits++;
        }
      }
      await IndexerStateModel.updateOne(
        { key: STATE_KEY },
        {
          $set: { lastProcessedBlock: toBlock },
          // Only the head's timestamp is known without another RPC call.
          ...(caughtUp ? { $max: { lastProcessedTimestamp: head.timestamp } } : {}),
        },
        { upsert: true, session },
      );
    });
  } finally {
    await session.endSession();
  }
  return { fromBlock, toBlock, deposits, withdrawals, caughtUp };
}

export function startIndexer(source: LogSource = new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, { staticNetwork: true })) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    let delay = config.POLL_MS;
    try {
      const r = await indexOnce(source);
      if (r.deposits || r.withdrawals) {
        console.log(
          `[indexer] blocks ${r.fromBlock}-${r.toBlock}: ${r.deposits} deposit(s), ${r.withdrawals} withdrawal(s)`,
        );
      }
      // Behind the head: fetch the next page right away.
      if (r.toBlock !== null && !r.caughtUp) delay = 0;
      // Same loop as the indexer, so a refund never races a page being applied.
      await sweepExpiredTickets();
    } catch (err) {
      console.error("[indexer]", err instanceof Error ? err.message : err);
    }
    if (!stopped) timer = setTimeout(tick, delay);
  };
  tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
