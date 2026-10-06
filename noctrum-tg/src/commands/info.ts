import { Composer, InlineKeyboard } from "grammy";
import { ghostGet, getOnChainBalances, getVaultBalances, toWei, fmtEth, tokenSymbol, resolveToken } from "../api";
import { hasWallet, getWallet, getProvider } from "../wallet";
import { requireWallet } from "../middleware";
import { escapeHtml, editProgress, editError } from "../ui";

const composer = new Composer();

// ── /balance ──

composer.command("balance", async (ctx) => {
  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Fetching on-chain balances...");
  try {
    const bal = await getOnChainBalances(wallet.address, getProvider());
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{1F4B0} <b>On-Chain Balances</b>\n\n` +
      `\u{1F464} <code>${wallet.address}</code>\n\n` +
      `\u{1FA99} gUSD: <code>${fmtEth(bal.gUSD)}</code>\n` +
      `\u{1FA99} gETH: <code>${fmtEth(bal.gETH)}</code>\n` +
      `\u{26AA} ETH:  <code>${fmtEth(bal.ETH)}</code>`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── /private_balance ──

composer.command("private_balance", async (ctx) => {
  const wallet = requireWallet(ctx.from!.id);
  const msg = await ctx.reply("\u{23F3} Fetching private vault balances...");
  try {
    const bal = await getVaultBalances(wallet);
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{1F512} <b>Private Vault Balances</b>\n\n` +
      `\u{1F464} <code>${wallet.address}</code>\n\n` +
      `\u{1FA99} gUSD: <code>${fmtEth(bal.gUSD)}</code>\n` +
      `\u{1FA99} gETH: <code>${fmtEth(bal.gETH)}</code>`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── /credit_score ──

composer.command("credit_score", async (ctx) => {
  const wallet = requireWallet(ctx.from!.id);
  try {
    const data = await ghostGet(`/api/v1/credit-score/${wallet.address}`);
    const tierEmoji: Record<string, string> = {
      bronze: "\u{1F949}", silver: "\u{1F948}", gold: "\u{1F947}", platinum: "\u{1F48E}",
    };
    await ctx.reply(
      `${tierEmoji[data.tier] ?? "\u{1F3C5}"} <b>Credit Score</b>\n\n` +
      `\u{1F464} <code>${wallet.address}</code>\n\n` +
      `Tier: <b>${data.tier.toUpperCase()}</b>\n` +
      `Collateral Multiplier: <code>${data.collateralMultiplier}x</code>\n` +
      `Loans Repaid: <code>${data.loansRepaid}</code>\n` +
      `Loans Defaulted: <code>${data.loansDefaulted}</code>\n` +
      `ETH/USD: <code>$${data.ethPrice?.toFixed(2)}</code>`,
      { parse_mode: "HTML" },
    );
  } catch (err: any) {
    await ctx.reply(`\u{274C} ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

// ── /collateral_quote ──

composer.command("collateral_quote", async (ctx) => {
  const parts = (ctx.match || "").trim().split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply("\u{26A0} Usage: <code>/collateral_quote 800 gUSD gETH</code>", { parse_mode: "HTML" });
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const amount = parseFloat(parts[0]);
  const token = resolveToken(parts[1]);
  const collToken = resolveToken(parts[2]);

  if (isNaN(amount) || !token || !collToken) { await ctx.reply("\u{274C} Invalid parameters"); return; }

  try {
    const params = new URLSearchParams({
      account: wallet.address,
      token,
      amount: toWei(amount),
      collateralToken: collToken,
    });
    const data = await ghostGet(`/api/v1/collateral-quote?${params}`);
    await ctx.reply(
      `\u{1F4CA} <b>Collateral Quote</b>\n\n` +
      `Borrow: <code>${amount} ${tokenSymbol(token)}</code>\n` +
      `Tier: <b>${data.tier}</b> (${data.multiplier}x)\n` +
      `Required Collateral: <code>${fmtEth(data.requiredCollateral)} ${tokenSymbol(collToken)}</code>\n` +
      `Required USD Value: <code>$${data.requiredValueUsd?.toFixed(2)}</code>` +
      (data.ethPrice ? `\nETH/USD: <code>$${data.ethPrice.toFixed(2)}</code>` : ""),
      { parse_mode: "HTML" },
    );
  } catch (err: any) {
    await ctx.reply(`\u{274C} ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

// ── /price ──

composer.command("price", async (ctx) => {
  try {
    const data = await ghostGet(`/api/v1/credit-score/0x0000000000000000000000000000000000000000`);
    await ctx.reply(`\u{1F4B5} <b>ETH/USD:</b> <code>$${data.ethPrice?.toFixed(2)}</code>`, { parse_mode: "HTML" });
  } catch (err: any) {
    await ctx.reply(`\u{274C} ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

// ── /pool_status ──

composer.command("pool_status", async (ctx) => {
  const msg = await ctx.reply("\u{23F3} Fetching protocol stats...");
  try {
    const [health, intents] = await Promise.all([
      ghostGet("/health"),
      ghostGet("/api/v1/internal/pending-intents"),
    ]);

    const lendCount = intents.lendIntents?.length ?? 0;
    const borrowCount = intents.borrowIntents?.length ?? 0;
    const totalLendWei = (intents.lendIntents ?? []).reduce(
      (s: bigint, l: any) => s + BigInt(l.amount ?? "0"), 0n);
    const totalBorrowWei = (intents.borrowIntents ?? []).reduce(
      (s: bigint, b: any) => s + BigInt(b.amount ?? "0"), 0n);

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{1F47B} <b>GHOST Protocol Status</b>\n\n` +
      `Pool: <code>${health.poolAddress}</code>\n` +
      `Version: <code>${health.version}</code>\n\n` +
      `<b>Pending Intents</b>\n` +
      `\u{1F4B0} Lend: ${lendCount} intents (<code>${fmtEth(totalLendWei.toString())}</code> total)\n` +
      `\u{1F3E6} Borrow: ${borrowCount} intents (<code>${fmtEth(totalBorrowWei.toString())}</code> total)`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── Menu callback ──

composer.callbackQuery("menu_portfolio", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!hasWallet(ctx.from.id)) {
    await ctx.reply("No wallet connected. Use /start");
    return;
  }
  const kb = new InlineKeyboard()
    .text("\u{1FA99} On-Chain Balance", "action_balance")
    .text("\u{1F512} Vault Balance", "action_private_balance").row()
    .text("\u{1FA99} Lender Status", "action_lender_status")
    .text("\u{1F3E6} Borrower Status", "action_borrower_status").row()
    .text("\u{1F4CB} Active Loans", "action_active_loans")
    .text("\u{1F3C5} Credit Score", "action_credit_score").row()
    .text("\u{1F4B5} ETH Price", "action_price")
    .text("\u{1F47B} Pool Status", "action_pool_status");
  await ctx.reply(
    `\u{1F4CA} <b>Portfolio</b>\n\nChoose what to view:`,
    { parse_mode: "HTML", reply_markup: kb },
  );
});

// ── Portfolio action callbacks ──

composer.callbackQuery("action_balance", async (ctx) => {
  await ctx.answerCallbackQuery();
  const wallet = getWallet(ctx.from.id);
  if (!wallet) { await ctx.reply("No wallet connected."); return; }
  const msg = await ctx.reply("\u{23F3} Fetching on-chain balances...");
  try {
    const bal = await getOnChainBalances(wallet.address, getProvider());
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{1F4B0} <b>On-Chain Balances</b>\n\n` +
      `\u{1F464} <code>${wallet.address}</code>\n\n` +
      `\u{1FA99} gUSD: <code>${fmtEth(bal.gUSD)}</code>\n` +
      `\u{1FA99} gETH: <code>${fmtEth(bal.gETH)}</code>\n` +
      `\u{26AA} ETH:  <code>${fmtEth(bal.ETH)}</code>`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

composer.callbackQuery("action_private_balance", async (ctx) => {
  await ctx.answerCallbackQuery();
  const wallet = getWallet(ctx.from.id);
  if (!wallet) { await ctx.reply("No wallet connected."); return; }
  const msg = await ctx.reply("\u{23F3} Fetching private vault balances...");
  try {
    const bal = await getVaultBalances(wallet);
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{1F512} <b>Private Vault Balances</b>\n\n` +
      `\u{1F464} <code>${wallet.address}</code>\n\n` +
      `\u{1FA99} gUSD: <code>${fmtEth(bal.gUSD)}</code>\n` +
      `\u{1FA99} gETH: <code>${fmtEth(bal.gETH)}</code>`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

composer.callbackQuery("action_active_loans", async (ctx) => {
  await ctx.answerCallbackQuery();
  const wallet = getWallet(ctx.from.id);
  if (!wallet) { await ctx.reply("No wallet connected."); return; }
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
    if (borrowLoans.length === 0 && lendLoans.length === 0) text += "No active loans.";
    await editProgress(ctx, msg.chat.id, msg.message_id, text);
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

composer.callbackQuery("action_credit_score", async (ctx) => {
  await ctx.answerCallbackQuery();
  const wallet = getWallet(ctx.from.id);
  if (!wallet) { await ctx.reply("No wallet connected."); return; }
  try {
    const data = await ghostGet(`/api/v1/credit-score/${wallet.address}`);
    const tierEmoji: Record<string, string> = {
      bronze: "\u{1F949}", silver: "\u{1F948}", gold: "\u{1F947}", platinum: "\u{1F48E}",
    };
    await ctx.reply(
      `${tierEmoji[data.tier] ?? "\u{1F3C5}"} <b>Credit Score</b>\n\n` +
      `\u{1F464} <code>${wallet.address}</code>\n\n` +
      `Tier: <b>${data.tier.toUpperCase()}</b>\n` +
      `Collateral Multiplier: <code>${data.collateralMultiplier}x</code>\n` +
      `Loans Repaid: <code>${data.loansRepaid}</code>\n` +
      `Loans Defaulted: <code>${data.loansDefaulted}</code>\n` +
      `ETH/USD: <code>$${data.ethPrice?.toFixed(2)}</code>`,
      { parse_mode: "HTML" },
    );
  } catch (err: any) {
    await ctx.reply(`\u{274C} ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

composer.callbackQuery("action_price", async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const data = await ghostGet(`/api/v1/credit-score/0x0000000000000000000000000000000000000000`);
    await ctx.reply(`\u{1F4B5} <b>ETH/USD:</b> <code>$${data.ethPrice?.toFixed(2)}</code>`, { parse_mode: "HTML" });
  } catch (err: any) {
    await ctx.reply(`\u{274C} ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

composer.callbackQuery("action_pool_status", async (ctx) => {
  await ctx.answerCallbackQuery();
  const msg = await ctx.reply("\u{23F3} Fetching protocol stats...");
  try {
    const [health, intents] = await Promise.all([
      ghostGet("/health"),
      ghostGet("/api/v1/internal/pending-intents"),
    ]);
    const lendCount = intents.lendIntents?.length ?? 0;
    const borrowCount = intents.borrowIntents?.length ?? 0;
    const totalLendWei = (intents.lendIntents ?? []).reduce(
      (s: bigint, l: any) => s + BigInt(l.amount ?? "0"), 0n);
    const totalBorrowWei = (intents.borrowIntents ?? []).reduce(
      (s: bigint, b: any) => s + BigInt(b.amount ?? "0"), 0n);
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{1F47B} <b>GHOST Protocol Status</b>\n\n` +
      `Pool: <code>${health.poolAddress}</code>\n` +
      `Version: <code>${health.version}</code>\n\n` +
      `<b>Pending Intents</b>\n` +
      `\u{1F4B0} Lend: ${lendCount} intents (<code>${fmtEth(totalLendWei.toString())}</code> total)\n` +
      `\u{1F3E6} Borrow: ${borrowCount} intents (<code>${fmtEth(totalBorrowWei.toString())}</code> total)`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

export default composer;
