// Every credit to the pool's books must be backed by a real vault transfer into the pool.
import { describe, it, expect } from "bun:test";
import { ethers } from "ethers";
import { post, sign, seedLoan, referenceTicks, NUSD, NETH, wei } from "./helpers";
import { poolReceives, vaultState } from "./mock-vault";
import { getBalance } from "../state";
import BorrowIntentModel from "../models/borrow-intent.model";
import ClaimedDepositModel from "../models/claimed-deposit.model";
import LoanModel from "../models/loan.model";
import PendingTransferModel from "../models/pending-transfer.model";

const user = ethers.Wallet.createRandom();
const other = ethers.Wallet.createRandom();
const lenderA = ethers.Wallet.createRandom().address.toLowerCase();
const lenderB = ethers.Wallet.createRandom().address.toLowerCase();

const borrowFields = {
  token: NUSD,
  amount: wei(100),
  collateralToken: NUSD,
  collateralAmount: wei(200),
  encryptedMaxRate: "0xenc",
};
const borrow = async (w = user) => post("/borrow-intent", await sign(w, "Submit Borrow", borrowFields));

async function lend(amount = wei(10), w = user) {
  const init = await post("/deposit-lend/init", { account: w.address, token: NUSD, amount });
  const { slotId } = (await init.json()) as any;
  return post("/deposit-lend/confirm", await sign(w, "Confirm Deposit", { slotId, encryptedRate: "0xenc" }));
}

describe("borrow-intent requires a collateral transfer", () => {
  it("no transfer → 402, no intent", async () => {
    const res = await borrow();
    expect(res.status).toBe(402);
    expect(await BorrowIntentModel.countDocuments()).toBe(0);
  });

  it("one transfer backs only one intent", async () => {
    const id = poolReceives(user.address, NUSD, wei(200));
    expect((await borrow()).status).toBe(200);
    expect((await borrow()).status).toBe(402);
    expect((await ClaimedDepositModel.findOne({ transferId: id }))?.purpose).toBe("borrow-collateral");
  });

  it("transfer from another account does not count", async () => {
    poolReceives(other.address, NUSD, wei(200));
    expect((await borrow()).status).toBe(402);
  });

  it("wrong token or wrong amount does not count", async () => {
    poolReceives(user.address, NETH, wei(200));
    poolReceives(user.address, NUSD, wei(199));
    expect((await borrow()).status).toBe(402);
  });

  it("hidden-sender transfer does not count", async () => {
    poolReceives(user.address, NUSD, wei(200), { sender: undefined, is_sender_hidden: true });
    expect((await borrow()).status).toBe(402);
  });

  it("outgoing pool transfer does not count", async () => {
    poolReceives(user.address, NUSD, wei(200), { is_incoming: false });
    expect((await borrow()).status).toBe(402);
  });

  it("failed tier check does not use up the transfer", async () => {
    poolReceives(user.address, NUSD, wei(150));
    const low = await post("/borrow-intent", await sign(user, "Submit Borrow", { ...borrowFields, collateralAmount: wei(150) }));
    expect(low.status).toBe(400);
    expect(await ClaimedDepositModel.countDocuments()).toBe(0);
    expect(vaultState.calls).toBe(0);
  });

  it("cancel after a fake intent can no longer drain the pool", async () => {
    await borrow(); // rejected, so there is nothing to cancel
    expect(await PendingTransferModel.countDocuments({ reason: "cancel-borrow" })).toBe(0);
  });
});

describe("deposit-lend/confirm requires a transfer", () => {
  it("no transfer → 402, no balance credited, slot stays pending", async () => {
    const res = await lend();
    expect(res.status).toBe(402);
    expect(await getBalance(user.address, NUSD)).toBe(0n);
  });

  it("matching transfer → 200 and balance credited once", async () => {
    poolReceives(user.address, NUSD, wei(10));
    expect((await lend()).status).toBe(200);
    expect((await lend()).status).toBe(402);
    expect(await getBalance(user.address, NUSD)).toBe(BigInt(wei(10)));
  });
});

describe("repay requires a transfer", () => {
  const TOTAL_DUE = "106200000000000000000";
  const repay = async () => post("/repay", await sign(user, "Repay Loan", { loanId: "l-1", amount: TOTAL_DUE }));

  it("no transfer → 402, no lender payouts, loan stays active", async () => {
    await seedLoan("l-1", user.address, referenceTicks(lenderA, lenderB));
    expect((await repay()).status).toBe(402);
    expect(await PendingTransferModel.countDocuments()).toBe(0);
    expect((await LoanModel.findOne({ loanId: "l-1" }))?.status).toBe("active");
  });

  it("matching transfer → 200", async () => {
    await seedLoan("l-1", user.address, referenceTicks(lenderA, lenderB));
    poolReceives(user.address, NUSD, TOTAL_DUE);
    expect((await repay()).status).toBe(200);
  });
});
