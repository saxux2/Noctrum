import type { Context } from "hono";
import { authenticate } from "../auth";
import LoanModel from "../models/loan.model";
import CreditScoreModel from "../models/credit-score.model";
import { creditBalance, queueTransfer, getCreditScore, upgradeTier } from "../state";

export const repayLoan = async (c: Context) => {
  try {
    const { account, loanId, amount, timestamp, auth } = await c.req.json();

    if (!account || !loanId || !amount || !timestamp || !auth)
      return c.json({ error: "Missing required fields" }, 400);

    authenticate(
      "Repay Loan",
      { account, loanId, amount, timestamp },
      auth,
      account
    );

    const loan = await LoanModel.findOne({ loanId });
    if (!loan) return c.json({ error: "Loan not found" }, 404);
    if (loan.borrower !== account.toLowerCase())
      return c.json({ error: "Not loan owner" }, 403);
    if (loan.status !== "active")
      return c.json({ error: "Loan not active" }, 409);

    // Calculate total owed
    let totalOwed = 0n;
    for (const tick of loan.matchedTicks) {
      const tickAmount = BigInt(tick.amount as string);
      const interest = BigInt(Math.floor(Number(tickAmount) * (tick.rate as number)));
      totalOwed += tickAmount + interest;
    }

    const repayAmount = BigInt(amount);
    if (repayAmount < totalOwed)
      return c.json(
        {
          error: "Insufficient repayment",
          required: totalOwed.toString(),
          provided: repayAmount.toString(),
        },
        400
      );

    // Queue repayment transfers: principal + interest to each lender
    const lenderTransferIds: string[] = [];
    for (const tick of loan.matchedTicks) {
      const tickAmount = BigInt(tick.amount as string);
      const interest = BigInt(Math.floor(Number(tickAmount) * (tick.rate as number)));
      const payout = tickAmount + interest;
      await creditBalance(tick.lender as string, loan.token as string, payout);
      const tid = await queueTransfer(
        tick.lender as string,
        loan.token as string,
        payout.toString(),
        "repay-lender"
      );
      lenderTransferIds.push(tid);
    }

    // Queue collateral return
    const transferId = await queueTransfer(
      loan.borrower as string,
      loan.collateralToken as string,
      loan.collateralAmount as string,
      "return-collateral-repay"
    );

    loan.status = "repaid";
    loan.repaidAmount = repayAmount.toString();
    await loan.save();

    // Upgrade borrower credit tier on successful repay
    const score = await getCreditScore(loan.borrower as string);
    await CreditScoreModel.updateOne(
      { address: (loan.borrower as string).toLowerCase() },
      { $inc: { loansRepaid: 1 } }
    );
    await upgradeTier(loan.borrower as string);

    return c.json({
      status: "repaid",
      loanId,
      totalPaid: repayAmount.toString(),
      transferId,
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 401);
  }
};
