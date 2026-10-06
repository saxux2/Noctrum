import { describe, it, expect } from "bun:test";
import { ethers } from "ethers";
import {
  post, sign, setTier, seedBorrowIntent, seedLendIntent, seedProposal, seedLoan,
  referenceTicks, NUSD, NETH, wei,
} from "./helpers";
import { priceState } from "./mock-price";
import { creditBalance, getBalance } from "../state";
import BorrowIntentModel from "../models/borrow-intent.model";
import MatchProposalModel from "../models/match-proposal.model";
import LoanModel from "../models/loan.model";
import LendIntentModel from "../models/lend-intent.model";
import PendingTransferModel from "../models/pending-transfer.model";

const borrower = ethers.Wallet.createRandom();
const stranger = ethers.Wallet.createRandom();
const lenderA = ethers.Wallet.createRandom().address.toLowerCase();
const lenderB = ethers.Wallet.createRandom().address.toLowerCase();

const transfer = (transferId: string) => PendingTransferModel.findOne({ transferId });

describe("POST /borrow-intent", () => {
  const submit = async (over: Record<string, unknown> = {}, w = borrower) =>
    post(
      "/borrow-intent",
      await sign(w, "Submit Borrow", {
        token: NUSD,
        amount: wei(100),
        collateralToken: NUSD,
        collateralAmount: wei(200),
        encryptedMaxRate: "0xenc",
        ...over,
      }),
    );

  it("valid nUSD collateral → 200, pending intent, no price fetch", async () => {
    const res = await submit();
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("borrow_intent_created");
    const intent = await BorrowIntentModel.findOne({ intentId: data.intentId });
    expect(intent?.status).toBe("pending");
    expect(intent?.borrower).toBe(borrower.address.toLowerCase());
    expect(intent?.collateralAmount).toBe(wei(200));
    expect(priceState.calls).toBe(0);
  });

  it("nETH collateral valued at ETH price", async () => {
    // 0.1 nETH @ 2000 = $200 = 100 * 2.0 (bronze)
    const res = await submit({ collateralToken: NETH, collateralAmount: wei(0.1) });
    expect(res.status).toBe(200);
    expect(priceState.calls).toBe(1);
  });

  it("missing fields → 400", async () => {
    const res = await post("/borrow-intent", { account: borrower.address });
    expect(res.status).toBe(400);
  });

  it("unsupported collateral token → 400", async () => {
    const res = await submit({ collateralToken: ethers.Wallet.createRandom().address });
    expect(res.status).toBe(400);
    expect(((await res.json()) as any).error).toBe("Collateral token must be nUSD or nETH");
  });

  it("insufficient collateral for bronze (2.0x) → 400 with details", async () => {
    const res = await submit({ collateralAmount: wei(150) });
    expect(res.status).toBe(400);
    const data: any = await res.json();
    expect(data).toEqual({
      error: "Insufficient collateral for credit tier",
      tier: "bronze",
      multiplier: 2,
      ethPrice: null,
      requiredUsd: 200,
      providedUsd: 150,
      provided: wei(150),
    });
  });

  it("silver tier needs only 1.8x", async () => {
    await setTier(borrower.address, "silver");
    expect((await submit({ collateralAmount: wei(180) })).status).toBe(200);
    expect((await submit({ collateralAmount: wei(179) })).status).toBe(400);
  });

  it("borrow token is ignored (nETH borrow valued at $1/unit, D-3 parity)", async () => {
    const res = await submit({ token: NETH, amount: wei(100), collateralAmount: wei(200) });
    expect(res.status).toBe(200);
  });

  it("bad signature → 401", async () => {
    const body = await sign(stranger, "Submit Borrow", {
      token: NUSD, amount: wei(100), collateralToken: NUSD, collateralAmount: wei(200), encryptedMaxRate: "0xenc",
    });
    const res = await post("/borrow-intent", { ...body, account: borrower.address });
    expect(res.status).toBe(401);
  });
});

describe("POST /cancel-borrow", () => {
  const cancel = async (intentId: string, w = borrower) =>
    post("/cancel-borrow", await sign(w, "Cancel Borrow", { intentId }));

  it("valid → 200, collateral returned via cancel-borrow transfer", async () => {
    await seedBorrowIntent("bi-1", borrower.address);
    const res = await cancel("bi-1");
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("cancelled");
    const t = await transfer(data.transferId);
    expect(t?.reason).toBe("cancel-borrow");
    expect(t?.amount).toBe(wei(250));
    expect(t?.token).toBe(NUSD);
    expect(t?.recipient).toBe(borrower.address.toLowerCase());
    expect((await BorrowIntentModel.findOne({ intentId: "bi-1" }))?.status).toBe("cancelled");
  });

  it("unknown → 404", async () => {
    expect((await cancel("nope")).status).toBe(404);
  });

  it("not owner → 403", async () => {
    await seedBorrowIntent("bi-1", borrower.address);
    expect((await cancel("bi-1", stranger)).status).toBe(403);
  });

  it("not pending → 409", async () => {
    await seedBorrowIntent("bi-1", borrower.address, { status: "proposed" });
    const res = await cancel("bi-1");
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toBe("Can only cancel pending intents");
  });
});

describe("POST /accept-proposal", () => {
  const accept = async (proposalId: string, w = borrower) =>
    post("/accept-proposal", await sign(w, "Accept Proposal", { proposalId }));

  it("valid → loan created, ticks consumed, lenders debited, disburse queued", async () => {
    await seedBorrowIntent("bi-1", borrower.address, { status: "proposed" });
    await seedLendIntent("li-a", lenderA, wei(60)); // fully consumed
    await seedLendIntent("li-b", lenderB, wei(100)); // partially consumed
    await creditBalance(lenderA, NUSD, BigInt(wei(60)));
    await creditBalance(lenderB, NUSD, BigInt(wei(100)));
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB));

    const res = await accept("p-1");
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("accepted");

    const loan = await LoanModel.findOne({ loanId: data.loanId });
    expect(loan?.status).toBe("active");
    expect(loan?.principal).toBe(wei(100));
    expect(loan?.requiredCollateral).toBe(wei(200)); // 100 * 2.0, nUSD collateral
    expect(loan?.repaidAmount).toBe("0");
    expect((await MatchProposalModel.findOne({ proposalId: "p-1" }))?.status).toBe("accepted");
    expect((await BorrowIntentModel.findOne({ intentId: "bi-1" }))?.status).toBe("matched");
    expect(await LendIntentModel.findOne({ intentId: "li-a" })).toBeNull();
    expect((await LendIntentModel.findOne({ intentId: "li-b" }))?.amount).toBe(wei(60));
    expect(await getBalance(lenderA, NUSD)).toBe(0n);
    expect(await getBalance(lenderB, NUSD)).toBe(BigInt(wei(60)));

    const t = await transfer(data.transferId);
    expect(t?.reason).toBe("disburse");
    expect(t?.amount).toBe(wei(100));
    expect(t?.recipient).toBe(borrower.address.toLowerCase());
  });

  it("nETH collateral: required = ceil(usd / ethPrice)", async () => {
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB), {
      collateralToken: NETH,
      collateralAmount: wei(1),
    });
    const { loanId }: any = await (await accept("p-1")).json();
    expect((await LoanModel.findOne({ loanId }))?.requiredCollateral).toBe(wei(0.1));
  });

  it("required collateral is capped at the posted collateral", async () => {
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB), {
      collateralAmount: wei(150),
    });
    const { loanId }: any = await (await accept("p-1")).json();
    expect((await LoanModel.findOne({ loanId }))?.requiredCollateral).toBe(wei(150));
  });

  it("unknown → 404", async () => {
    expect((await accept("nope")).status).toBe(404);
  });

  it("not owner → 403", async () => {
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB));
    expect((await accept("p-1", stranger)).status).toBe(403);
  });

  it("not pending → 409", async () => {
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB), { status: "rejected" });
    expect((await accept("p-1")).status).toBe(409);
  });

  it("expired → 410", async () => {
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB), { expiresAt: Date.now() - 1 });
    expect((await accept("p-1")).status).toBe(410);
  });
});

describe("POST /reject-proposal", () => {
  const reject = async (proposalId: string, w = borrower) =>
    post("/reject-proposal", await sign(w, "Reject Proposal", { proposalId }));

  it("valid → 5% slash, 95% returned, ticks restored onto lend intents", async () => {
    await seedBorrowIntent("bi-1", borrower.address, { status: "proposed" });
    await seedLendIntent("li-a", lenderA, wei(10));
    await seedLendIntent("li-b", lenderB, wei(5));
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB), {
      collateralAmount: wei(200),
    });

    const res = await reject("p-1");
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data.status).toBe("rejected");
    expect(data.slashed).toBe(wei(10));
    expect(data.returned).toBe(wei(190));

    const t = await transfer(data.transferId);
    expect(t?.reason).toBe("return-collateral");
    expect(t?.amount).toBe(wei(190));
    expect((await MatchProposalModel.findOne({ proposalId: "p-1" }))?.status).toBe("rejected");
    expect((await BorrowIntentModel.findOne({ intentId: "bi-1" }))?.status).toBe("rejected");
    expect((await LendIntentModel.findOne({ intentId: "li-a" }))?.amount).toBe(wei(70));
    expect((await LendIntentModel.findOne({ intentId: "li-b" }))?.amount).toBe(wei(45));
  });

  it("slash floors in bigint", async () => {
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB), { collateralAmount: "99" });
    const data: any = await (await reject("p-1")).json();
    expect(data.slashed).toBe("4");
    expect(data.returned).toBe("95");
  });

  it("unknown → 404", async () => {
    expect((await reject("nope")).status).toBe(404);
  });

  it("not owner → 403", async () => {
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB));
    expect((await reject("p-1", stranger)).status).toBe(403);
  });

  it("not pending → 409", async () => {
    await seedProposal("p-1", borrower.address, referenceTicks(lenderA, lenderB), { status: "accepted" });
    expect((await reject("p-1")).status).toBe(409);
  });
});

describe("POST /claim-excess-collateral", () => {
  const claim = async (loanId: string, w = borrower) =>
    post("/claim-excess-collateral", await sign(w, "Claim Excess Collateral", { loanId }));

  it("valid → returns collateral above required", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB));
    const res = await claim("l-1");
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data).toMatchObject({
      status: "excess_claimed",
      loanId: "l-1",
      excessReturned: wei(50),
      remainingCollateral: wei(200),
    });
    const t = await transfer(data.transferId);
    expect(t?.reason).toBe("return-collateral");
    expect(t?.amount).toBe(wei(50));
    expect((await LoanModel.findOne({ loanId: "l-1" }))?.collateralAmount).toBe(wei(200));
  });

  it("no excess → 400", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB), { collateralAmount: wei(200) });
    const res = await claim("l-1");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No excess collateral", locked: wei(200), required: wei(200) });
  });

  it("unknown → 404", async () => {
    expect((await claim("nope")).status).toBe(404);
  });

  it("not owner → 403", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB));
    expect((await claim("l-1", stranger)).status).toBe(403);
  });

  it("not active → 409", async () => {
    await seedLoan("l-1", borrower.address, referenceTicks(lenderA, lenderB), { status: "repaid" });
    expect((await claim("l-1")).status).toBe(409);
  });
});
