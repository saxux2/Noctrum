import { ethers } from "ethers";
import mongoose from "mongoose";
import { ApiError } from "./errors";
import { creditBalance, debitBalance } from "./ledger";
import ShieldedAddressModel from "./models/shielded-address.model";
import TransactionModel from "./models/transaction.model";
import { checkPrivateTransferAllowed } from "./policy";

// CPT accepts all three spellings (BACKEND §2.3).
const HIDE_SENDER_FLAGS = new Set(["hide-sender", "hideSender", "hide_sender"]);

export function parseFlags(flags: unknown) {
  if (flags === undefined || flags === null) return [] as string[];
  if (!Array.isArray(flags) || flags.some((f) => typeof f !== "string")) {
    throw new ApiError("bad_request", "flags must be an array of strings");
  }
  const unknown = flags.filter((f) => !HIDE_SENDER_FLAGS.has(f));
  if (unknown.length) throw new ApiError("bad_request", `Unknown flags: ${unknown.join(", ")}`);
  return flags as string[];
}

export function parseAmount(amount: unknown) {
  let value: bigint;
  try {
    if (typeof amount !== "string" && typeof amount !== "number") throw new Error();
    value = BigInt(amount);
  } catch {
    throw new ApiError("bad_request", "amount must be an integer wei string");
  }
  if (value <= 0n || value >= 2n ** 256n) throw new ApiError("bad_request", "amount must be > 0");
  return value;
}

export function parseToken(token: unknown) {
  if (typeof token !== "string" || !ethers.isAddress(token)) {
    throw new ApiError("bad_request", "Invalid token address");
  }
  return token.toLowerCase();
}

export function parseRecipient(recipient: unknown) {
  if (typeof recipient !== "string" || !ethers.isAddress(recipient) || BigInt(recipient) === 0n) {
    throw new ApiError("invalid_recipient", "Recipient is not a valid address");
  }
  return recipient;
}

/** Shielded address → owner; any other valid address is used as-is. */
export async function resolveRecipient(recipient: unknown) {
  const address = parseRecipient(recipient).toLowerCase();
  const shielded = await ShieldedAddressModel.findOne({ address });
  return { address, account: shielded?.owner ?? address };
}

export async function privateTransfer(params: {
  sender: string;
  recipient: unknown;
  token: string;
  amount: bigint;
  flags: string[];
}) {
  const sender = params.sender.toLowerCase();
  const { address: recipientAddress, account: recipient } = await resolveRecipient(params.recipient);
  const { token, amount } = params;

  await checkPrivateTransferAllowed(sender, recipient, token, amount);

  const id = Bun.randomUUIDv7();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (!(await debitBalance(sender, token, amount, session))) {
        throw new ApiError("insufficient_balance", "Insufficient balance for transfer");
      }
      await creditBalance(recipient, token, amount, session);
      await TransactionModel.create(
        [
          {
            id,
            type: "transfer",
            sender,
            recipient,
            recipientAddress,
            token,
            amount: amount.toString(),
            isSenderHidden: params.flags.some((f) => HIDE_SENDER_FLAGS.has(f)),
            createdAt: Date.now(),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return id;
}

export async function generateShieldedAddress(owner: string) {
  for (let attempt = 0; ; attempt++) {
    const address = ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
    try {
      await ShieldedAddressModel.create({
        address: address.toLowerCase(),
        owner: owner.toLowerCase(),
        createdAt: Date.now(),
      });
      return address;
    } catch (err) {
      // 2^-160 collision: retry with a fresh address.
      if ((err as { code?: number }).code !== 11000 || attempt >= 2) throw err;
    }
  }
}
