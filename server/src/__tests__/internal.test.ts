import { describe, it, expect, afterEach } from "bun:test";
import { ethers } from "ethers";
import {
  get, post, setTier, seedBorrowIntent, seedLendIntent, seedProposal, seedLoan,
  referenceTicks, NUSD, NETH, wei,
} from "./helpers";
import { creditBalance, getBalance, getCreditScore, queueTransfer } from "../state";
import { getPoolAddress } from "../external-api";
import { config } from "../config";
import BorrowIntentModel from "../models/borrow-intent.model";
import MatchProposalModel from "../models/match-proposal.model";
import LoanModel from "../models/loan.model";
import LendIntentModel from "../models/lend-intent.model";
import PendingTransferModel from "../models/pending-transfer.model";

const borrower = ethers.Wallet.createRandom().address.toLowerCase();
const lenderA = ethers.Wallet.createRandom().address.toLowerCase();
const lenderB = ethers.Wallet.createRandom().address.toLowerCase();

describe("internal auth (x-api-key)", () => {
  afterEach(() => {
    config.INTERNAL_API_KEY = "";
  });

  it("empty key disables the guard", async () => {
    expect((await get("/internal/pending-transfers")).status).toBe(200);
  });

  it("wrong/missing key → 401, correct key → 200", async () => {
    config.INTERNAL_API_KEY = "secret";
    expect((await get("/internal/pending-transfers")).status).toBe(401);
    expect((await get("/internal/pending-transfers", { "x-api-key": "nope" })).status).toBe(401);
    expect((await get("/internal/pending-transfers", { "x-api-key": "secret" })).status).toBe(200);
    expect((await post("/internal/liquidate-loans", { loanIds: [] })).status).toBe(401);
  });
});

describe("GET /internal/pending-intents", () => {
  it("excludes lend intents locked by pending proposals; only pending borrow intents", async () => {
    await seedLendIntent("li-a", lenderA, wei(60));
    await seedLendIntent("li-b", lenderB, wei(40));
    await seedLendIntent("li-free", lenderB, wei(5));
    await seedProposal("p-1", borrower, referenceTicks(lenderA, lenderB));
    await seedProposal("p-old", borrower, [
      { lender: lenderB, lendIntentId: "li-free", amount: wei(5), rate: 0.1 },
    ], { status: "rejected" });
    await seedBorrowIntent("bi-pending", borrower);
    await seedBorrowIntent("bi-proposed", borrower, { status: "proposed" });

    const data: any = await (await get("/internal/pending-intents")).json();
    expect(data.lendIntents.map((l: any) => l.intentId)).toEqual(["li-free"]);
    expect(data.lendIntents[0]).toMatchObject({ userId: lenderB, token: NUSD, amount: wei(5), encryptedRate: "0xenc", epochId: 1 });
    expect(data.borrowIntents.map((b: any) => b.intentId)).toEqual(["bi-pending"]);
    expect(data.borrowIntents[0]).toMatchObject({ encryptedMaxRate: "0xenc", collateralAmount: wei(250), status: "pending" });
  });
});

describe("GET /pending-intents (public)", () => {
  it("works without x-api-key and returns token + amount only", async () => {
    config.INTERNAL_API_KEY = "secret";
    try {
      await seedLendIntent("li-pub", lenderA, wei(7));
      await seedBorrowIntent("bi-pub", borrower);
      expect((await get("/internal/pending-intents")).status).toBe(401);
      const res = await get("/pending-intents");
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.lendIntents).toEqual([{ token: NUSD, amount: wei(7) }]);
      expect(data.borrowIntents).toHaveLength(1);
      expect(Object.keys(data.borrowIntents[0]).sort()).toEqual(["amount", "token"]);
    } finally {
      config.INTERNAL_API_KEY = "";
    }
  });
});

describe("POST /internal/record-match-proposals", () => {
  it("creates lowercased proposals with expiresAt = now + 5 s and marks intent proposed", async () => {
    await seedBorrowIntent("bi-1", borrower);
    const before = Date.now();
    const res = await post("/internal/record-match-proposals", {
      proposals: [{
        proposalId: "p-1",
        borrowIntentId: "bi-1",
        borrower: borrower.toUpperCase().replace("0X", "0x"),
        token: config.TOKEN_ADDRESS,
        principal: wei(100),
        matchedTicks: referenceTicks(lenderA, lenderB).map((t) => ({ ...t, lender: ethers.getAddress(t.lender), rate: String(t.rate) })),
        effectiveBorrowerRate: "0.062",
        collateralToken: config.TOKEN_ADDRESS,
        collateralAmount: wei(250),
      }],
    });
    expect(await res.json()).toEqual({ recorded: 1 });

    const p = await MatchProposalModel.findOne({ proposalId: "p-1" }).lean();
    expect(p).toMatchObject({ borrower, token: NUSD, collateralToken: NUSD, status: "pending", effectiveBorrowerRate: 0.062 });
    expect(p!.matchedTicks[0]).toMatchObject({ lender: lenderA, rate: 0.05 });
    expect(p!.expiresAt - p!.createdAt).toBe(5000);
    expect(p!.createdAt).toBeGreaterThanOrEqual(before);
    expect((await BorrowIntentModel.findOne({ intentId: "bi-1" }))?.status).toBe("proposed");
  });

  it("generates a proposalId when absent", async () => {
    await post("/internal/record-match-proposals", {
      proposals: [{
        borrowIntentId: "bi-x", borrower, token: NUSD, principal: "1",
        matchedTicks: [], effectiveBorrowerRate: 0, collateralToken: NUSD, collateralAmount: "2",
      }],
    });
    expect((await MatchProposalModel.findOne({}))?.proposalId).toBeTruthy();
  });

  it("non-array → 400", async () => {
    expect((await post("/internal/record-match-proposals", { proposals: {} })).status).toBe(400);
  });
});

describe("POST /internal/expire-proposals", () => {
  it("auto-accepts expired proposals: loan + disburse transfer", async () => {
    await seedBorrowIntent("bi-1", borrower, { status: "proposed" });
    await seedLendIntent("li-a", lenderA, wei(60));
    await seedLendIntent("li-b", lenderB, wei(100));
    await creditBalance(lenderA, NUSD, BigInt(wei(60)));
    await creditBalance(lenderB, NUSD, BigInt(wei(100)));
    await seedProposal("p-1", borrower, referenceTicks(lenderA, lenderB), { expiresAt: Date.now() - 1 });
    await seedProposal("p-live", borrower, referenceTicks(lenderA, lenderB), { expiresAt: Date.now() + 60_000 });

    const data: any = await (await post("/internal/expire-proposals", {})).json();
    expect(data).toEqual({ autoAccepted: 1 });

    const loans = await LoanModel.find({}).lean();
    expect(loans).toHaveLength(1);
    expect(loans[0]).toMatchObject({ borrower, principal: wei(100), status: "active", requiredCollateral: wei(200), repaidAmount: "0" });
    expect((await MatchProposalModel.findOne({ proposalId: "p-1" }))?.status).toBe("accepted");
    expect((await MatchProposalModel.findOne({ proposalId: "p-live" }))?.status).toBe("pending");
    expect((await BorrowIntentModel.findOne({ intentId: "bi-1" }))?.status).toBe("matched");
    expect(await LendIntentModel.findOne({ intentId: "li-a" })).toBeNull();
    expect((await LendIntentModel.findOne({ intentId: "li-b" }))?.amount).toBe(wei(60));
    expect(await getBalance(lenderA, NUSD)).toBe(0n);
    expect(await getBalance(lenderB, NUSD)).toBe(BigInt(wei(60)));

    const transfers = await PendingTransferModel.find({}).lean();
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({ reason: "disburse", recipient: borrower, token: NUSD, amount: wei(100) });
  });

  it("nETH borrow with nUSD collateral uses ETH price for principal", async () => {
    await seedProposal("p-1", borrower, [
      { lender: lenderA, lendIntentId: "li-a", amount: wei(0.05), rate: 0.05 },
    ], { token: NETH, expiresAt: Date.now() - 1 });
    await post("/internal/expire-proposals", {});
    // 0.05 nETH * 2000 * 2.0 = 200 nUSD
    expect((await LoanModel.findOne({}))?.requiredCollateral).toBe(wei(200));
  });

  it("nothing expired → autoAccepted 0", async () => {
    expect(await (await post("/internal/expire-proposals", {})).json()).toEqual({ autoAccepted: 0 });
  });
});

describe("POST /internal/check-loans", () => {
  it("returns active loans with all fields", async () => {
    await seedLoan("l-1", borrower, referenceTicks(lenderA, lenderB));
    await seedLoan("l-2", borrower, referenceTicks(lenderA, lenderB), { status: "repaid" });
    const { loans }: any = await (await post("/internal/check-loans", {})).json();
    expect(loans).toHaveLength(1);
    expect(Object.keys(loans[0]).sort()).toEqual([
      "borrower", "collateralAmount", "collateralToken", "effectiveBorrowerRate", "loanId", "matchedTicks",
      "maturity", "principal", "repaidAmount", "requiredCollateral", "status", "token",
    ]);
    expect(loans[0].matchedTicks).toEqual(referenceTicks(lenderA, lenderB));
  });
});

describe("pending / confirm transfers", () => {
  it("lists pending transfers and confirms only pending ones", async () => {
    const t1 = await queueTransfer(lenderA.toUpperCase().replace("0X", "0x"), config.TOKEN_ADDRESS, "5", "repay-lender");
    const t2 = await queueTransfer(lenderB, NUSD, "7", "disburse");

    const { transfers }: any = await (await get("/internal/pending-transfers")).json();
    expect(transfers).toHaveLength(2);
    expect(transfers.find((t: any) => t.id === t1)).toMatchObject({
      recipient: lenderA, token: NUSD, amount: "5", reason: "repay-lender", status: "pending",
    });

    expect(await (await post("/internal/confirm-transfers", { transferIds: [t1, "unknown"] })).json()).toEqual({ confirmed: 1 });
    expect(await (await post("/internal/confirm-transfers", { transferIds: [t1] })).json()).toEqual({ confirmed: 0 });
    const after: any = await (await get("/internal/pending-transfers")).json();
    expect(after.transfers.map((t: any) => t.id)).toEqual([t2]);
  });

  it("non-array → 400", async () => {
    expect((await post("/internal/confirm-transfers", { transferIds: "x" })).status).toBe(400);
  });
});

describe("POST /internal/liquidate-loans", () => {
  it("3 transfers: 5% fee to pool, 95% split 60/40; loan defaulted", async () => {
    await seedLoan("l-1", borrower, referenceTicks(lenderA, lenderB), { collateralAmount: wei(200) });
    const res = await post("/internal/liquidate-loans", { loanIds: ["l-1", "missing"] });
    const data: any = await res.json();
    expect(data.liquidated).toBe(1);
    expect(data.transfers).toHaveLength(3);

    const ts = await PendingTransferModel.find({ transferId: { $in: data.transfers } }).lean();
    const byRecipient = Object.fromEntries(ts.map((t) => [t.recipient, t.amount]));
    expect(byRecipient).toEqual({
      [getPoolAddress().toLowerCase()]: wei(10),
      [lenderA]: wei(114),
      [lenderB]: wei(76),
    });
    expect(ts.every((t) => t.reason === "liquidate" && t.token === NUSD)).toBe(true);
    expect((await LoanModel.findOne({ loanId: "l-1" }))?.status).toBe("defaulted");
  });

  it("skips non-active loans", async () => {
    await seedLoan("l-1", borrower, referenceTicks(lenderA, lenderB), { status: "repaid" });
    expect(await (await post("/internal/liquidate-loans", { loanIds: ["l-1"] })).json()).toEqual({ liquidated: 0, transfers: [] });
  });

  it("bronze stays bronze on default; loansDefaulted +1", async () => {
    await seedLoan("l-1", borrower, referenceTicks(lenderA, lenderB));
    await post("/internal/liquidate-loans", { loanIds: ["l-1"] });
    expect(await getCreditScore(borrower)).toMatchObject({ tier: "bronze", loansDefaulted: 1 });
  });

  it("gold → silver on default", async () => {
    await setTier(borrower, "gold");
    await seedLoan("l-1", borrower, referenceTicks(lenderA, lenderB));
    await post("/internal/liquidate-loans", { loanIds: ["l-1"] });
    expect((await getCreditScore(borrower)).tier).toBe("silver");
  });

  it("non-array → 400", async () => {
    expect((await post("/internal/liquidate-loans", { loanIds: "l-1" })).status).toBe(400);
  });
});
