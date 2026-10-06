import { Hono } from "hono";
import {
  initDepositLend,
  confirmDepositLend,
  cancelLend,
} from "../controllers/lend.controllers";
import {
  submitBorrowIntent,
  cancelBorrow,
  acceptProposal,
  rejectProposal,
  claimExcessCollateral,
} from "../controllers/borrow.controllers";
import {
  getPendingIntents,
  recordMatchProposals,
  expireProposals,
  checkLoans,
  getPendingTransfers,
  confirmTransfers,
  liquidateLoans,
} from "../controllers/internal.controllers";
import { repayLoan } from "../controllers/repay.controllers";
import { getCollateralMultiplier, getCreditScore } from "../state";
import DepositSlotModel from "../models/deposit-slot.model";
import LendIntentModel from "../models/lend-intent.model";
import BorrowIntentModel from "../models/borrow-intent.model";
import MatchProposalModel from "../models/match-proposal.model";
import LoanModel from "../models/loan.model";
import PendingTransferModel from "../models/pending-transfer.model";
import { getEthPrice } from "../price";
import { config } from "../config";
import type { Context, Next } from "hono";

const ghostRoute = new Hono();

// Internal auth middleware
const internalAuth = async (c: Context, next: Next) => {
  if (!config.INTERNAL_API_KEY) return next();
  const key = c.req.header("x-api-key");
  if (key !== config.INTERNAL_API_KEY)
    return c.json({ error: "Unauthorized" }, 401);
  return next();
};

// Lend (user-facing)
ghostRoute.post("/deposit-lend/init", initDepositLend);
ghostRoute.post("/deposit-lend/confirm", confirmDepositLend);
ghostRoute.post("/cancel-lend", cancelLend);

// Borrow (user-facing)
ghostRoute.post("/borrow-intent", submitBorrowIntent);
ghostRoute.post("/cancel-borrow", cancelBorrow);
ghostRoute.post("/accept-proposal", acceptProposal);
ghostRoute.post("/reject-proposal", rejectProposal);
ghostRoute.post("/repay", repayLoan);
ghostRoute.post("/claim-excess-collateral", claimExcessCollateral);

// Internal (CRE) — x-api-key guarded
ghostRoute.get("/internal/pending-intents", internalAuth, getPendingIntents);
ghostRoute.post("/internal/record-match-proposals", internalAuth, recordMatchProposals);
ghostRoute.post("/internal/expire-proposals", internalAuth, expireProposals);
ghostRoute.post("/internal/check-loans", internalAuth, checkLoans);
ghostRoute.get("/internal/pending-transfers", internalAuth, getPendingTransfers);
ghostRoute.post("/internal/confirm-transfers", internalAuth, confirmTransfers);
ghostRoute.post("/internal/liquidate-loans", internalAuth, liquidateLoans);

// Public
ghostRoute.get("/collateral-quote", async (c: Context) => {
  const account = c.req.query("account");
  const token = c.req.query("token");
  const amount = c.req.query("amount");
  const collateralToken = c.req.query("collateralToken");

  if (!account || !token || !amount || !collateralToken)
    return c.json({ error: "Required query params: account, token, amount, collateralToken" }, 400);

  const ct = collateralToken.toLowerCase();
  const isUsdCollateral = ct === config.TOKEN_ADDRESS.toLowerCase();
  const isEthCollateral = ct === config.GETH_ADDRESS.toLowerCase();
  if (!isUsdCollateral && !isEthCollateral)
    return c.json({ error: "collateralToken must be gUSD or gETH" }, 400);

  const score = await getCreditScore(account);
  const multiplier = getCollateralMultiplier(score.tier);
  const borrowAmt = BigInt(amount);
  const bt = token.toLowerCase();
  const isBorrowEth = bt === config.GETH_ADDRESS.toLowerCase();
  const needsEthPrice = isBorrowEth || isEthCollateral;
  const ethPrice = needsEthPrice ? await getEthPrice() : null;
  const borrowValueUsd = isBorrowEth
    ? (Number(borrowAmt) / 1e18) * ethPrice!
    : Number(borrowAmt) / 1e18;
  const requiredValueUsd = borrowValueUsd * multiplier;

  const requiredCollateral = isUsdCollateral
    ? BigInt(Math.ceil(requiredValueUsd * 1e18))
    : BigInt(Math.ceil((requiredValueUsd / ethPrice!) * 1e18));

  return c.json({
    tier: score.tier,
    multiplier,
    ethPrice,
    requiredCollateral: requiredCollateral.toString(),
    requiredValueUsd,
  });
});

ghostRoute.get("/lender-status/:address", async (c: Context) => {
  const addr = c.req.param("address").toLowerCase();

  // Build intentId -> slotId lookup
  const slotsWithIntent = await DepositSlotModel.find({ intentId: { $exists: true, $ne: null } }).lean();
  const intentToSlot = new Map<string, string>();
  for (const slot of slotsWithIntent) {
    intentToSlot.set(slot.intentId as string, slot.slotId as string);
  }

  // Active lend intents
  const lendDocs = await LendIntentModel.find({ userId: addr }).lean();
  const activeLends = lendDocs.map((i) => ({
    intentId: i.intentId as string,
    slotId: intentToSlot.get(i.intentId as string) ?? "",
    token: i.token as string,
    amount: i.amount as string,
    createdAt: i.createdAt as number,
  }));

  // Loans where this address is a lender
  const loanDocs = await LoanModel.find({ "matchedTicks.lender": addr }).lean();
  const activeLoans: any[] = [];
  const completedLoans: any[] = [];
  for (const loan of loanDocs) {
    const ticks = (loan.matchedTicks as any[]).filter((t) => t.lender === addr);
    if (ticks.length === 0) continue;
    const lenderPrincipal = ticks.reduce((s, t) => s + BigInt(t.amount), 0n);
    const weightedRate =
      ticks.reduce((s, t) => s + t.rate * Number(BigInt(t.amount)), 0) /
      Number(lenderPrincipal);
    const expectedPayout =
      lenderPrincipal + BigInt(Math.floor(Number(lenderPrincipal) * weightedRate));

    if (loan.status === "active") {
      activeLoans.push({
        loanId: loan.loanId,
        token: loan.token,
        principal: lenderPrincipal.toString(),
        rate: weightedRate,
        expectedPayout: expectedPayout.toString(),
        maturity: loan.maturity,
        maturityDate: new Date(loan.maturity as number).toISOString(),
        borrower: loan.borrower,
      });
    } else {
      completedLoans.push({
        loanId: loan.loanId,
        token: loan.token,
        principal: lenderPrincipal.toString(),
        rate: weightedRate,
        status: loan.status,
      });
    }
  }

  // Transfers to this lender
  const transferDocs = await PendingTransferModel.find({ recipient: addr }).lean();
  const pendingPayouts: any[] = [];
  const completedPayouts: any[] = [];
  for (const t of transferDocs) {
    const entry = { id: t.transferId, amount: t.amount, token: t.token, reason: t.reason };
    if (t.status === "pending") pendingPayouts.push(entry);
    else if (t.status === "completed") completedPayouts.push(entry);
  }

  return c.json({ address: addr, activeLends, activeLoans, completedLoans, pendingPayouts, completedPayouts });
});

ghostRoute.get("/borrower-status/:address", async (c: Context) => {
  const addr = c.req.param("address").toLowerCase();

  // Pending borrow intents (not yet matched)
  const intentDocs = await BorrowIntentModel.find({
    borrower: addr,
    status: { $in: ["pending", "proposed"] },
  }).lean();
  const pendingIntents = intentDocs.map((i) => ({
    intentId: i.intentId as string,
    token: i.token as string,
    amount: i.amount as string,
    collateralToken: i.collateralToken as string,
    collateralAmount: i.collateralAmount as string,
    status: i.status as string,
    createdAt: i.createdAt as number,
  }));

  // Pending proposals awaiting acceptance
  const proposalDocs = await MatchProposalModel.find({
    borrower: addr,
    status: "pending",
  }).lean();
  const pendingProposals = proposalDocs.map((p) => ({
    proposalId: p.proposalId as string,
    token: p.token as string,
    principal: p.principal as string,
    effectiveRate: p.effectiveBorrowerRate as number,
    collateralToken: p.collateralToken as string,
    collateralAmount: p.collateralAmount as string,
    expiresAt: p.expiresAt as number,
  }));

  // Loans
  const loanDocs = await LoanModel.find({ borrower: addr }).lean();
  const activeLoans: any[] = [];
  const completedLoans: any[] = [];
  for (const loan of loanDocs) {
    const principal = BigInt(loan.principal as string);
    const ticks = loan.matchedTicks as Array<{ amount: string; rate: number }>;
    let totalDue = 0n;
    for (const tick of ticks) {
      const amt = BigInt(tick.amount);
      totalDue += amt + BigInt(Math.floor(Number(amt) * tick.rate));
    }
    const effectiveRate = Number(totalDue - principal) / Number(principal);

    if (loan.status === "active") {
      const collateralAmount = BigInt(loan.collateralAmount as string);
      const requiredCollateral = BigInt(loan.requiredCollateral as string);
      activeLoans.push({
        loanId: loan.loanId,
        token: loan.token,
        principal: loan.principal,
        effectiveRate,
        totalDue: totalDue.toString(),
        repaidAmount: loan.repaidAmount,
        collateralToken: loan.collateralToken,
        collateralAmount: loan.collateralAmount,
        requiredCollateral: loan.requiredCollateral,
        excessCollateral: (collateralAmount - requiredCollateral).toString(),
        maturity: loan.maturity,
        maturityDate: new Date(loan.maturity as number).toISOString(),
      });
    } else {
      completedLoans.push({
        loanId: loan.loanId,
        token: loan.token,
        principal: loan.principal,
        effectiveRate,
        collateralToken: loan.collateralToken,
        collateralAmount: loan.collateralAmount,
        status: loan.status,
      });
    }
  }

  // Transfers back to borrower (collateral returns, etc.)
  const transferDocs = await PendingTransferModel.find({ recipient: addr }).lean();
  const pendingTransfers: any[] = [];
  const completedTransfers: any[] = [];
  for (const t of transferDocs) {
    const entry = { id: t.transferId, amount: t.amount, token: t.token, reason: t.reason };
    if (t.status === "pending") pendingTransfers.push(entry);
    else if (t.status === "completed") completedTransfers.push(entry);
  }

  return c.json({ address: addr, pendingIntents, pendingProposals, activeLoans, completedLoans, pendingTransfers, completedTransfers });
});

ghostRoute.get("/credit-score/:address", async (c: Context) => {
  const address = c.req.param("address");
  const score = await getCreditScore(address);
  const ethPrice = await getEthPrice();
  return c.json({
    tier: score.tier,
    loansRepaid: score.loansRepaid,
    loansDefaulted: score.loansDefaulted,
    collateralMultiplier: getCollateralMultiplier(score.tier),
    ethPrice,
  });
});

// Swap quote — returns amountOut based on live ETH price
ghostRoute.get("/swap-quote", async (c: Context) => {
  const tokenIn = c.req.query("tokenIn");
  const tokenOut = c.req.query("tokenOut");
  const amountIn = c.req.query("amountIn");

  if (!tokenIn || !tokenOut || !amountIn)
    return c.json({ error: "Required: tokenIn, tokenOut, amountIn" }, 400);

  if (tokenIn.toLowerCase() === tokenOut.toLowerCase())
    return c.json({ error: "tokenIn and tokenOut must be different" }, 400);

  const gusd = config.TOKEN_ADDRESS.toLowerCase();
  const geth = config.GETH_ADDRESS.toLowerCase();

  const inLower = tokenIn.toLowerCase();
  const outLower = tokenOut.toLowerCase();

  if (![gusd, geth].includes(inLower) || ![gusd, geth].includes(outLower))
    return c.json({ error: "Only gUSD and gETH supported" }, 400);

  const ethPrice = await getEthPrice();
  const amtIn = BigInt(amountIn);

  let amountOut: bigint;
  if (inLower === gusd && outLower === geth) {
    // gUSD -> gETH: amountOut = amountIn / ethPrice
    amountOut = (amtIn * BigInt(1e18)) / BigInt(Math.round(ethPrice * 1e18));
  } else {
    // gETH -> gUSD: amountOut = amountIn * ethPrice
    amountOut = (amtIn * BigInt(Math.round(ethPrice * 1e18))) / BigInt(1e18);
  }

  return c.json({
    tokenIn,
    tokenOut,
    amountIn: amtIn.toString(),
    amountOut: amountOut.toString(),
    ethPrice,
    rate: inLower === gusd ? `1 gUSD = ${(1 / ethPrice).toFixed(8)} gETH` : `1 gETH = ${ethPrice.toFixed(2)} gUSD`,
  });
});

export default ghostRoute;
