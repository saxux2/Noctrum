import { ethers } from "ethers";
import mongoose from "mongoose";
import { EIP712_DOMAIN } from "./auth";
import { config } from "./config";
import { ApiError } from "./errors";
import { creditBalance, debitBalance } from "./ledger";
import IndexerStateModel from "./models/indexer-state.model";
import TransactionModel from "./models/transaction.model";
import { checkWithdrawAllowed } from "./policy";

// Same struct as CPT and NoctrumVault.WITHDRAW_TICKET_TYPEHASH (RISKS: CPT ticket struct).
export const WITHDRAW_TICKET_TYPES = {
  WithdrawTicket: [
    { name: "withdrawer", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "nonce", type: "uint128" },
    { name: "deadline", type: "uint64" },
  ],
};

export type TicketFields = {
  withdrawer: string;
  token: string;
  amount: bigint;
  nonce: bigint;
  deadline: number;
};

/** EIP-712 digest of a ticket; the vault emits it as `Withdraw.withdrawTicketHash`. */
export function hashWithdrawTicket(fields: TicketFields, domain: ethers.TypedDataDomain = EIP712_DOMAIN) {
  return ethers.TypedDataEncoder.hash(domain, WITHDRAW_TICKET_TYPES, fields);
}

/** ticket = nonce (16) ‖ deadline (8) ‖ r (32) ‖ s (32) ‖ v (1) = 89 bytes, as NoctrumVault.TICKET_LENGTH. */
export async function signWithdrawTicket(
  signer: ethers.Wallet,
  fields: TicketFields,
  domain: ethers.TypedDataDomain = EIP712_DOMAIN,
) {
  const signature = await signer.signTypedData(domain, WITHDRAW_TICKET_TYPES, fields);
  const ticket = ethers.concat([
    ethers.toBeHex(fields.nonce, 16),
    ethers.toBeHex(fields.deadline, 8),
    signature,
  ]);
  return { ticket, ticketHash: hashWithdrawTicket(fields, domain) };
}

let ticketSigner: ethers.Wallet | undefined;

export function getTicketSigner() {
  if (!config.TICKET_SIGNER_PRIVATE_KEY) throw new Error("TICKET_SIGNER_PRIVATE_KEY is not set");
  ticketSigner ??= new ethers.Wallet(config.TICKET_SIGNER_PRIVATE_KEY);
  return ticketSigner;
}

/** Startup check: tickets only redeem if our key is the vault's `ticketSigner`. */
export async function checkTicketSigner() {
  if (!config.TICKET_SIGNER_PRIVATE_KEY) {
    console.warn("[withdraw] TICKET_SIGNER_PRIVATE_KEY is not set; /withdraw will fail");
    return;
  }
  const ours = getTicketSigner().address;
  try {
    const provider = new ethers.JsonRpcProvider(config.RPC_URL, config.CHAIN_ID, { staticNetwork: true });
    const vault = new ethers.Contract(config.VAULT_ADDRESS, ["function ticketSigner() view returns (address)"], provider);
    const onChain: string = await vault.getFunction("ticketSigner")();
    if (onChain.toLowerCase() !== ours.toLowerCase()) {
      console.error(`[withdraw] ALERT: ticket signer ${ours} is not the vault's ticketSigner ${onChain}; tickets will not redeem`);
    }
  } catch (err) {
    console.warn("[withdraw] could not read vault.ticketSigner:", err instanceof Error ? err.message : err);
  }
}

/** Debit the balance and issue a ticket redeemable once on NoctrumVault until `deadline`. */
export async function requestWithdrawal(params: { account: string; token: string; amount: bigint }) {
  const account = params.account.toLowerCase();
  const { token, amount } = params;
  const signer = getTicketSigner();

  await checkWithdrawAllowed(account, token, amount);

  const nonce = BigInt(ethers.hexlify(ethers.randomBytes(16)));
  const deadline = Math.floor(Date.now() / 1000) + config.TICKET_TTL_SECONDS;
  const { ticket, ticketHash } = await signWithdrawTicket(signer, {
    withdrawer: account,
    token,
    amount,
    nonce,
    deadline,
  });

  const id = Bun.randomUUIDv7();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (!(await debitBalance(account, token, amount, session))) {
        throw new ApiError("insufficient_balance", "Insufficient balance for withdrawal");
      }
      await TransactionModel.create(
        [
          {
            id,
            type: "withdrawal",
            account,
            token,
            amount: amount.toString(),
            status: "pending",
            nonce: nonce.toString(),
            deadline,
            ticketHash: ticketHash.toLowerCase(),
            createdAt: Date.now(),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return {
    id,
    account: ethers.getAddress(account),
    token: ethers.getAddress(token),
    amount: amount.toString(),
    deadline,
    ticket,
  };
}

/**
 * Refund pending tickets that can no longer be redeemed: the indexer has reached a
 * finalized block later than the deadline, so any redemption would already be indexed
 * (the vault rejects `block.timestamp > deadline`). Each refund is its own transaction
 * and only applies to a ticket still pending, so a racing completion can never double-pay.
 */
export async function sweepExpiredTickets() {
  const state = await IndexerStateModel.findOne({ key: "vault" });
  const indexedUntil = state?.lastProcessedTimestamp;
  if (indexedUntil === undefined || indexedUntil === null) return 0;

  const expired = await TransactionModel.find({
    type: "withdrawal",
    status: "pending",
    deadline: { $lt: indexedUntil },
  }).lean();

  let refunded = 0;
  for (const tx of expired) {
    let done = false;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        done = false;
        const res = await TransactionModel.updateOne(
          { id: tx.id, status: "pending" },
          { $set: { status: "refunded" } },
          { session },
        );
        if (res.modifiedCount !== 1) return;
        await creditBalance(tx.account!, tx.token, BigInt(tx.amount), session);
        done = true;
      });
    } finally {
      await session.endSession();
    }
    if (done) refunded++;
  }
  if (refunded) console.log(`[sweeper] refunded ${refunded} expired withdrawal ticket(s)`);
  return refunded;
}
