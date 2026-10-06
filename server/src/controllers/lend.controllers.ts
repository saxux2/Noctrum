import type { Context } from "hono";
import { authenticate } from "../auth";
import {
  currentEpoch,
  creditBalance,
  debitBalance,
  queueTransfer,
  expireOldSlots,
} from "../state";
import DepositSlotModel from "../models/deposit-slot.model";
import LendIntentModel from "../models/lend-intent.model";

export const initDepositLend = async (c: Context) => {
  try {
    const { account, token, amount } = await c.req.json();

    if (!account || !token || !amount)
      return c.json({ error: "Missing required fields" }, 400);

    await expireOldSlots();

    const slotId = crypto.randomUUID();

    await DepositSlotModel.create({
      slotId,
      userId: account.toLowerCase(),
      token: token.toLowerCase(),
      amount: BigInt(amount).toString(),
      status: "pending",
      createdAt: Date.now(),
      epochId: currentEpoch,
    });

    return c.json({ slotId, epochId: currentEpoch });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};

export const confirmDepositLend = async (c: Context) => {
  try {
    const { account, slotId, encryptedRate, timestamp, auth } =
      await c.req.json();

    if (!account || !slotId || !encryptedRate || !timestamp || !auth)
      return c.json({ error: "Missing required fields" }, 400);

    authenticate(
      "Confirm Deposit",
      { account, slotId, encryptedRate, timestamp },
      auth,
      account
    );

    const slot = await DepositSlotModel.findOne({ slotId });
    if (!slot) return c.json({ error: "Slot not found" }, 404);
    if (slot.status === "cancelled")
      return c.json({ error: "Slot expired" }, 410);
    if (slot.status === "confirmed")
      return c.json({ error: "Slot already confirmed" }, 409);
    if (slot.userId !== account.toLowerCase())
      return c.json({ error: "Not slot owner" }, 403);

    // Check TTL
    if (Date.now() - slot.createdAt > 10 * 60 * 1000) {
      slot.status = "cancelled";
      await slot.save();
      return c.json({ error: "Slot expired" }, 410);
    }

    slot.encryptedRate = encryptedRate;
    slot.status = "confirmed";

    await creditBalance(account, slot.token, BigInt(slot.amount));

    const intentId = crypto.randomUUID();

    await LendIntentModel.create({
      intentId,
      userId: account.toLowerCase(),
      token: slot.token,
      amount: BigInt(slot.amount).toString(),
      encryptedRate,
      epochId: currentEpoch,
      createdAt: Date.now(),
    });

    slot.intentId = intentId;
    await slot.save();

    return c.json({
      status: "sealed_bid_accepted",
      intentId,
      epochId: currentEpoch,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};

export const cancelLend = async (c: Context) => {
  try {
    const { account, slotId, timestamp, auth } = await c.req.json();

    if (!account || !slotId || !timestamp || !auth)
      return c.json({ error: "Missing required fields" }, 400);

    authenticate(
      "Cancel Lend",
      { account, slotId, timestamp },
      auth,
      account
    );

    const slot = await DepositSlotModel.findOne({ slotId });
    if (!slot) return c.json({ error: "Slot not found" }, 404);
    if (slot.userId !== account.toLowerCase())
      return c.json({ error: "Not slot owner" }, 403);

    const activeIntent = slot.intentId
      ? await LendIntentModel.findOne({ intentId: slot.intentId })
      : null;

    if (!slot.intentId || !activeIntent)
      return c.json({ error: "No active intent for this slot" }, 409);

    // Queue transfer for CRE to execute
    const transferId = await queueTransfer(
      account,
      slot.token,
      BigInt(slot.amount).toString(),
      "cancel-lend"
    );

    await LendIntentModel.deleteOne({ intentId: slot.intentId });
    await debitBalance(account, slot.token, BigInt(slot.amount));
    slot.status = "cancelled";
    await slot.save();

    return c.json({ status: "cancelled", transferId });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};
