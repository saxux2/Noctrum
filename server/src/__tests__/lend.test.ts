import { describe, it, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { ethers } from "ethers";
import { state } from "../state";
import { EIP712_DOMAIN, MESSAGE_TYPES } from "../auth";
import {
  initDepositLend,
  confirmDepositLend,
  cancelLend,
} from "../controllers/lend.controllers";
import { config } from "../config";

const app = new Hono();
app.post("/deposit-lend/init", initDepositLend);
app.post("/deposit-lend/confirm", confirmDepositLend);
app.post("/cancel-lend", cancelLend);

const wallet = ethers.Wallet.createRandom();
const account = wallet.address;
const token = config.TOKEN_ADDRESS;
const amount = "10000000000000000000"; // 10 tokens

function ts() {
  return Math.floor(Date.now() / 1000);
}

async function signConfirm(slotId: string, encryptedRate: string) {
  const timestamp = ts();
  const message = { account, slotId, encryptedRate, timestamp };
  const types = { "Confirm Deposit": [...MESSAGE_TYPES["Confirm Deposit"]] };
  const auth = await wallet.signTypedData(EIP712_DOMAIN, types, message);
  return { account, slotId, encryptedRate, timestamp, auth };
}

async function signCancel(slotId: string) {
  const timestamp = ts();
  const message = { account, slotId, timestamp };
  const types = { "Cancel Lend": [...MESSAGE_TYPES["Cancel Lend"]] };
  const auth = await wallet.signTypedData(EIP712_DOMAIN, types, message);
  return { account, slotId, timestamp, auth };
}

function post(path: string, body: any) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function initAndGetSlotId(): Promise<string> {
  const res = await post("/deposit-lend/init", { account, token, amount });
  const data: any = await res.json();
  return data.slotId;
}

beforeEach(() => {
  state.depositSlots.clear();
  state.activeBuffer.clear();
  state.balances.clear();
  state.currentEpoch = 1;
});

describe("initDepositLend", () => {
  it("valid → 200 + slot created", async () => {
    const res = await post("/deposit-lend/init", { account, token, amount });
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.slotId).toBeDefined();
    expect(state.depositSlots.size).toBe(1);
  });

  it("missing fields → 400", async () => {
    const res = await post("/deposit-lend/init", { account });
    expect(res.status).toBe(400);
  });
});

describe("confirmDepositLend", () => {
  it("valid → balance credited + intent stored", async () => {
    const slotId = await initAndGetSlotId();

    const encryptedRate = "0xencrypted_blob_here";
    const confirmBody = await signConfirm(slotId, encryptedRate);
    const res = await post("/deposit-lend/confirm", confirmBody);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("sealed_bid_accepted");

    const bal = state.getBalance(account, token);
    expect(bal).toBe(BigInt(amount));
    expect(state.activeBuffer.size).toBe(1);
  });

  it("bad sig → 401", async () => {
    const slotId = await initAndGetSlotId();
    const body = await signConfirm(slotId, "0xenc");
    body.auth = "0x" + "00".repeat(65);
    const res = await post("/deposit-lend/confirm", body);
    expect(res.status).toBe(401);
  });

  it("expired slot → 410", async () => {
    const slotId = await initAndGetSlotId();

    const slot = state.depositSlots.get(slotId)!;
    slot.createdAt = Date.now() - 11 * 60 * 1000;

    const encryptedRate = "0xencrypted";
    const body = await signConfirm(slotId, encryptedRate);
    const res = await post("/deposit-lend/confirm", body);
    expect(res.status).toBe(410);
  });

  it("double confirm → 409", async () => {
    const slotId = await initAndGetSlotId();

    const encryptedRate = "0xencrypted";
    const body1 = await signConfirm(slotId, encryptedRate);
    await post("/deposit-lend/confirm", body1);

    const body2 = await signConfirm(slotId, encryptedRate);
    const res = await post("/deposit-lend/confirm", body2);
    expect(res.status).toBe(409);
  });
});

describe("cancelLend", () => {
  it("valid → queues transfer", async () => {
    const slotId = await initAndGetSlotId();
    const confirmBody = await signConfirm(slotId, "0xenc");
    await post("/deposit-lend/confirm", confirmBody);

    expect(state.activeBuffer.size).toBe(1);

    const cancelBody = await signCancel(slotId);
    const res = await post("/cancel-lend", cancelBody);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("cancelled");
    expect(data.transferId).toBeDefined();
    expect(state.activeBuffer.size).toBe(0);
  });

  it("not owner → 403", async () => {
    const slotId = await initAndGetSlotId();
    const confirmBody = await signConfirm(slotId, "0xenc");
    await post("/deposit-lend/confirm", confirmBody);

    const other = ethers.Wallet.createRandom();
    const timestamp = ts();
    const message = { account: other.address, slotId, timestamp };
    const types = { "Cancel Lend": [...MESSAGE_TYPES["Cancel Lend"]] };
    const auth = await other.signTypedData(EIP712_DOMAIN, types, message);
    const res = await post("/cancel-lend", {
      account: other.address,
      slotId,
      timestamp,
      auth,
    });
    expect(res.status).toBe(403);
  });

  it("not in activeBuffer → 409", async () => {
    const slotId = await initAndGetSlotId();

    const cancelBody = await signCancel(slotId);
    const res = await post("/cancel-lend", cancelBody);
    expect(res.status).toBe(409);
  });
});
