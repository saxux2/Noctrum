import { describe, it, expect } from "bun:test";
import { ethers } from "ethers";
import { post, sign, setTier, seedLoan, referenceTicks, NUSD, wei } from "./helpers";
import { getBalance, getCreditScore } from "../state";
import LoanModel from "../models/loan.model";
import PendingTransferModel from "../models/pending-transfer.model";

const borrower = ethers.Wallet.createRandom();
const stranger = ethers.Wallet.createRandom();
const lenderA = ethers.Wallet.createRandom().address.toLowerCase();
const lenderB = ethers.Wallet.createRandom().address.toLowerCase();
const TOTAL_DUE = "106200000000000000000"; // 63 + 43.2

const repay = async (loanId: string, amount: string, w = borrower) =>
  post("/repay", await sign(w, "Repay Loan", { loanId, amount }));

describe("POST /repay", () => {
  it("math snapshot: A 60 @ 5% → 63, B 40 @ 8% → 43.2 (wei, floor)", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB));
    const res = await repay("l-1", TOTAL_DUE);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data).toMatchObject({ status: "repaid", loanId: "l-1", totalPaid: TOTAL_DUE });

    const payouts = await PendingTransferModel.find({ reason: "repay-lender" }).lean();
    const byLender = Object.fromEntries(payouts.map((t) => [t.recipient, t.amount]));
    expect(byLender).toEqual({ [lenderA]: "63000000000000000000", [lenderB]: "43200000000000000000" });
    expect(await getBalance(lenderA, NUSD)).toBe(63000000000000000000n);
    expect(await getBalance(lenderB, NUSD)).toBe(43200000000000000000n);

    const back = await PendingTransferModel.findOne({ transferId: data.transferId });
    expect(back?.reason).toBe("return-collateral-repay");
    expect(back?.amount).toBe(wei(250));
    expect(back?.recipient).toBe(borrower.address.toLowerCase());

    const loan = await LoanModel.findOne({ loanId: "l-1" });
    expect(loan?.status).toBe("repaid");
    expect(loan?.repaidAmount).toBe(TOTAL_DUE);
  });

  it("interest floors per tick", async () => {
    await seedLoan("l-1", borrower.address, [
      { lender: lenderA, lendIntentId: "li-a", amount: "7", rate: 0.5 }, // 7 + floor(3.5) = 10
    ]);
    const payout = async () => (await PendingTransferModel.findOne({ reason: "repay-lender" }))?.amount;
    expect((await repay("l-1", "9")).status).toBe(400);
    expect((await repay("l-1", "10")).status).toBe(200);
    expect(await payout()).toBe("10");
  });

  it("overpayment is accepted and recorded as repaidAmount", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB));
    expect((await repay("l-1", wei(200))).status).toBe(200);
    expect((await LoanModel.findOne({ loanId: "l-1" }))?.repaidAmount).toBe(wei(200));
  });

  it("insufficient → 400 with required/provided", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB));
    const res = await repay("l-1", wei(100));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Insufficient repayment", required: TOTAL_DUE, provided: wei(100) });
  });

  it("unknown → 404", async () => {
    expect((await repay("nope", TOTAL_DUE)).status).toBe(404);
  });

  it("not owner → 403", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB));
    expect((await repay("l-1", TOTAL_DUE, stranger)).status).toBe(403);
  });

  it("not active → 409", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB), { status: "defaulted" });
    expect((await repay("l-1", TOTAL_DUE)).status).toBe(409);
  });

  it("missing fields → 400", async () => {
    expect((await post("/repay", { account: borrower.address })).status).toBe(400);
  });
});

describe("credit tier on repay", () => {
  it("bronze → silver, loansRepaid +1", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB));
    await repay("l-1", TOTAL_DUE);
    expect(await getCreditScore(borrower.address)).toMatchObject({ tier: "silver", loansRepaid: 1 });
  });

  it("platinum stays platinum (cap)", async () => {
    await setTier(borrower.address, "platinum", 5);
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB));
    await repay("l-1", TOTAL_DUE);
    expect(await getCreditScore(borrower.address)).toMatchObject({ tier: "platinum", loansRepaid: 6 });
  });
});
