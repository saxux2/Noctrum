import { describe, it, expect } from "bun:test";
import { ethers } from "ethers";
import { get, setTier, seedBorrowIntent, seedLendIntent, seedProposal, seedLoan, referenceTicks, NUSD, NETH, wei } from "./helpers";
import { priceState } from "./mock-price";
import { queueTransfer } from "../state";
import DepositSlotModel from "../models/deposit-slot.model";
import PendingTransferModel from "../models/pending-transfer.model";

const borrower = ethers.Wallet.createRandom().address.toLowerCase();
const lenderA = ethers.Wallet.createRandom().address.toLowerCase();
const lenderB = ethers.Wallet.createRandom().address.toLowerCase();

const quote = (q: Record<string, string>) =>
  get(`/collateral-quote?${new URLSearchParams({ account: borrower, ...q })}`);

describe("GET /collateral-quote", () => {
  const cases: Array<[string, number, string, string]> = [
    // tier, multiplier, nUSD collateral for 100 nUSD, nETH collateral for 100 nUSD @ 2000
    ["bronze", 2.0, wei(200), wei(0.1)],
    ["silver", 1.8, wei(180), wei(0.09)],
    ["gold", 1.5, wei(150), wei(0.075)],
    ["platinum", 1.2, wei(120), wei(0.06)],
  ];

  for (const [tier, multiplier, usdCol, ethCol] of cases) {
    it(`${tier} → ${multiplier}x`, async () => {
      await setTier(borrower, tier as any);
      const usd: any = await (await quote({ token: NUSD, amount: wei(100), collateralToken: NUSD })).json();
      expect(usd).toEqual({ tier, multiplier, ethPrice: null, requiredCollateral: usdCol, requiredValueUsd: 100 * multiplier });
      const eth: any = await (await quote({ token: NUSD, amount: wei(100), collateralToken: NETH })).json();
      expect(eth).toMatchObject({ ethPrice: 2000, requiredCollateral: ethCol });
    });
  }

  it("ETH price fetched only when needed", async () => {
    await quote({ token: NUSD, amount: wei(100), collateralToken: NUSD });
    expect(priceState.calls).toBe(0);
    await quote({ token: NETH, amount: wei(1), collateralToken: NUSD });
    expect(priceState.calls).toBe(1);
  });

  it("nETH borrow, nUSD collateral: 1 nETH @ 2000 bronze → 4000 nUSD", async () => {
    const data: any = await (await quote({ token: NETH, amount: wei(1), collateralToken: NUSD })).json();
    expect(data).toMatchObject({ requiredCollateral: wei(4000), requiredValueUsd: 4000, ethPrice: 2000 });
  });

  it("missing params → 400", async () => {
    expect((await get(`/collateral-quote?account=${borrower}`)).status).toBe(400);
  });

  it("unsupported collateral → 400", async () => {
    const res = await quote({ token: NUSD, amount: wei(1), collateralToken: lenderA });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("collateralToken must be nUSD or nETH");
  });
});

describe("GET /credit-score/:address", () => {
  it("lazily creates bronze", async () => {
    const data: any = await (await get(`/credit-score/${borrower}`)).json();
    expect(data).toEqual({ tier: "bronze", loansRepaid: 0, loansDefaulted: 0, collateralMultiplier: 2, ethPrice: 2000 });
  });

  it("reports stored tier", async () => {
    await setTier(borrower, "gold", 3, 1);
    const data: any = await (await get(`/credit-score/${borrower}`)).json();
    expect(data).toMatchObject({ tier: "gold", loansRepaid: 3, loansDefaulted: 1, collateralMultiplier: 1.5 });
  });
});

describe("GET /swap-quote", () => {
  const swap = (q: Record<string, string>) => get(`/swap-quote?${new URLSearchParams(q)}`);

  it("nUSD → nETH: amountIn * 1e18 / round(eth * 1e18)", async () => {
    const data: any = await (await swap({ tokenIn: NUSD, tokenOut: NETH, amountIn: wei(1000) })).json();
    expect(data).toMatchObject({ amountIn: wei(1000), amountOut: wei(0.5), ethPrice: 2000, rate: "1 nUSD = 0.00050000 nETH" });
  });

  it("nETH → nUSD: amountIn * round(eth * 1e18) / 1e18", async () => {
    const data: any = await (await swap({ tokenIn: NETH, tokenOut: NUSD, amountIn: wei(1) })).json();
    expect(data).toMatchObject({ amountOut: wei(2000), rate: "1 nETH = 2000.00 nUSD" });
  });

  it("errors → 400", async () => {
    expect((await swap({ tokenIn: NUSD })).status).toBe(400);
    expect((await swap({ tokenIn: NUSD, tokenOut: NUSD, amountIn: "1" })).status).toBe(400);
    const res = await swap({ tokenIn: NUSD, tokenOut: lenderA, amountIn: "1" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("Only nUSD and nETH supported");
  });
});

describe("GET /lender-status/:address", () => {
  it("active lends with slotId, active/completed loans, payouts", async () => {
    await seedLendIntent("li-a", lenderA, wei(10));
    await DepositSlotModel.create({
      slotId: "s-1", userId: lenderA, token: NUSD, amount: wei(10), status: "confirmed",
      intentId: "li-a", createdAt: Date.now(), epochId: 1,
    });
    await seedLoan("l-1", borrower, referenceTicks(lenderA, lenderB));
    await seedLoan("l-2", borrower, referenceTicks(lenderA, lenderB), { status: "repaid" });
    const pending = await queueTransfer(lenderA, NUSD, "1", "repay-lender");
    const done = await queueTransfer(lenderA, NUSD, "2", "repay-lender");
    await PendingTransferModel.updateOne({ transferId: done }, { status: "completed" });

    const data: any = await (await get(`/lender-status/${ethers.getAddress(lenderA)}`)).json();
    expect(data.address).toBe(lenderA);
    expect(data.activeLends).toEqual([
      expect.objectContaining({ intentId: "li-a", slotId: "s-1", token: NUSD, amount: wei(10) }),
    ]);
    expect(data.activeLoans).toHaveLength(1);
    expect(data.activeLoans[0]).toMatchObject({
      loanId: "l-1", principal: wei(60), rate: 0.05, expectedPayout: wei(63), borrower,
    });
    expect(data.completedLoans).toEqual([
      { loanId: "l-2", token: NUSD, principal: wei(60), rate: 0.05, status: "repaid" },
    ]);
    expect(data.pendingPayouts.map((p: any) => p.id)).toEqual([pending]);
    expect(data.completedPayouts.map((p: any) => p.id)).toEqual([done]);
  });
});

describe("GET /borrower-status/:address", () => {
  it("intents, proposals, loans with totalDue/excess, transfers", async () => {
    await seedBorrowIntent("bi-1", borrower);
    await seedBorrowIntent("bi-2", borrower, { status: "proposed" });
    await seedBorrowIntent("bi-3", borrower, { status: "matched" });
    await seedProposal("p-1", borrower, referenceTicks(lenderA, lenderB));
    await seedLoan("l-1", borrower, referenceTicks(lenderA, lenderB));
    await seedLoan("l-2", borrower, referenceTicks(lenderA, lenderB), { status: "defaulted" });
    await queueTransfer(borrower, NUSD, "3", "return-collateral");

    const data: any = await (await get(`/borrower-status/${borrower}`)).json();
    expect(data.pendingIntents.map((i: any) => i.intentId).sort()).toEqual(["bi-1", "bi-2"]);
    expect(data.pendingProposals).toEqual([
      expect.objectContaining({ proposalId: "p-1", principal: wei(100), effectiveRate: 0.062 }),
    ]);
    expect(data.activeLoans[0]).toMatchObject({
      loanId: "l-1", totalDue: "106200000000000000000", repaidAmount: "0",
      requiredCollateral: wei(200), excessCollateral: wei(50),
    });
    expect(data.activeLoans[0].effectiveRate).toBeCloseTo(0.062, 10);
    expect(data.completedLoans).toEqual([expect.objectContaining({ loanId: "l-2", status: "defaulted" })]);
    expect(data.pendingTransfers).toHaveLength(1);
    expect(data.completedTransfers).toEqual([]);
  });
});
