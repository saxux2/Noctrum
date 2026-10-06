// D-17: rewrite of Ghost's stale lend.test.ts against Mongo, same 9 cases plus 404/403 paths.
import { describe, it, expect } from "bun:test";
import { ethers } from "ethers";
import { post, sign, NUSD, wei } from "./helpers";
import { getBalance } from "../state";
import DepositSlotModel from "../models/deposit-slot.model";
import LendIntentModel from "../models/lend-intent.model";
import PendingTransferModel from "../models/pending-transfer.model";

const wallet = ethers.Wallet.createRandom();
const account = wallet.address;
const amount = wei(10);

async function initSlot(): Promise<string> {
  const res = await post("/deposit-lend/init", { account, token: NUSD, amount });
  return ((await res.json()) as any).slotId;
}

async function confirm(slotId: string, w = wallet) {
  return post("/deposit-lend/confirm", await sign(w, "Confirm Deposit", { slotId, encryptedRate: "0xenc" }));
}

describe("POST /deposit-lend/init", () => {
  it("valid → 200 + pending slot", async () => {
    const res = await post("/deposit-lend/init", { account, token: NUSD, amount });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.slotId).toBeDefined();
    expect(data.epochId).toBe(1);
    const slot = await DepositSlotModel.findOne({ slotId: data.slotId });
    expect(slot?.status).toBe("pending");
    expect(slot?.userId).toBe(account.toLowerCase());
    expect(slot?.amount).toBe(amount);
  });

  it("missing fields → 400", async () => {
    const res = await post("/deposit-lend/init", { account });
    expect(res.status).toBe(400);
  });

  it("expires pending slots older than 10 min first", async () => {
    const old = await initSlot();
    await DepositSlotModel.updateOne({ slotId: old }, { createdAt: Date.now() - 11 * 60 * 1000 });
    await initSlot();
    expect((await DepositSlotModel.findOne({ slotId: old }))?.status).toBe("cancelled");
  });
});

describe("POST /deposit-lend/confirm", () => {
  it("valid → 200, balance credited, intent stored", async () => {
    const slotId = await initSlot();
    const res = await confirm(slotId);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("sealed_bid_accepted");
    expect(data.epochId).toBe(1);

    expect(await getBalance(account, NUSD)).toBe(BigInt(amount));
    const intent = await LendIntentModel.findOne({ intentId: data.intentId });
    expect(intent?.amount).toBe(amount);
    expect(intent?.encryptedRate).toBe("0xenc");
    const slot = await DepositSlotModel.findOne({ slotId });
    expect(slot?.status).toBe("confirmed");
    expect(slot?.intentId).toBe(data.intentId);
  });

  it("bad sig → 401", async () => {
    const slotId = await initSlot();
    const body = await sign(wallet, "Confirm Deposit", { slotId, encryptedRate: "0xenc" });
    body.auth = "0x" + "00".repeat(65);
    const res = await post("/deposit-lend/confirm", body);
    expect(res.status).toBe(401);
  });

  it("missing fields → 400", async () => {
    const res = await post("/deposit-lend/confirm", { account, slotId: "x" });
    expect(res.status).toBe(400);
  });

  it("unknown slot → 404", async () => {
    const res = await confirm("does-not-exist");
    expect(res.status).toBe(404);
  });

  it("expired slot (TTL) → 410 and slot cancelled", async () => {
    const slotId = await initSlot();
    await DepositSlotModel.updateOne({ slotId }, { createdAt: Date.now() - 11 * 60 * 1000 });
    const res = await confirm(slotId);
    expect(res.status).toBe(410);
    expect((await DepositSlotModel.findOne({ slotId }))?.status).toBe("cancelled");
  });

  it("double confirm → 409", async () => {
    const slotId = await initSlot();
    await confirm(slotId);
    const res = await confirm(slotId);
    expect(res.status).toBe(409);
  });

  it("not slot owner → 403", async () => {
    const slotId = await initSlot();
    const res = await confirm(slotId, ethers.Wallet.createRandom());
    expect(res.status).toBe(403);
  });
});

describe("POST /cancel-lend", () => {
  it("valid → 200, queues cancel-lend transfer, removes intent, debits balance", async () => {
    const slotId = await initSlot();
    const { intentId }: any = await (await confirm(slotId)).json();

    const res = await post("/cancel-lend", await sign(wallet, "Cancel Lend", { slotId }));
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("cancelled");

    const t = await PendingTransferModel.findOne({ transferId: data.transferId });
    expect(t?.reason).toBe("cancel-lend");
    expect(t?.recipient).toBe(account.toLowerCase());
    expect(t?.token).toBe(NUSD);
    expect(t?.amount).toBe(amount);
    expect(t?.status).toBe("pending");
    expect(await LendIntentModel.findOne({ intentId })).toBeNull();
    expect(await getBalance(account, NUSD)).toBe(0n);
    expect((await DepositSlotModel.findOne({ slotId }))?.status).toBe("cancelled");
  });

  it("not owner → 403", async () => {
    const slotId = await initSlot();
    await confirm(slotId);
    const res = await post("/cancel-lend", await sign(ethers.Wallet.createRandom(), "Cancel Lend", { slotId }));
    expect(res.status).toBe(403);
  });

  it("no active intent → 409", async () => {
    const slotId = await initSlot();
    const res = await post("/cancel-lend", await sign(wallet, "Cancel Lend", { slotId }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("No active intent for this slot");
  });

  it("unknown slot → 404", async () => {
    const res = await post("/cancel-lend", await sign(wallet, "Cancel Lend", { slotId: "nope" }));
    expect(res.status).toBe(404);
  });
});
