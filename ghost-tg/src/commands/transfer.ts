import { Composer, InlineKeyboard } from "grammy";
import { ethers } from "ethers";
import { VAULT_ADDRESS } from "../config";
import { VAULT_ABI } from "../constants";
import { privateTransfer, requestWithdrawTicket, ensureGasBalance, toWei, fmtEth, tokenSymbol, resolveToken } from "../api";
import { getProvider } from "../wallet";
import { requireWallet } from "../middleware";
import { escapeHtml, friendlyError, editProgress, editError } from "../ui";

const composer = new Composer();

// ── /send <to> <amount> <token> ──

composer.command("send", async (ctx) => {
  const parts = (ctx.match || "").trim().split(/\s+/);
  if (parts.length < 3) {
    await ctx.reply(
      `\u{27A1}\u{FE0F} <b>Private Transfer</b>\n\n` +
      `<b>Usage:</b> <code>/send [address] [amount] [token]</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>/send 0xABC...123 100 gUSD</code>`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const recipient = parts[0];
  const amount = parseFloat(parts[1]);
  const token = resolveToken(parts[2]);

  if (!recipient.startsWith("0x")) { await ctx.reply("\u{274C} Invalid recipient address."); return; }
  if (isNaN(amount) || amount <= 0) { await ctx.reply("\u{274C} Invalid amount."); return; }
  if (!token) { await ctx.reply("\u{274C} Unknown token. Use <b>gUSD</b> or <b>gETH</b>.", { parse_mode: "HTML" }); return; }

  const msg = await ctx.reply(`\u{23F3} Sending ${amount} ${tokenSymbol(token)} privately...`);
  try {
    const amountWei = toWei(amount);
    await privateTransfer(wallet, recipient, token, amountWei);
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Private Transfer Complete!</b>\n\n` +
      `\u{1FA99} ${amount} ${tokenSymbol(token)}\n` +
      `\u{27A1}\u{FE0F} To: <code>${recipient}</code>`,
    );
  } catch (err: any) {
    await editError(ctx, msg.chat.id, msg.message_id, err);
  }
});

// ── /withdraw <amount> <token> ──

composer.command("withdraw", async (ctx) => {
  const parts = (ctx.match || "").trim().split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply(
      `\u{1F4E4} <b>Withdraw to On-Chain</b>\n\n` +
      `<b>Usage:</b> <code>/withdraw [amount] [token]</code>\n\n` +
      `<b>Example:</b>\n` +
      `<code>/withdraw 100 gUSD</code>`,
      { parse_mode: "HTML" },
    );
    return;
  }

  const wallet = requireWallet(ctx.from!.id);
  const amount = parseFloat(parts[0]);
  const token = resolveToken(parts[1]);

  if (isNaN(amount) || amount <= 0) { await ctx.reply("\u{274C} Invalid amount."); return; }
  if (!token) { await ctx.reply("\u{274C} Unknown token. Use <b>gUSD</b> or <b>gETH</b>.", { parse_mode: "HTML" }); return; }

  const msg = await ctx.reply(`\u{23F3} Withdrawing ${amount} ${tokenSymbol(token)} to on-chain wallet...`);
  try {
    // Pre-flight: check gas
    await ensureGasBalance(wallet.address, getProvider());

    const amountWei = toWei(amount);

    const ticketData = await requestWithdrawTicket(wallet, token, amountWei);

    const vault = new ethers.Contract(VAULT_ADDRESS, VAULT_ABI, wallet);
    const tx = await vault.withdrawWithTicket(token, ticketData.amount ?? amountWei, ticketData.ticket);
    const receipt = await tx.wait();

    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{2705} <b>Withdrawn to On-Chain!</b>\n\n` +
      `\u{1FA99} ${amount} ${tokenSymbol(token)}\n` +
      `\u{1F4CB} Tx: <code>${receipt.hash}</code>`,
    );
  } catch (err: any) {
    await editProgress(ctx, msg.chat.id, msg.message_id,
      `\u{274C} <b>Withdraw Failed</b>\n\n${escapeHtml(friendlyError(err))}`,
    );
  }
});

export default composer;
