import { describe, it, expect } from "bun:test";
import {
  getCollateralMultiplier, creditBalance, debitBalance, getBalance, getCreditScore,
  upgradeTier, downgradeTier, queueTransfer, expireOldSlots, currentEpoch,
} from "../state";
import { setTier } from "./helpers";
import DepositSlotModel from "../models/deposit-slot.model";
import PendingTransferModel from "../models/pending-transfer.model";

const USER = "0xAbCdEf0000000000000000000000000000000001";
const TOKEN = "0xToKeN0000000000000000000000000000000002";

describe("state helpers", () => {
  it("epoch is 1", () => {
    expect(currentEpoch).toBe(1);
  });

  it("collateral multipliers", () => {
    expect(getCollateralMultiplier("platinum")).toBe(1.2);
    expect(getCollateralMultiplier("gold")).toBe(1.5);
    expect(getCollateralMultiplier("silver")).toBe(1.8);
    expect(getCollateralMultiplier("bronze")).toBe(2.0);
  });

  it("credit/debit/get balance, case-insensitive; debit fails without throwing", async () => {
    expect(await getBalance(USER, TOKEN)).toBe(0n);
    expect(await debitBalance(USER, TOKEN, 1n)).toBe(false);
    await creditBalance(USER, TOKEN, 10n);
    await creditBalance(USER.toLowerCase(), TOKEN.toUpperCase().replace("0X", "0x"), 5n);
    expect(await getBalance(USER, TOKEN)).toBe(15n);
    expect(await debitBalance(USER, TOKEN, 16n)).toBe(false);
    expect(await debitBalance(USER, TOKEN, 15n)).toBe(true);
    expect(await getBalance(USER, TOKEN)).toBe(0n);
  });

  it("queueTransfer lowercases and stores pending", async () => {
    const id = await queueTransfer(USER, TOKEN, "42", "disburse");
    const t = await PendingTransferModel.findOne({ transferId: id }).lean();
    expect(t).toMatchObject({ recipient: USER.toLowerCase(), token: TOKEN.toLowerCase(), amount: "42", reason: "disburse", status: "pending" });
  });

  it("tiers: lazy bronze, upgrade caps at platinum, downgrade caps at bronze", async () => {
    expect(await getCreditScore(USER)).toEqual({ address: USER.toLowerCase(), tier: "bronze", loansRepaid: 0, loansDefaulted: 0 });
    await downgradeTier(USER);
    expect((await getCreditScore(USER)).tier).toBe("bronze");
    for (const expected of ["silver", "gold", "platinum", "platinum"]) {
      await upgradeTier(USER);
      expect((await getCreditScore(USER)).tier).toBe(expected as any);
    }
    await setTier(USER, "silver");
    await downgradeTier(USER);
    expect((await getCreditScore(USER)).tier).toBe("bronze");
  });

  it("expireOldSlots cancels only pending slots older than 10 min", async () => {
    const base = { userId: "u", token: "t", amount: "1", epochId: 1 };
    const old = Date.now() - 10 * 60 * 1000 - 1000;
    await DepositSlotModel.create([
      { ...base, slotId: "old-pending", status: "pending", createdAt: old },
      { ...base, slotId: "old-confirmed", status: "confirmed", createdAt: old },
      { ...base, slotId: "fresh", status: "pending", createdAt: Date.now() },
    ]);
    expect(await expireOldSlots()).toBe(1);
    const status = async (slotId: string) => (await DepositSlotModel.findOne({ slotId }))?.status;
    expect(await status("old-pending")).toBe("cancelled");
    expect(await status("old-confirmed")).toBe("confirmed");
    expect(await status("fresh")).toBe("pending");
  });
});
