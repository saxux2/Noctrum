import { Composer, InlineKeyboard } from "grammy";
import { ethers } from "ethers";
import { VAULT_ADDRESS } from "../config";
import {
  ERC20_ABI, VAULT_ABI, GHOST_DOMAIN,
  BORROW_TYPES, CANCEL_BORROW_TYPES,
  ACCEPT_PROPOSAL_TYPES, REJECT_PROPOSAL_TYPES,
} from "../constants";
import {
  ghostPost, ghostGet, privateTransfer, getPoolAddress, ensureGasBalance, ensureTokenBalance,
  ts, toWei, fmtEth, tokenSymbol, resolveToken, encryptRate,
} from "../api";
import { getProvider } from "../wallet";
import { requireWallet } from "../middleware";
import { escapeHtml, friendlyError, editProgress, editError } from "../ui";

const composer = new Composer();

// ── /borrow <amount> <token> <collateral> <collToken> <maxRate%> ──

composer.command("borrow", async (ctx) => {
  const parts = (ctx.match || "").trim().split(/\s+/);
  if (parts.length < 5) {
    const kb = new InlineKeyboard()
      .text("\u{1F4B5} Borrow gUSD", "borrow_example_gusd")
      .text("\u{1FA99} Borrow gETH", "borrow_example_geth");
    await ctx.reply(
      `\u{1F3E6} <b>Borrow Tokens</b>\n\n` +
      `<b>Usage:</b> <code>/borrow [amount] [token] [collateral] [collToken] [maxRate%]</code>\n\n` +
      `<b>Examples:</b>\n` +
      `<code>/borrow 800 gUSD 5 gETH 10</code>\nBorrow 800 gUSD with 5 gETH collateral, max 10% rate\n\n` +
      `<code>/borrow 500 gUSD 3 gETH 8</code>\nBorrow 500 gUSD with 3 gETH collateral, max 8% rate`,
      { parse_mode: "HTML", reply_markup: kb },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const borrowAmt = parseFloat(parts[0]);
  const borrowToken = resolveToken(parts[1]);
  const collateralAmt = parseFloat(parts[2]);
  const collateralToken = resolveToken(parts[3]);
  const maxRate = parseFloat(parts[4]);

  if (isNaN(borrowAmt) || borrowAmt <= 0) { await ctx.reply("\u{274C} Invalid borrow amount."); return; }
  if (!borrowToken) { await ctx.reply("\u{274C} Unknown borrow token. Use <b>gUSD</b> or <b>gETH</b>.", { parse_mode: "HTML" }); return; }
  if (isNaN(collateralAmt) || collateralAmt <= 0) { await ctx.reply("\u{274C} Invalid collateral amount."); return; }
  if (!collateralToken) { await ctx.reply("\u{274C} Unknown collateral token. Use <b>gUSD</b> or <b>gETH</b>.", { parse_mode: "HTML" }); return; }
  if (isNaN(maxRate) || maxRate <= 0 || maxRate > 100) { await ctx.reply("\u{274C} Max rate must be between 0-100%."); return; }

  const msg = await ctx.reply(
    `\u{23F3} <b>Borrow Flow Starting...</b>\n\n` +
    `\u{1FA99} ${borrowAmt} ${tokenSymbol(borrowToken)}\n` +
    `\u{1F512} Collateral: ${collateralAmt} ${tokenSymbol(collateralToken)}\n` +
    `\u{1F4C8} Max Rate: ${maxRate}%\n\n` +
    `Step 1/4: Checking balances...`,
    { parse_mode: "HTML" },
  );

  try {
    // Pre-flight: check gas + collateral token balance
    const prov = getProvider();
    await ensureGasBalance(wallet.address, prov);
    const borrowWei = toWei(borrowAmt);
    const collateralWei = toWei(collateralAmt);
    await ensureTokenBalance(wallet.address, collateralToken, collateralWei, prov);
    const rateDecimal = (maxRate / 100).toFixed(2);

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Borrow Flow</b>\n\nStep 1/4: Approving collateral...`,
    );

    // Step 1: Approve collateral
    const tokenContract = new ethers.Contract(collateralToken, ERC20_ABI, wallet);
    const approveTx = await tokenContract.approve(VAULT_ADDRESS, ethers.MaxUint256);
    await approveTx.wait();
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Borrow Flow</b>\n\n\u{2705} Step 1/4: Approved\nStep 2/4: Depositing collateral...`,
    );

    // Step 2: Deposit collateral
    const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
    const depositTx = await vault.deposit(collateralToken, collateralWei);
    await depositTx.wait();
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Borrow Flow</b>\n\n\u{2705} Step 1/4: Approved\n\u{2705} Step 2/4: Deposited\nStep 3/4: Transferring collateral to pool...`,
    );

    // Step 3: Private transfer to pool
    const poolAddr = await getPoolAddress();
    await privateTransfer(wallet, poolAddr, collateralToken, collateralWei);
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Borrow Flow</b>\n\n\u{2705} Step 1/4: Approved\n\u{2705} Step 2/4: Deposited\n\u{2705} Step 3/4: Transferred\nStep 4/4: Submitting borrow intent...`,
    );

    // Step 4: Submit borrow intent
    const encrypted = encryptRate(rateDecimal);
    const timestamp = ts();
    const borrowMsg = {
      account: wallet.address,
      token: borrowToken,
      amount: borrowWei,
      collateralToken,
      collateralAmount: collateralWei,
      encryptedMaxRate: encrypted,
      timestamp,
    };
    const auth = await wallet.signTypedData(GHOST_DOMAIN, BORROW_TYPES, borrowMsg);
    const result = await ghostPost("/api/v1/borrow-intent", { ...borrowMsg, auth });

    const kb = new InlineKeyboard()
      .text("\u{1F4CA} Borrower Status", "action_borrower_status")
      .text("\u{2190} Main Menu", "action_main_menu");

    await ctx.api.editMessageText(msg.chat.id, msg.message_id,
      `\u{2705} <b>Borrow Intent Submitted!</b>\n\n` +
      `\u{1FA99} Borrow: <code>${borrowAmt} ${tokenSymbol(borrowToken)}</code>\n` +
      `\u{1F512} Collateral: <code>${collateralAmt} ${tokenSymbol(collateralToken)}</code>\n` +
      `\u{1F4C8} Max Rate: <code>${maxRate}%</code> (encrypted)\n` +
      `\u{1F4CB} Intent ID: <code>${result.intentId}</code>\n\n` +
      `CRE will match you with the cheapest lenders.\n` +
      `Cancel with: <code>/cancel_borrow ${result.intentId}</code>`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  } catch (err: any) {
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{274C} <b>Borrow Failed</b>\n\n${escapeHtml(friendlyError(err))}`,
    );
  }
});

// ── /cancel_borrow <intentId> ──

composer.command("cancel_borrow", async (ctx) => {
  const intentId = (ctx.match || "").trim();
  if (!intentId) {
    await ctx.reply(
      `\u{274C} <b>Missing intent ID</b>\n\n` +
      `<b>Usage:</b> <code>/cancel_borrow &lt;intentId&gt;</code>\n\n` +
      `Find your intent ID with /borrower_status`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Cancelling borrow intent...");
  try {
    const timestamp = ts();
    const message = { account: wallet.address, intentId, timestamp };
    const auth = await wallet.signTypedData(GHOST_DOMAIN, CANCEL_BORROW_TYPES, message);
    const result = await ghostPost("/api/v1/cancel-borrow", { ...message, auth });
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Borrow Cancelled</b>\n\nTransfer ID: <code>${result.transferId}</code>\nCollateral will be returned.`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── /borrower_status ──

composer.command("borrower_status", async (ctx) => {
  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Fetching borrower status...");
  try {
    const data = await ghostGet(`/api/v1/borrower-status/${wallet.address}`);
    const intents = data.pendingIntents ?? [];
    const proposals = data.pendingProposals ?? [];
    const loans = data.activeLoans ?? [];

    let text = `\u{1F3E6} <b>Borrower Status</b>\n<code>${wallet.address}</code>\n\n`;

    if (intents.length > 0) {
      text += `<b>\u{1F4CB} Pending Intents (${intents.length})</b>\n`;
      for (const i of intents) {
        text += `\u{2022} <code>${fmtEth(i.amount)}</code> ${tokenSymbol(i.token)} | Collateral: <code>${fmtEth(i.collateralAmount)}</code> ${tokenSymbol(i.collateralToken)} | ${i.status}\n`;
      }
      text += "\n";
    }

    if (proposals.length > 0) {
      text += `<b>\u{1F514} Pending Proposals (${proposals.length})</b>\n`;
      for (const p of proposals) {
        text += `\u{2022} <code>${fmtEth(p.principal)}</code> ${tokenSymbol(p.token)} @ ${(p.effectiveRate * 100).toFixed(1)}%\n`;
        text += `  ID: <code>${p.proposalId}</code>\n`;
        text += `  /accept_proposal ${p.proposalId}\n`;
        text += `  /reject_proposal ${p.proposalId}\n\n`;
      }
    }

    if (loans.length > 0) {
      text += `<b>\u{1FA99} Active Loans (${loans.length})</b>\n`;
      for (const l of loans) {
        text += `\u{2022} <code>${fmtEth(l.principal)}</code> ${tokenSymbol(l.token)} @ ${(l.effectiveRate * 100).toFixed(1)}%\n`;
        text += `  Total Due: <code>${fmtEth(l.totalDue)}</code> | Repaid: <code>${fmtEth(l.repaidAmount)}</code>\n`;
        text += `  Collateral: <code>${fmtEth(l.collateralAmount)}</code> ${tokenSymbol(l.collateralToken)}\n`;
        text += `  Excess: <code>${fmtEth(l.excessCollateral)}</code> | Maturity: ${l.maturityDate?.slice(0, 10)}\n`;
        text += `  Loan ID: <code>${l.loanId}</code>\n\n`;
      }
    }

    if (intents.length === 0 && proposals.length === 0 && loans.length === 0) {
      text += "No active borrow positions.\n\nStart with /borrow to get a loan.";
    }

    await editProgress(ctx, msg.chat.id, msg.message_id, text);
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── /accept_proposal <proposalId> ──

composer.command("accept_proposal", async (ctx) => {
  const proposalId = (ctx.match || "").trim();
  if (!proposalId) {
    await ctx.reply(
      `\u{274C} <b>Missing proposal ID</b>\n\n` +
      `<b>Usage:</b> <code>/accept_proposal &lt;proposalId&gt;</code>\n\n` +
      `Find proposals with /borrower_status`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Accepting proposal...");
  try {
    const timestamp = ts();
    const message = { account: wallet.address, proposalId, timestamp };
    const auth = await wallet.signTypedData(GHOST_DOMAIN, ACCEPT_PROPOSAL_TYPES, message);
    const result = await ghostPost("/api/v1/accept-proposal", { ...message, auth });
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Proposal Accepted!</b>\n\n` +
      `\u{1F4CB} Loan ID: <code>${result.loanId}</code>\n` +
      `\u{1FA99} Disbursement Transfer: <code>${result.transferId}</code>\n\n` +
      `Funds will be disbursed to your vault via private transfer.`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── /reject_proposal <proposalId> ──

composer.command("reject_proposal", async (ctx) => {
  const proposalId = (ctx.match || "").trim();
  if (!proposalId) {
    await ctx.reply(
      `\u{274C} <b>Missing proposal ID</b>\n\n` +
      `<b>Usage:</b> <code>/reject_proposal &lt;proposalId&gt;</code>\n\n` +
      `Find proposals with /borrower_status`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Rejecting proposal (5% collateral slashed)...");
  try {
    const timestamp = ts();
    const message = { account: wallet.address, proposalId, timestamp };
    const auth = await wallet.signTypedData(GHOST_DOMAIN, REJECT_PROPOSAL_TYPES, message);
    const result = await ghostPost("/api/v1/reject-proposal", { ...message, auth });
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Proposal Rejected</b>\n\n` +
      `\u{274C} Slashed: <code>${fmtEth(result.slashed)}</code>\n` +
      `\u{2705} Returned: <code>${fmtEth(result.returned)}</code>\n` +
      `Transfer ID: <code>${result.transferId}</code>`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── Borrow example callbacks ──

composer.callbackQuery("borrow_example_gusd", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{1F4B5} <b>Borrow gUSD Example</b>\n\n` +
    `<code>/borrow 800 gUSD 5 gETH 10</code>\n\n` +
    `Borrow 800 gUSD, put up 5 gETH as collateral, max 10% rate.\n` +
    `Adjust amounts to your needs.`,
    { parse_mode: "HTML" },
  );
});

composer.callbackQuery("borrow_example_geth", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{1FA99} <b>Borrow gETH Example</b>\n\n` +
    `<code>/borrow 2 gETH 5000 gUSD 8</code>\n\n` +
    `Borrow 2 gETH, put up 5000 gUSD as collateral, max 8% rate.\n` +
    `Adjust amounts to your needs.`,
    { parse_mode: "HTML" },
  );
});

composer.callbackQuery("action_borrower_status", async (ctx) => {
  await ctx.answerCallbackQuery();
  const wallet = requireWallet(ctx.from.id);
  const msg = await ctx.reply("\u{23F3} Fetching borrower status...");
  try {
    const data = await ghostGet(`/api/v1/borrower-status/${wallet.address}`);
    const intents = data.pendingIntents ?? [];
    const proposals = data.pendingProposals ?? [];
    const loans = data.activeLoans ?? [];
    let text = `\u{1F3E6} <b>Borrower Status</b>\n\n`;
    if (intents.length === 0 && proposals.length === 0 && loans.length === 0) text += "No active borrow positions.";
    else {
      for (const i of intents) text += `\u{2022} <code>${fmtEth(i.amount)}</code> ${tokenSymbol(i.token)} | ${i.status}\n`;
      for (const p of proposals) text += `\u{1F514} <code>${fmtEth(p.principal)}</code> ${tokenSymbol(p.token)} @ ${(p.effectiveRate * 100).toFixed(1)}% — /accept_proposal ${p.proposalId}\n`;
      for (const l of loans) text += `\u{1FA99} <code>${fmtEth(l.principal)}</code> ${tokenSymbol(l.token)} | Due: <code>${fmtEth(l.totalDue)}</code>\n`;
    }
    await editProgress(ctx, msg.chat.id, msg.message_id, text);
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── Menu callback ──

composer.callbackQuery("menu_borrow", async (ctx) => {
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("\u{1F4B5} Borrow gUSD", "borrow_example_gusd")
    .text("\u{1FA99} Borrow gETH", "borrow_example_geth").row()
    .text("\u{1F4CA} My Status", "action_borrower_status")
    .text("\u{274C} Cancel Borrow", "borrow_cancel_help");
  await ctx.reply(
    `\u{1F3E6} <b>Borrow Tokens</b>\n\n` +
    `Get a loan with collateral and encrypted max rate.\n\n` +
    `<b>Quick start:</b>\n` +
    `<code>/borrow 800 gUSD 5 gETH 10</code>\n` +
    `Borrow 800 gUSD, 5 gETH collateral, max 10%\n\n` +
    `Use /collateral_quote to check how much collateral you need.`,
    { parse_mode: "HTML", reply_markup: kb },
  );
});

composer.callbackQuery("borrow_cancel_help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{274C} <b>Cancel a Borrow</b>\n\n` +
    `<code>/cancel_borrow &lt;intentId&gt;</code>\n\n` +
    `Find your intent ID with /borrower_status`,
    { parse_mode: "HTML" },
  );
});

export default composer;
