import { Composer, InlineKeyboard } from "grammy";
import { ethers } from "ethers";
import { VAULT_ADDRESS } from "../config";
import { ERC20_ABI, VAULT_ABI, GHOST_DOMAIN, CONFIRM_DEPOSIT_TYPES, CANCEL_LEND_TYPES } from "../constants";
import {
  ghostPost, ghostGet, privateTransfer, getPoolAddress, ensureGasBalance, ensureTokenBalance,
  ts, toWei, fmtEth, tokenSymbol, resolveToken, encryptRate,
} from "../api";
import { getProvider } from "../wallet";
import { requireWallet } from "../middleware";
import { escapeHtml, friendlyError, editProgress, editError } from "../ui";

const composer = new Composer();

// ── /lend <amount> <token> <rate%> ──

composer.command("lend", async (ctx) => {
  const parts = (ctx.match || "").trim().split(/\s+/);
  if (parts.length < 3) {
    const kb = new InlineKeyboard()
      .text("\u{1FA99} Lend gUSD", "lend_example_gusd")
      .text("\u{1FA99} Lend gETH", "lend_example_geth");
    await ctx.reply(
      `\u{1FA99} <b>Lend Tokens</b>\n\n` +
      `<b>Usage:</b> <code>/lend [amount] [token] [rate%]</code>\n\n` +
      `<b>Examples:</b>\n` +
      `<code>/lend 500 gUSD 5</code> — Lend 500 gUSD at 5%\n` +
      `<code>/lend 2 gETH 3.5</code> — Lend 2 gETH at 3.5%\n\n` +
      `Rate is encrypted and hidden from everyone except the matching engine.`,
      { parse_mode: "HTML", reply_markup: kb },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const amount = parseFloat(parts[0]);
  const token = resolveToken(parts[1]);
  const rate = parseFloat(parts[2]);

  if (isNaN(amount) || amount <= 0) { await ctx.reply("\u{274C} Invalid amount."); return; }
  if (!token) { await ctx.reply("\u{274C} Unknown token. Use <b>gUSD</b> or <b>gETH</b>.", { parse_mode: "HTML" }); return; }
  if (isNaN(rate) || rate <= 0 || rate > 100) { await ctx.reply("\u{274C} Rate must be between 0-100%."); return; }

  const msg = await ctx.reply(
    `\u{23F3} <b>Lend Flow Starting...</b>\n\n` +
    `\u{1FA99} ${amount} ${tokenSymbol(token)} @ ${rate}%\n` +
    `Step 1/4: Checking balances...`,
    { parse_mode: "HTML" },
  );

  try {
    // Pre-flight: check gas + token balance
    const prov = getProvider();
    await ensureGasBalance(wallet.address, prov);
    const amountWei = toWei(amount);
    await ensureTokenBalance(wallet.address, token, amountWei, prov);
    const rateDecimal = (rate / 100).toString();

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Lend Flow</b>\n\n` +
      `Step 1/4: Approving token...`,
    );

    // Step 1: Approve
    const tokenContract = new ethers.Contract(token, ERC20_ABI, wallet);
    const approveTx = await tokenContract.approve(VAULT_ADDRESS, ethers.MaxUint256);
    await approveTx.wait();
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Lend Flow</b>\n\n\u{2705} Step 1/4: Approved\nStep 2/4: Depositing into vault...`,
    );

    // Step 2: Deposit
    const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
    const depositTx = await vault.deposit(token, amountWei);
    await depositTx.wait();
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Lend Flow</b>\n\n\u{2705} Step 1/4: Approved\n\u{2705} Step 2/4: Deposited\nStep 3/4: Transferring to pool...`,
    );

    // Step 3: Init + Private transfer
    const init = await ghostPost("/api/v1/deposit-lend/init", {
      account: wallet.address,
      token,
      amount: amountWei,
    });

    const poolAddr = await getPoolAddress();
    await privateTransfer(wallet, poolAddr, token, amountWei);
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{23F3} <b>Lend Flow</b>\n\n\u{2705} Step 1/4: Approved\n\u{2705} Step 2/4: Deposited\n\u{2705} Step 3/4: Transferred\nStep 4/4: Confirming with encrypted rate...`,
    );

    // Step 4: Confirm
    const encrypted = encryptRate(rateDecimal);
    const timestamp = ts();
    const confirmMsg = { account: wallet.address, slotId: init.slotId, encryptedRate: encrypted, timestamp };
    const auth = await wallet.signTypedData(GHOST_DOMAIN, CONFIRM_DEPOSIT_TYPES, confirmMsg);
    const result = await ghostPost("/api/v1/deposit-lend/confirm", { ...confirmMsg, auth });

    const kb = new InlineKeyboard()
      .text("\u{1F4CA} Lender Status", "action_lender_status")
      .text("\u{2190} Main Menu", "action_main_menu");

    await ctx.api.editMessageText(msg.chat.id, msg.message_id,
      `\u{2705} <b>Lend Intent Published!</b>\n\n` +
      `\u{1FA99} Amount: <code>${amount} ${tokenSymbol(token)}</code>\n` +
      `\u{1F512} Rate: <code>${rate}%</code> (encrypted)\n` +
      `\u{1F4CB} Intent ID: <code>${result.intentId}</code>\n` +
      `\u{1F4CB} Slot ID: <code>${init.slotId}</code>\n\n` +
      `Your funds are now in the lending pool.\n` +
      `Cancel with: <code>/cancel_lend ${init.slotId}</code>`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  } catch (err: any) {
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{274C} <b>Lend Failed</b>\n\n${escapeHtml(friendlyError(err))}`,
    );
  }
});

// ── /cancel_lend <slotId> ──

composer.command("cancel_lend", async (ctx) => {
  const slotId = (ctx.match || "").trim();
  if (!slotId) {
    await ctx.reply(
      `\u{274C} <b>Missing slot ID</b>\n\n` +
      `<b>Usage:</b> <code>/cancel_lend &lt;slotId&gt;</code>\n\n` +
      `Find your slot ID with /lender_status`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Cancelling lend intent...");
  try {
    const timestamp = ts();
    const message = { account: wallet.address, slotId, timestamp };
    const auth = await wallet.signTypedData(GHOST_DOMAIN, CANCEL_LEND_TYPES, message);
    const result = await ghostPost("/api/v1/cancel-lend", { ...message, auth });
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Lend Cancelled</b>\n\nTransfer ID: <code>${result.transferId}</code>\nFunds will be returned via private transfer.`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── /lender_status ──

composer.command("lender_status", async (ctx) => {
  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Fetching lender status...");
  try {
    const data = await ghostGet(`/api/v1/lender-status/${wallet.address}`);
    const lends = data.activeLends ?? [];
    const loans = data.activeLoans ?? [];
    const pendingPay = data.pendingPayouts ?? [];

    let text = `\u{1FA99} <b>Lender Status</b>\n<code>${wallet.address}</code>\n\n`;

    if (lends.length > 0) {
      text += `<b>\u{1F4CB} Active Lend Intents (${lends.length})</b>\n`;
      for (const l of lends) {
        text += `\u{2022} <code>${fmtEth(l.amount)}</code> ${tokenSymbol(l.token)} | Slot: <code>${l.slotId?.slice(0, 8) ?? "n/a"}...</code>\n`;
      }
      text += "\n";
    }

    if (loans.length > 0) {
      text += `<b>\u{1FA99} Active Loans Earning (${loans.length})</b>\n`;
      for (const l of loans) {
        text += `\u{2022} <code>${fmtEth(l.principal)}</code> ${tokenSymbol(l.token)} @ ${(l.rate * 100).toFixed(1)}% | Maturity: ${l.maturityDate?.slice(0, 10)}\n`;
      }
      text += "\n";
    }

    if (pendingPay.length > 0) {
      text += `<b>\u{1F4B0} Pending Payouts (${pendingPay.length})</b>\n`;
      for (const p of pendingPay) {
        text += `\u{2022} <code>${fmtEth(p.amount)}</code> ${tokenSymbol(p.token)} (${p.reason})\n`;
      }
      text += "\n";
    }

    if (lends.length === 0 && loans.length === 0 && pendingPay.length === 0) {
      text += "No active lend positions.\n\nStart with /lend to earn yield.";
    }

    await editProgress(ctx, msg.chat.id, msg.message_id, text);
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── Lend example callbacks ──

composer.callbackQuery("lend_example_gusd", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{1FA99} <b>Lend gUSD Example</b>\n\n` +
    `<code>/lend 500 gUSD 5</code>\n\n` +
    `This lends 500 gUSD at 5% interest rate.\n` +
    `Change the amount and rate to your preference.`,
    { parse_mode: "HTML" },
  );
});

composer.callbackQuery("lend_example_geth", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{1FA99} <b>Lend gETH Example</b>\n\n` +
    `<code>/lend 2 gETH 3.5</code>\n\n` +
    `This lends 2 gETH at 3.5% interest rate.\n` +
    `Change the amount and rate to your preference.`,
    { parse_mode: "HTML" },
  );
});

composer.callbackQuery("action_lender_status", async (ctx) => {
  await ctx.answerCallbackQuery();
  const wallet = requireWallet(ctx.from.id);
  const msg = await ctx.reply("\u{23F3} Fetching lender status...");
  try {
    const data = await ghostGet(`/api/v1/lender-status/${wallet.address}`);
    const lends = data.activeLends ?? [];
    const loans = data.activeLoans ?? [];
    let text = `\u{1FA99} <b>Lender Status</b>\n\n`;
    if (lends.length === 0 && loans.length === 0) text += "No active lend positions.";
    else {
      for (const l of lends) text += `\u{2022} <code>${fmtEth(l.amount)}</code> ${tokenSymbol(l.token)} | Slot: <code>${l.slotId?.slice(0, 8)}...</code>\n`;
      for (const l of loans) text += `\u{2022} <code>${fmtEth(l.principal)}</code> ${tokenSymbol(l.token)} @ ${(l.rate * 100).toFixed(1)}%\n`;
    }
    await editProgress(ctx, msg.chat.id, msg.message_id, text);
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── Menu callback ──

composer.callbackQuery("menu_lend", async (ctx) => {
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("\u{1FA99} Lend gUSD", "lend_example_gusd")
    .text("\u{1FA99} Lend gETH", "lend_example_geth").row()
    .text("\u{1F4CA} My Positions", "action_lender_status")
    .text("\u{274C} Cancel Lend", "lend_cancel_help");
  await ctx.reply(
    `\u{1FA99} <b>Lend Tokens</b>\n\n` +
    `Earn yield by lending your tokens with encrypted rates.\n\n` +
    `<b>Quick start:</b>\n` +
    `<code>/lend 500 gUSD 5</code> — Lend 500 gUSD at 5%\n` +
    `<code>/lend 2 gETH 3.5</code> — Lend 2 gETH at 3.5%`,
    { parse_mode: "HTML", reply_markup: kb },
  );
});

composer.callbackQuery("lend_cancel_help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{274C} <b>Cancel a Lend</b>\n\n` +
    `<code>/cancel_lend &lt;slotId&gt;</code>\n\n` +
    `Find your slot ID with /lender_status`,
    { parse_mode: "HTML" },
  );
});

export default composer;
