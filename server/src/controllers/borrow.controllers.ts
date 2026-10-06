import type { Context } from "hono";
import { authenticate } from "../auth";
import { getCollateralMultiplier, getCreditScore, debitBalance, queueTransfer } from "../state";
import { getEthPrice } from "../price";
import { config } from "../config";
import BorrowIntentModel from "../models/borrow-intent.model";
import MatchProposalModel from "../models/match-proposal.model";
import LoanModel from "../models/loan.model";
import LendIntentModel from "../models/lend-intent.model";

export const submitBorrowIntent = async (c: Context) => {
  try {
    const {
      account,
      token,
      amount,
      collateralToken,
      collateralAmount,
      encryptedMaxRate,
      timestamp,
      auth,
    } = await c.req.json();

    if (
      !account ||
      !token ||
      !amount ||
      !collateralToken ||
      !collateralAmount ||
      !encryptedMaxRate ||
      !timestamp ||
      !auth
    )
      return c.json({ error: "Missing required fields" }, 400);

    authenticate(
      "Submit Borrow",
      {
        account,
        token,
        amount,
        collateralToken,
        collateralAmount,
        encryptedMaxRate,
        timestamp,
      },
      auth,
      account,
    );

    const ct = collateralToken.toLowerCase();
    const isUsdCollateral = ct === config.TOKEN_ADDRESS.toLowerCase();
    const isEthCollateral = ct === config.GETH_ADDRESS.toLowerCase();
    if (!isUsdCollateral && !isEthCollateral)
      return c.json({ error: "Collateral token must be gUSD or gETH" }, 400);

    const score = await getCreditScore(account);
    const multiplier = getCollateralMultiplier(score.tier);
    const collateralAmt = BigInt(collateralAmount);
    const borrowAmt = BigInt(amount);
    const ethPrice = isUsdCollateral ? null : await getEthPrice();
    const collateralValueUsd = isUsdCollateral
      ? Number(collateralAmt) / 1e18
      : (Number(collateralAmt) / 1e18) * ethPrice!;
    const requiredValueUsd = (Number(borrowAmt) / 1e18) * multiplier;

    if (collateralValueUsd < requiredValueUsd) {
      return c.json(
        {
          error: "Insufficient collateral for credit tier",
          tier: score.tier,
          multiplier,
          ethPrice,
          requiredUsd: requiredValueUsd,
          providedUsd: collateralValueUsd,
          provided: collateralAmt.toString(),
        },
        400,
      );
    }

    const intentId = crypto.randomUUID();
    await BorrowIntentModel.create({
      intentId,
      borrower: account.toLowerCase(),
      token: token.toLowerCase(),
      amount: BigInt(amount).toString(),
      encryptedMaxRate,
      collateralToken: collateralToken.toLowerCase(),
      collateralAmount: BigInt(collateralAmount).toString(),
      status: "pending",
      createdAt: Date.now(),
    });

    return c.json({ status: "borrow_intent_created", intentId });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};

export const cancelBorrow = async (c: Context) => {
  try {
    const { account, intentId, timestamp, auth } = await c.req.json();

    if (!account || !intentId || !timestamp || !auth)
      return c.json({ error: "Missing required fields" }, 400);

    authenticate(
      "Cancel Borrow",
      { account, intentId, timestamp },
      auth,
      account,
    );

    const intent = await BorrowIntentModel.findOne({ intentId });
    if (!intent) return c.json({ error: "Intent not found" }, 404);
    if (intent.borrower !== account.toLowerCase())
      return c.json({ error: "Not intent owner" }, 403);
    if (intent.status !== "pending")
      return c.json({ error: "Can only cancel pending intents" }, 409);

    const transferId = await queueTransfer(
      account,
      intent.collateralToken as string,
      intent.collateralAmount as string,
      "cancel-borrow",
    );

    intent.status = "cancelled";
    await intent.save();

    return c.json({
      status: "cancelled",
      transferId,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};

export const acceptProposal = async (c: Context) => {
  try {
    const { account, proposalId, timestamp, auth } = await c.req.json();

    if (!account || !proposalId || !timestamp || !auth)
      return c.json({ error: "Missing required fields" }, 400);

    authenticate(
      "Accept Proposal",
      { account, proposalId, timestamp },
      auth,
      account,
    );

    const proposal = await MatchProposalModel.findOne({ proposalId });
    if (!proposal) return c.json({ error: "Proposal not found" }, 404);
    if ((proposal.borrower as string).toLowerCase() !== account.toLowerCase())
      return c.json({ error: "Not proposal owner" }, 403);
    if (proposal.status !== "pending")
      return c.json({ error: "Proposal not pending" }, 409);
    if (Date.now() > (proposal.expiresAt as number))
      return c.json({ error: "Proposal expired" }, 410);

    const ct = proposal.collateralToken as string;
    const isUsdCollateral = ct === config.TOKEN_ADDRESS.toLowerCase();
    const score = await getCreditScore(proposal.borrower as string);
    const multiplier = getCollateralMultiplier(score.tier);
    const principalBig = BigInt(proposal.principal as string);
    const collateralAmountBig = BigInt(proposal.collateralAmount as string);
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
    if (requiredCollateral > collateralAmountBig)
      requiredCollateral = collateralAmountBig;

    const loanId = crypto.randomUUID();
    await LoanModel.create({
      loanId,
      borrower: proposal.borrower,
      token: proposal.token,
      principal: proposal.principal,
      matchedTicks: proposal.matchedTicks,
      effectiveBorrowerRate: proposal.effectiveBorrowerRate,
      collateralToken: proposal.collateralToken,
      collateralAmount: proposal.collateralAmount,
      requiredCollateral: requiredCollateral.toString(),
      maturity: Date.now() + 30 * 24 * 60 * 60 * 1000,
      status: "active",
      repaidAmount: "0",
    });

    proposal.status = "accepted";
    await proposal.save();

    await BorrowIntentModel.updateOne(
      { intentId: proposal.borrowIntentId },
      { status: "matched" },
    );

    const ticks = proposal.matchedTicks as Array<{
      lender: string;
      lendIntentId: string;
      amount: string;
      rate: number;
    }>;
    for (const tick of ticks) {
      const tickAmount = BigInt(tick.amount);
      const lendIntent = await LendIntentModel.findOne({ intentId: tick.lendIntentId });
      if (lendIntent) {
        const lendAmount = BigInt(lendIntent.amount as string);
        if (tickAmount >= lendAmount) {
          await LendIntentModel.deleteOne({ intentId: tick.lendIntentId });
        } else {
          lendIntent.amount = (lendAmount - tickAmount).toString();
          await lendIntent.save();
        }
      }
      await debitBalance(tick.lender, proposal.token as string, tickAmount);
    }

    const transferId = await queueTransfer(
      proposal.borrower as string,
      proposal.token as string,
      proposal.principal as string,
      "disburse",
    );

    return c.json({
      status: "accepted",
      loanId,
      transferId,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};

export const claimExcessCollateral = async (c: Context) => {
  try {
    const { account, loanId, timestamp, auth } = await c.req.json();

    if (!account || !loanId || !timestamp || !auth)
      return c.json({ error: "Missing required fields" }, 400);

    authenticate(
      "Claim Excess Collateral",
      { account, loanId, timestamp },
      auth,
      account,
    );

    const loan = await LoanModel.findOne({ loanId });
    if (!loan) return c.json({ error: "Loan not found" }, 404);
    if (loan.borrower !== account.toLowerCase())
      return c.json({ error: "Not loan owner" }, 403);
    if (loan.status !== "active")
      return c.json({ error: "Loan not active" }, 409);

    const collateralAmountBig = BigInt(loan.collateralAmount as string);
    const requiredCollateralBig = BigInt(loan.requiredCollateral as string);
    const excess = collateralAmountBig - requiredCollateralBig;
    if (excess <= 0n)
      return c.json({
        error: "No excess collateral",
        locked: loan.collateralAmount,
        required: loan.requiredCollateral,
      }, 400);

    loan.collateralAmount = requiredCollateralBig.toString();
    await loan.save();

    const transferId = await queueTransfer(
      loan.borrower as string,
      loan.collateralToken as string,
      excess.toString(),
      "return-collateral",
    );

    return c.json({
      status: "excess_claimed",
      loanId,
      excessReturned: excess.toString(),
      remainingCollateral: requiredCollateralBig.toString(),
      transferId,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};

export const rejectProposal = async (c: Context) => {
  try {
    const { account, proposalId, timestamp, auth } = await c.req.json();

    if (!account || !proposalId || !timestamp || !auth)
      return c.json({ error: "Missing required fields" }, 400);

    authenticate(
      "Reject Proposal",
      { account, proposalId, timestamp },
      auth,
      account,
    );

    const proposal = await MatchProposalModel.findOne({ proposalId });
    if (!proposal) return c.json({ error: "Proposal not found" }, 404);
    if ((proposal.borrower as string).toLowerCase() !== account.toLowerCase())
      return c.json({ error: "Not proposal owner" }, 403);
    if (proposal.status !== "pending")
      return c.json({ error: "Proposal not pending" }, 409);

    const collateralAmountBig = BigInt(proposal.collateralAmount as string);
    const slashAmount = (collateralAmountBig * BigInt(5)) / BigInt(100);
    const returnAmount = collateralAmountBig - slashAmount;

    const transferId = await queueTransfer(
      proposal.borrower as string,
      proposal.collateralToken as string,
      returnAmount.toString(),
      "return-collateral",
    );

    proposal.status = "rejected";
    await proposal.save();

    await BorrowIntentModel.updateOne(
      { intentId: proposal.borrowIntentId },
      { status: "rejected" },
    );

    const ticks = proposal.matchedTicks as Array<{
      lender: string;
      lendIntentId: string;
      amount: string;
      rate: number;
    }>;
    for (const tick of ticks) {
      const lendIntent = await LendIntentModel.findOne({ intentId: tick.lendIntentId });
      if (lendIntent) {
        const existing = BigInt(lendIntent.amount as string);
        lendIntent.amount = (existing + BigInt(tick.amount)).toString();
        await lendIntent.save();
      }
    }

    return c.json({
      status: "rejected",
      slashed: slashAmount.toString(),
      returned: returnAmount.toString(),
      transferId,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};
