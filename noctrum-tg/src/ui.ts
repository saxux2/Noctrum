import { InlineKeyboard } from "grammy";
import type { Context } from "grammy";

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function friendlyError(err: any): string {
  const msg = err?.message ?? String(err);

  if (err?.code === "INSUFFICIENT_FUNDS" || msg.includes("insufficient funds for gas"))
    return "Not enough ETH for gas fees. Fund your wallet with Sepolia ETH first.";

  if (err?.code === "UNPREDICTABLE_GAS_LIMIT" || msg.includes("execution reverted"))
    return "Transaction would fail. Check your token balance and allowance.";

  if (msg.includes("insufficient allowance"))
    return "Token allowance too low. Try again.";

  if (msg.includes("transfer amount exceeds balance"))
    return "Insufficient token balance for this transaction.";

  if (err?.code === "CALL_EXCEPTION")
    return "Contract call failed. You may not have enough tokens.";

  if (msg.includes("nonce has already been used"))
    return "Transaction conflict. Please wait a moment and try again.";

  if (msg.includes("replacement fee too low"))
    return "A pending transaction is blocking. Wait for it to confirm.";

  if (msg.includes("timeout"))
    return "Request timed out. Try again.";

  // API errors — try to extract the message
  try {
    const parsed = JSON.parse(msg.split(": ").slice(1).join(": "));
    if (parsed.error) return parsed.error;
    if (parsed.message) return parsed.message;
  } catch {}

  // Truncate long ethers errors
  if (msg.length > 150) {
    const short = msg.split("(")[0].trim();
    return short || msg.slice(0, 120) + "...";
  }

  return msg;
}

export function mainMenuKeyboard() {
  return new InlineKeyboard()
    .text("\u{1FA99} Lend", "menu_lend").text("\u{1F3E6} Borrow", "menu_borrow").row()
    .text("\u{1F4CA} Portfolio", "menu_portfolio").text("\u{1F504} Swap", "menu_swap").row()
    .text("\u{1F4B0} Wallet", "menu_wallet").text("\u{2753} Help", "menu_help").row()
    .text("\u{1F4B5} Price", "action_price").text("\u{1F47B} Pool Status", "action_pool_status");
}

export function walletSetupKeyboard() {
  return new InlineKeyboard()
    .text("\u{2728} Create Wallet", "wallet_create").row()
    .text("\u{1F511} Import Wallet", "wallet_import_prompt").row()
    .text("\u{1F517} Connect Wallet", "wallet_connect_wc");
}

export async function editProgress(
  ctx: Context,
  chatId: number,
  messageId: number,
  text: string,
) {
  await ctx.api.editMessageText(chatId, messageId, text, { parse_mode: "HTML" });
}

export async function editError(
  ctx: Context,
  chatId: number,
  messageId: number,
  err: any,
) {
  await ctx.api.editMessageText(
    chatId,
    messageId,
    `\u{274C} ${escapeHtml(friendlyError(err))}`,
    { parse_mode: "HTML" },
  );
}
