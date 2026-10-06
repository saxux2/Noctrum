import type { Context } from "hono";
import { getPoolAddress } from "../external-api";
import { getEthPrice } from "../price";
import { config } from "../config";
import LendIntentModel from "../models/lend-intent.model";
import BorrowIntentModel from "../models/borrow-intent.model";
import MatchProposalModel from "../models/match-proposal.model";
import LoanModel from "../models/loan.model";
import PendingTransferModel from "../models/pending-transfer.model";
import CreditScoreModel from "../models/credit-score.model";
import {
  debitBalance,
  queueTransfer,
  getCreditScore,
  getCollateralMultiplier,
  downgradeTier,
} from "../state";

export const getPendingIntents = async (c: Context) => {
  const pendingProposals = await MatchProposalModel.find({ status: "pending" }).lean();
  const lockedLendIds = new Set<string>();
  for (const proposal of pendingProposals) {
    for (const tick of proposal.matchedTicks) {
      lockedLendIds.add(tick.lendIntentId as string);
    }
  }

  const allLends = await LendIntentModel.find({}).lean();
  const lendIntents = allLends
    .filter((l) => !lockedLendIds.has(l.intentId as string))
    .map((l) => ({
      intentId: l.intentId,
      userId: l.userId,
      token: l.token,
      amount: l.amount,
      encryptedRate: l.encryptedRate,
      epochId: l.epochId,
      createdAt: l.createdAt,
    }));

  const borrowIntents = await BorrowIntentModel.find({ status: "pending" }).lean();
  const mappedBorrows = borrowIntents.map((b) => ({
    intentId: b.intentId,
    borrower: b.borrower,
    token: b.token,
    amount: b.amount,
    encryptedMaxRate: b.encryptedMaxRate,
    collateralToken: b.collateralToken,
    collateralAmount: b.collateralAmount,
    status: b.status,
    createdAt: b.createdAt,
  }));

  return c.json({ lendIntents, borrowIntents: mappedBorrows });
};

export const recordMatchProposals = async (c: Context) => {
  const { proposals } = await c.req.json();
  if (!Array.isArray(proposals))
    return c.json({ error: "proposals must be an array" }, 400);

  let recorded = 0;
  for (const p of proposals) {
    const proposalId = p.proposalId ?? crypto.randomUUID();
    await MatchProposalModel.create({
      proposalId,
      borrowIntentId: p.borrowIntentId,
      borrower: p.borrower.toLowerCase(),
      token: p.token.toLowerCase(),
      principal: BigInt(p.principal).toString(),
      matchedTicks: p.matchedTicks.map((t: any) => ({
        lender: t.lender.toLowerCase(),
        lendIntentId: t.lendIntentId,
        amount: BigInt(t.amount).toString(),
        rate: Number(t.rate),
      })),
      effectiveBorrowerRate: Number(p.effectiveBorrowerRate),
      collateralToken: p.collateralToken.toLowerCase(),
      collateralAmount: BigInt(p.collateralAmount).toString(),
      status: "pending",
      createdAt: Date.now(),
      expiresAt: Date.now() + 5 * 1000,
    });

    const borrowIntent = await BorrowIntentModel.findOne({ intentId: p.borrowIntentId });
    if (borrowIntent) {
      borrowIntent.status = "proposed";
      await borrowIntent.save();
    }

    recorded++;
  }

  return c.json({ recorded });
};

export const expireProposals = async (c: Context) => {
  const now = Date.now();
  let autoAccepted = 0;
  const errors: string[] = [];

  const pendingProposals = await MatchProposalModel.find({
    status: "pending",
    expiresAt: { $lt: now },
  });

  for (const proposal of pendingProposals) {
    try {
      const loanId = crypto.randomUUID();

      // Compute requiredCollateral (bug fix)
      const ct = (proposal.collateralToken as string).toLowerCase();
      const isUsdCollateral = ct === config.TOKEN_ADDRESS.toLowerCase();
      const score = await getCreditScore(proposal.borrower as string);
      const multiplier = getCollateralMultiplier(score.tier);
      const principalBig = BigInt(proposal.principal as string);
      const borrowToken = (proposal.token as string).toLowerCase();
      const isEthBorrow = borrowToken === config.GETH_ADDRESS.toLowerCase();
      const principalNum = Number(principalBig) / 1e18;
      let principalUsd: number;
      if (isEthBorrow) {
        const ethPrice = await getEthPrice();
        principalUsd = principalNum * ethPrice;
      } else {
        principalUsd = principalNum;
      }
      const requiredValueUsd = principalUsd * multiplier;
      let requiredCollateral: bigint;
      if (isUsdCollateral) {
        requiredCollateral = BigInt(Math.ceil(requiredValueUsd * 1e18));
      } else {
        const ethPrice = await getEthPrice();
        requiredCollateral = BigInt(Math.ceil((requiredValueUsd / ethPrice) * 1e18));
      }
      const collateralAmountBig = BigInt(proposal.collateralAmount as string);
      if (requiredCollateral > collateralAmountBig) requiredCollateral = collateralAmountBig;

      await LoanModel.create({
        loanId,
        borrower: proposal.borrower,
        token: proposal.token,
        principal: (proposal.principal as string),
        matchedTicks: proposal.matchedTicks,
        effectiveBorrowerRate: proposal.effectiveBorrowerRate,
        collateralToken: proposal.collateralToken,
        collateralAmount: (proposal.collateralAmount as string),
        requiredCollateral: requiredCollateral.toString(),
        maturity: Date.now() + 30 * 24 * 60 * 60 * 1000,
        status: "active",
        repaidAmount: "0",
      });

      proposal.status = "accepted";
      await proposal.save();

      const borrowIntent = await BorrowIntentModel.findOne({ intentId: proposal.borrowIntentId });
      if (borrowIntent) {
        borrowIntent.status = "matched";
        await borrowIntent.save();
      }

      // Consume lend ticks + debit lender balances
      for (const tick of proposal.matchedTicks) {
        const lendIntent = await LendIntentModel.findOne({ intentId: tick.lendIntentId });
        if (lendIntent) {
          const tickAmount = BigInt(tick.amount as string);
          const lendAmount = BigInt(lendIntent.amount as string);
          if (tickAmount >= lendAmount) {
            await LendIntentModel.deleteOne({ intentId: tick.lendIntentId });
          } else {
            lendIntent.amount = (lendAmount - tickAmount).toString();
            await lendIntent.save();
          }
        }
        await debitBalance(tick.lender as string, proposal.token as string, BigInt(tick.amount as string));
      }

      // Queue principal disbursement
      await queueTransfer(
        proposal.borrower as string,
        proposal.token as string,
        proposal.principal as string,
        "disburse"
      );

      autoAccepted++;
    } catch (err: any) {
      errors.push(`${proposal.proposalId}: ${err.message}`);
    }
  }

  return c.json({ autoAccepted, errors: errors.length ? errors : undefined });
};

export const checkLoans = async (c: Context) => {
  const loans = await LoanModel.find({ status: "active" }).lean();
  return c.json({
    loans: loans.map((l) => ({
      loanId: l.loanId,
      borrower: l.borrower,
      token: l.token,
      principal: l.principal,
      collateralAmount: l.collateralAmount,
      requiredCollateral: l.requiredCollateral,
      repaidAmount: l.repaidAmount,
      effectiveBorrowerRate: l.effectiveBorrowerRate,
      collateralToken: l.collateralToken,
      maturity: l.maturity,
      status: l.status,
      matchedTicks: l.matchedTicks.map((t) => ({
        lender: t.lender,
        lendIntentId: t.lendIntentId,
        amount: t.amount,
        rate: t.rate,
      })),
    })),
  });
};

export const getPendingTransfers = async (c: Context) => {
  const transfers = await PendingTransferModel.find({ status: "pending" }).lean();
  return c.json({
    transfers: transfers.map((t) => ({
      id: t.transferId,
      recipient: t.recipient,
      token: t.token,
      amount: t.amount,
      reason: t.reason,
      createdAt: t.createdAt,
      status: t.status,
    })),
  });
};

export const confirmTransfers = async (c: Context) => {
  const { transferIds } = await c.req.json();
  if (!Array.isArray(transferIds))
    return c.json({ error: "transferIds must be an array" }, 400);

  let confirmed = 0;
  for (const id of transferIds) {
    const transfer = await PendingTransferModel.findOne({ transferId: id, status: "pending" });
    if (transfer) {
      transfer.status = "completed";
      await transfer.save();
      confirmed++;
    }
  }
  return c.json({ confirmed });
};

export const liquidateLoans = async (c: Context) => {
  const { loanIds } = await c.req.json();
  if (!Array.isArray(loanIds))
    return c.json({ error: "loanIds must be an array" }, 400);

  const poolAddress = getPoolAddress();
  let liquidated = 0;
  const transfers: string[] = [];

  for (const loanId of loanIds) {
    const loan = await LoanModel.findOne({ loanId });
    if (!loan || loan.status !== "active") continue;

    loan.status = "defaulted";
    await loan.save();

    const score = await getCreditScore(loan.borrower as string);
    await CreditScoreModel.updateOne(
      { address: (loan.borrower as string).toLowerCase() },
      { $inc: { loansDefaulted: 1 } }
    );
    await downgradeTier(loan.borrower as string);

    const collateralAmount = BigInt(loan.collateralAmount as string);
    const protocolFee = collateralAmount * 5n / 100n;
    const lenderPool = collateralAmount - protocolFee;

    const feeId = await queueTransfer(
      poolAddress,
      loan.collateralToken as string,
      protocolFee.toString(),
      "liquidate"
    );
    transfers.push(feeId);

    const totalPrincipal = loan.matchedTicks.reduce(
      (sum, t) => sum + BigInt(t.amount as string),
      0n
    );
    for (const tick of loan.matchedTicks) {
      const tickAmount = BigInt(tick.amount as string);
      const lenderShare = lenderPool * tickAmount / totalPrincipal;
      if (lenderShare > 0n) {
        const tid = await queueTransfer(
          tick.lender as string,
          loan.collateralToken as string,
          lenderShare.toString(),
          "liquidate"
        );
        transfers.push(tid);
      }
    }

    liquidated++;
  }

  return c.json({ liquidated, transfers });
};
