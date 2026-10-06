import { Composer, InlineKeyboard } from "grammy";
import { ethers } from "ethers";
import { VAULT_ADDRESS } from "../config";
import { ERC20_ABI, VAULT_ABI, GHOST_DOMAIN, REPAY_LOAN_TYPES, CLAIM_EXCESS_COLLATERAL_TYPES } from "../constants";
import { ghostPost, ghostGet, privateTransfer, getPoolAddress, ensureGasBalance, ensureTokenBalance, ts, fmtEth, tokenSymbol } from "../api";
import { getProvider } from "../wallet";
import { requireWallet } from "../middleware";
import { escapeHtml, friendlyError, editProgress, editError } from "../ui";

const composer = new Composer();

// ── /active_loans ──

composer.command("active_loans", async (ctx) => {
  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Fetching active loans...");
  try {
    const [bData, lData] = await Promise.all([
      ghostGet(`/api/v1/borrower-status/${wallet.address}`),
      ghostGet(`/api/v1/lender-status/${wallet.address}`),
    ]);
    const borrowLoans = bData.activeLoans ?? [];
    const lendLoans = lData.activeLoans ?? [];

    let text = `\u{1F4CB} <b>Active Loans</b>\n\n`;

    if (borrowLoans.length > 0) {
      text += `<b>\u{1F3E6} As Borrower (${borrowLoans.length})</b>\n`;
      for (const l of borrowLoans) {
        text += `\u{2022} <code>${fmtEth(l.principal)}</code> ${tokenSymbol(l.token)} @ ${(l.effectiveRate * 100).toFixed(1)}%\n`;
        text += `  Due: <code>${fmtEth(l.totalDue)}</code> | Maturity: ${l.maturityDate?.slice(0, 10)}\n`;
        text += `  ID: <code>${l.loanId}</code>\n\n`;
      }
    }

    if (lendLoans.length > 0) {
      text += `<b>\u{1FA99} As Lender (${lendLoans.length})</b>\n`;
      for (const l of lendLoans) {
        text += `\u{2022} <code>${fmtEth(l.principal)}</code> ${tokenSymbol(l.token)} @ ${(l.rate * 100).toFixed(1)}%\n`;
        text += `  Payout: <code>${fmtEth(l.expectedPayout)}</code> | Maturity: ${l.maturityDate?.slice(0, 10)}\n\n`;
      }
    }

    if (borrowLoans.length === 0 && lendLoans.length === 0) {
      text += "No active loans.";
    }

    await editProgress(ctx, msg.chat.id, msg.message_id, text);
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── /repay <loanId> ──

composer.command("repay", async (ctx) => {
  const loanId = (ctx.match || "").trim();
  if (!loanId) {
    await ctx.reply(
      `\u{274C} <b>Missing loan ID</b>\n\n` +
      `<b>Usage:</b> <code>/repay &lt;loanId&gt;</code>\n\n` +
      `Find your loan ID with /active_loans or /borrower_status`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Calculating repayment amount...");

  try {
    // Pre-flight: check gas
    const prov = getProvider();
    await ensureGasBalance(wallet.address, prov);

    const bData = await ghostGet(`/api/v1/borrower-status/${wallet.address}`);
    const loan = (bData.activeLoans ?? []).find((l: any) => l.loanId === loanId);
    if (!loan) throw new Error("Loan not found or not active.");

    const { totalDue, token } = loan;
    await ensureTokenBalance(wallet.address, token, totalDue, prov);

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Repaying Loan</b>\n\n` +
      `Total due: <code>${fmtEth(totalDue)}</code> ${tokenSymbol(token)}\n` +
      `Step 1/3: Approving + depositing into vault...`,
    );

    // Step 1: Approve + deposit
    const tokenContract = new ethers.Contract(token, ERC20_ABI, wallet);
    const approveTx = await tokenContract.approve(VAULT_ADDRESS, totalDue);
    await approveTx.wait();
    const vaultContract = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
    const depositTx = await vaultContract.deposit(token, totalDue);
    await depositTx.wait();

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Repaying Loan</b>\n\n\u{2705} Step 1/3: Deposited\nStep 2/3: Transferring to pool...`,
    );

    // Step 2: Private transfer to pool
    const poolAddr = await getPoolAddress();
    await privateTransfer(wallet, poolAddr, token, totalDue);

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Repaying Loan</b>\n\n\u{2705} Step 1/3: Deposited\n\u{2705} Step 2/3: Transferred\nStep 3/3: Submitting repayment...`,
    );

    // Step 3: Call repay
    const timestamp = ts();
    const repayMsg = { account: wallet.address, loanId, amount: totalDue, timestamp };
    const auth = await wallet.signTypedData(GHOST_DOMAIN, REPAY_LOAN_TYPES, repayMsg);
    const result = await ghostPost("/api/v1/repay", { ...repayMsg, auth });

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Loan Repaid!</b>\n\n` +
      `\u{1FA99} Total Paid: <code>${fmtEth(result.totalPaid)}</code> ${tokenSymbol(token)}\n` +
      `\u{1F512} Collateral Return Transfer: <code>${result.transferId}</code>\n\n` +
      `Your collateral will be returned via private transfer.\n` +
      `Credit tier may have been upgraded!`,
    );
  } catch (err: any) {
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{274C} <b>Repay Failed</b>\n\n${escapeHtml(friendlyError(err))}`,
    );
  }
});

// ── /claim_collateral <loanId> ──

composer.command("claim_collateral", async (ctx) => {
  const loanId = (ctx.match || "").trim();
  if (!loanId) {
    await ctx.reply(
      `\u{274C} <b>Missing loan ID</b>\n\n` +
      `<b>Usage:</b> <code>/claim_collateral &lt;loanId&gt;</code>\n\n` +
      `Find your loan ID with /borrower_status`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Claiming excess collateral...");
  try {
    const timestamp = ts();
    const message = { account: wallet.address, loanId, timestamp };
    const auth = await wallet.signTypedData(GHOST_DOMAIN, CLAIM_EXCESS_COLLATERAL_TYPES, message);
    const result = await ghostPost("/api/v1/claim-excess-collateral", { ...message, auth });
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Excess Collateral Claimed!</b>\n\n` +
      `\u{1FA99} Returned: <code>${fmtEth(result.excessReturned)}</code>\n` +
      `\u{1F512} Remaining: <code>${fmtEth(result.remainingCollateral)}</code>\n` +
      `Transfer ID: <code>${result.transferId}</code>`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

export default composer;
