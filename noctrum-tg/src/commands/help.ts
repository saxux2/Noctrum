import { Composer, InlineKeyboard } from "grammy";
import { hasWallet } from "../wallet";
import { subscribe, unsubscribe, isSubscribed } from "../notifier";

const composer = new Composer();

// ── /help ──

async function sendHelp(ctx: any) {
  const kb = new InlineKeyboard()
    .text("\u{1FA99} Lend", "menu_lend").text("\u{1F3E6} Borrow", "menu_borrow").row()
    .text("\u{1F4CA} Portfolio", "menu_portfolio").text("\u{1F504} Swap", "menu_swap").row()
    .text("\u{1F4B0} Wallet", "menu_wallet").text("\u{1F4B5} Price", "action_price").row()
    .text("\u{1F47B} Pool Status", "action_pool_status").text("\u{1F3C5} Credit Score", "action_credit_score").row()
    .text("\u{1F514} Alerts On", "action_alerts_on").text("\u{1F515} Alerts Off", "action_alerts_off");

  await ctx.reply(
    `\u{1F47B} <b>GHOST Protocol Commands</b>\n\n` +

    `<b>\u{1F4B0} Wallet</b>\n` +
    `/create_wallet — Create embedded wallet\n` +
    `/import_wallet — Import private key\n` +
    `/wallet — View wallet details\n` +
    `/export_key — Export private key\n` +
    `/disconnect — Remove wallet\n\n` +

    `<b>\u{1FA99} Balances</b>\n` +
    `/balance — On-chain token balances\n` +
    `/private_balance — Private vault balances\n\n` +

    `<b>\u{1FA99} Lending</b>\n` +
    `/lend — Lend tokens at your rate\n` +
    `  e.g. <code>/lend 500 gUSD 5</code>\n` +
    `  e.g. <code>/lend 2 gETH 3.5</code>\n` +
    `/cancel_lend — Cancel active lend\n` +
    `  e.g. <code>/cancel_lend abc123</code>\n` +
    `/lender_status — View lend positions\n\n` +

    `<b>\u{1F3E6} Borrowing</b>\n` +
    `/borrow — Borrow with collateral\n` +
    `  e.g. <code>/borrow 800 gUSD 5 gETH 10</code>\n` +
    `/cancel_borrow — Cancel borrow intent\n` +
    `  e.g. <code>/cancel_borrow abc123</code>\n` +
    `/borrower_status — View borrow positions\n\n` +

    `<b>\u{1F514} Proposals &amp; Loans</b>\n` +
    `/accept_proposal — Accept a match\n` +
    `  e.g. <code>/accept_proposal abc123</code>\n` +
    `/reject_proposal — Reject a match (5% slash)\n` +
    `  e.g. <code>/reject_proposal abc123</code>\n` +
    `/active_loans — View all active loans\n` +
    `/repay — Repay a loan in full\n` +
    `  e.g. <code>/repay abc123</code>\n` +
    `/claim_collateral — Withdraw excess\n` +
    `  e.g. <code>/claim_collateral abc123</code>\n\n` +

    `<b>\u{1F504} Swap</b>\n` +
    `/swap — Swap between gUSD and gETH\n` +
    `  e.g. <code>/swap 100 gUSD gETH</code>\n` +
    `/swap_quote — Get swap price quote\n` +
    `  e.g. <code>/swap_quote 100 gUSD gETH</code>\n\n` +

    `<b>\u{27A1}\u{FE0F} Transfers</b>\n` +
    `/send — Private transfer\n` +
    `  e.g. <code>/send 0xAbc...123 100 gUSD</code>\n` +
    `/withdraw — Vault to on-chain\n` +
    `  e.g. <code>/withdraw 100 gUSD</code>\n\n` +

    `<b>\u{1F4CA} Info</b>\n` +
    `/credit_score — Your credit tier\n` +
    `/collateral_quote — Required collateral\n` +
    `  e.g. <code>/collateral_quote 800 gUSD gETH</code>\n` +
    `/price — Live ETH/USD price\n` +
    `/pool_status — Protocol statistics\n\n` +

    `<b>\u{1F514} Alerts</b>\n` +
    `/alerts_on — Enable notifications\n` +
    `/alerts_off — Disable notifications\n\n` +

    `\u{2B07}\u{FE0F} <b>Quick access buttons:</b>`,
    { parse_mode: "HTML", reply_markup: kb },
  );
}

composer.command("help", sendHelp);
composer.callbackQuery("menu_help", async (ctx) => {
  await ctx.answerCallbackQuery();
  await sendHelp(ctx);
});

// ── /alerts_on & /alerts_off ──

composer.command("alerts_on", async (ctx) => {
  if (!hasWallet(ctx.from!.id)) {
    await ctx.reply("\u{26A0} Import a wallet first.");
    return;
  }
  subscribe(ctx.from!.id, ctx.chat.id);
  await ctx.reply("\u{1F514} Alerts enabled. /alerts_off to disable.");
});

composer.command("alerts_off", async (ctx) => {
  unsubscribe(ctx.from!.id);
  await ctx.reply("\u{1F515} Alerts disabled.");
});

// ── Alert button callbacks ──

composer.callbackQuery("action_alerts_on", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!hasWallet(ctx.from.id)) {
    await ctx.reply("\u{26A0} Import a wallet first.");
    return;
  }
  subscribe(ctx.from.id, ctx.chat!.id);
  await ctx.reply("\u{1F514} Alerts enabled. /alerts_off to disable.");
});

composer.callbackQuery("action_alerts_off", async (ctx) => {
  await ctx.answerCallbackQuery();
  unsubscribe(ctx.from.id);
  await ctx.reply("\u{1F515} Alerts disabled.");
});

// ── Main menu callback ──

composer.callbackQuery("action_main_menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  const { mainMenuKeyboard } = await import("../ui");
  const kb = mainMenuKeyboard();
  await ctx.reply(
    `\u{1F47B} <b>GHOST Protocol</b>\n\nWhat would you like to do?`,
    { parse_mode: "HTML", reply_markup: kb },
  );
});

export default composer;
