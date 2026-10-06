import { Composer, InlineKeyboard } from "grammy";
import { ethers } from "ethers";
import { SWAP_POOL_ADDRESS } from "../config";
import { ERC20_ABI, SWAP_POOL_ABI } from "../constants";
import { ghostGet, toWei, fmtEth, tokenSymbol, resolveToken, ensureGasBalance } from "../api";
import { getProvider } from "../wallet";
import { requireWallet } from "../middleware";
import { escapeHtml, friendlyError, editProgress, editError } from "../ui";

const composer = new Composer();

// ── /swap <amount> <fromToken> <toToken> ──

composer.command("swap", async (ctx) => {
  const parts = (ctx.match || "").trim().split(/\s+/);
  if (parts.length < 3) {
    const kb = new InlineKeyboard()
      .text("\u{1F4B5} gUSD \u{2192} gETH", "swap_example_gusd_geth")
      .text("\u{1FA99} gETH \u{2192} gUSD", "swap_example_geth_gusd");
    await ctx.reply(
      `\u{1F504} <b>Swap Tokens</b>\n\n` +
      `<b>Usage:</b> <code>/swap [amount] [from] [to]</code>\n\n` +
      `<b>Examples:</b>\n` +
      `<code>/swap 100 gUSD gETH</code> — Swap 100 gUSD for gETH\n` +
      `<code>/swap 0.5 gETH gUSD</code> — Swap 0.5 gETH for gUSD`,
      { parse_mode: "HTML", reply_markup: kb },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const amount = parseFloat(parts[0]);
  const tokenIn = resolveToken(parts[1]);
  const tokenOut = resolveToken(parts[2]);

  if (isNaN(amount) || amount <= 0) { await ctx.reply("\u{274C} Invalid amount."); return; }
  if (!tokenIn || !tokenOut) { await ctx.reply("\u{274C} Unknown token. Use <b>gUSD</b> or <b>gETH</b>.", { parse_mode: "HTML" }); return; }
  if (tokenIn.toLowerCase() === tokenOut.toLowerCase()) { await ctx.reply("\u{274C} Can't swap same token."); return; }

  const msg = await ctx.reply(`\u{23F3} Swapping ${amount} ${tokenSymbol(tokenIn)} \u{2192} ${tokenSymbol(tokenOut)}...`);
  try {
    // Pre-flight: check gas
    await ensureGasBalance(wallet.address, getProvider());

    const amountWei = toWei(amount);

    const pool = new ethers.Contract(SWAP_POOL_ADDRESS, SWAP_POOL_ABI, wallet);
    const amountOut = await pool.getAmountOut(tokenIn, tokenOut, amountWei);
    const minOut = amountOut * 95n / 100n; // 5% slippage

    const tokenContract = new ethers.Contract(tokenIn, ERC20_ABI, wallet);
    const approveTx = await tokenContract.approve(SWAP_POOL_ADDRESS, amountWei);
    await approveTx.wait();

    const swapTx = await pool.swap(tokenIn, tokenOut, amountWei, minOut);
    const receipt = await swapTx.wait();

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Swap Complete!</b>\n\n` +
      `\u{1FA99} Sold: <code>${amount} ${tokenSymbol(tokenIn)}</code>\n` +
      `\u{1FA99} Got:  <code>${fmtEth(amountOut.toString())} ${tokenSymbol(tokenOut)}</code>\n` +
      `\u{1F4CB} Tx: <code>${receipt.hash}</code>`,
    );
  } catch (err: any) {
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{274C} <b>Swap Failed</b>\n\n${escapeHtml(friendlyError(err))}`,
    );
  }
});

// ── /swap_quote <amount> <from> <to> ──

composer.command("swap_quote", async (ctx) => {
  const parts = (ctx.match || "").trim().split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply(
      `\u{1F4B1} <b>Swap Quote</b>\n\n` +
      `<b>Usage:</b> <code>/swap_quote [amount] [from] [to]</code>\n\n` +
      `<b>Example:</b> <code>/swap_quote 100 gUSD gETH</code>`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const amount = parseFloat(parts[0]);
  const tokenIn = resolveToken(parts[1]);
  const tokenOut = resolveToken(parts[2]);

  if (isNaN(amount) || amount <= 0 || !tokenIn || !tokenOut) {
    await ctx.reply("\u{274C} Invalid parameters. Use: <code>/swap_quote 100 gUSD gETH</code>", { parse_mode: "HTML" });
    return;
  }

  try {
    const params = new URLSearchParams({
      tokenIn, tokenOut, amountIn: toWei(amount),
    });
    const data = await ghostGet(`/api/v1/swap-quote?${params}`);

    const kb = new InlineKeyboard()
      .text(`\u{1F504} Swap Now`, "swap_now_help");

    await ctx.reply(
      `\u{1F4B1} <b>Swap Quote</b>\n\n` +
      `\u{1FA99} In:  <code>${amount} ${tokenSymbol(tokenIn)}</code>\n` +
      `\u{1FA99} Out: <code>${fmtEth(data.amountOut)} ${tokenSymbol(tokenOut)}</code>\n` +
      `\u{1F4C8} Rate: <code>${data.rate}</code>\n` +
      `\u{1F4B5} ETH/USD: <code>$${data.ethPrice?.toFixed(2)}</code>`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  } catch (err: any) {
    await ctx.reply(`\u{274C} ${escapeHtml(friendlyError(err))}`, { parse_mode: "HTML" });
  }
});

// ── Swap callbacks ──

composer.callbackQuery("swap_example_gusd_geth", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{1F504} <b>Swap gUSD to gETH</b>\n\n` +
    `<code>/swap 100 gUSD gETH</code>\n\n` +
    `Or check the rate first:\n<code>/swap_quote 100 gUSD gETH</code>`,
    { parse_mode: "HTML" },
  );
});

composer.callbackQuery("swap_example_geth_gusd", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{1F504} <b>Swap gETH to gUSD</b>\n\n` +
    `<code>/swap 0.5 gETH gUSD</code>\n\n` +
    `Or check the rate first:\n<code>/swap_quote 0.5 gETH gUSD</code>`,
    { parse_mode: "HTML" },
  );
});

composer.callbackQuery("swap_now_help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `Use the /swap command:\n<code>/swap [amount] [from] [to]</code>`,
    { parse_mode: "HTML" },
  );
});

// ── Menu callback ──

composer.callbackQuery("menu_swap", async (ctx) => {
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("\u{1F4B5} gUSD \u{2192} gETH", "swap_example_gusd_geth")
    .text("\u{1FA99} gETH \u{2192} gUSD", "swap_example_geth_gusd").row()
    .text("\u{1F4B1} Get Quote", "swap_quote_help");
  await ctx.reply(
    `\u{1F504} <b>Swap Tokens</b>\n\n` +
    `Swap between gUSD and gETH on-chain with 5% slippage protection.\n\n` +
    `<b>Quick start:</b>\n` +
    `<code>/swap 100 gUSD gETH</code>\n` +
    `<code>/swap_quote 100 gUSD gETH</code>`,
    { parse_mode: "HTML", reply_markup: kb },
  );
});

composer.callbackQuery("swap_quote_help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    `\u{1F4B1} <b>Get a Quote</b>\n\n` +
    `<code>/swap_quote 100 gUSD gETH</code>\n` +
    `<code>/swap_quote 0.5 gETH gUSD</code>`,
    { parse_mode: "HTML" },
  );
});

export default composer;
