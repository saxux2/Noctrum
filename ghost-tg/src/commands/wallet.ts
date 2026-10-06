import { Composer, InlineKeyboard } from "grammy";
import {
  hasWallet, getAddress, getWalletType, createEmbeddedWallet,
  importWallet, exportPrivateKey, removeWallet, getWallet,
  registerConnectedWallet, getProvider,
} from "../wallet";
import { subscribe, unsubscribe } from "../notifier";
import { createWCConnection } from "../wc";
import { getOnChainBalances, getVaultBalances, fmtEth } from "../api";
import { escapeHtml, mainMenuKeyboard, walletSetupKeyboard, editError } from "../ui";

const composer = new Composer();

// ── Create wallet (callback) ──

composer.callbackQuery("wallet_create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;

  if (hasWallet(userId)) {
    await ctx.reply("You already have a wallet connected. Use /disconnect first to switch.");
    return;
  }

  const { wallet, privateKey } = createEmbeddedWallet(userId);

  await ctx.reply(
    `<b>Backup Your Key</b>\n\n` +
    `<tg-spoiler>${privateKey}</tg-spoiler>\n\n` +
    `Tap to reveal. Save it safely. Use /export_key to view again.`,
    { parse_mode: "HTML" },
  );

  await ctx.reply(
    `<b>Wallet Created</b>\n\n` +
    `<code>${wallet.address}</code>\n` +
    `Type: Embedded`,
    { parse_mode: "HTML", reply_markup: mainMenuKeyboard() },
  );
});

// ── Import prompt (callback) ──

composer.callbackQuery("wallet_import_prompt", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (hasWallet(ctx.from.id)) {
    await ctx.reply("You already have a wallet connected. Use /disconnect first to switch.");
    return;
  }

  await ctx.reply(
    `<b>Import Wallet</b>\n\n` +
    `<code>/import_wallet 0xYOUR_PRIVATE_KEY</code>\n\n` +
    `Your message will be auto-deleted for security.`,
    { parse_mode: "HTML" },
  );
});

// ── WalletConnect (callback) ──

composer.callbackQuery("wallet_connect_wc", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;

  if (hasWallet(userId)) {
    await ctx.reply("You already have a wallet connected. Use /disconnect first to switch.");
    return;
  }

  const msg = await ctx.reply("Generating connection link. This may take a moment...");

  try {
    const { uri, waitForApproval } = await createWCConnection(userId);
    const encodedUri = encodeURIComponent(uri);

    const kb = new InlineKeyboard()
      .url("MetaMask", `https://metamask.app.link/wc?uri=${encodedUri}`)
      .url("Phantom", `https://phantom.app/ul/wc?uri=${encodedUri}`).row()
      .url("Trust Wallet", `https://link.trustwallet.com/wc?uri=${encodedUri}`)
      .url("Rainbow", `https://rnbwapp.com/wc?uri=${encodedUri}`).row()
      .text("Cancel", "wallet_connect_cancel");

    await ctx.api.editMessageText(msg.chat.id, msg.message_id,
      `<b>Connect Wallet</b>\n\n` +
      `Open your wallet app to approve.\n\n` +
      `<code>${uri}</code>\n\n` +
      `Or copy the URI above into any WalletConnect wallet.`,
      { parse_mode: "HTML", reply_markup: kb },
    );

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 120_000),
    );

    try {
      const address = await Promise.race([waitForApproval(), timeout]);
      registerConnectedWallet(userId, address);

      await ctx.api.editMessageText(msg.chat.id, msg.message_id,
        `<b>Wallet Connected</b>\n\n` +
        `<code>${address}</code>\n` +
        `Type: WalletConnect`,
        { parse_mode: "HTML", reply_markup: mainMenuKeyboard() },
      );
    } catch (err: any) {
      const text = err.message === "timeout"
        ? `Connection timed out. Use /start to try again.`
        : `Connection failed: ${escapeHtml(err.message)}\n\nUse /start to try again.`;
      await ctx.api.editMessageText(msg.chat.id, msg.message_id, text, { parse_mode: "HTML" });
    }
  } catch (err: any) {
    await ctx.api.editMessageText(msg.chat.id, msg.message_id,
      `Failed to create connection: ${escapeHtml(err.message)}`,
      { parse_mode: "HTML" },
    );
  }
});

composer.callbackQuery("wallet_connect_cancel", async (ctx) => {
  await ctx.answerCallbackQuery("Connection cancelled");
  await ctx.editMessageText("Connection cancelled. Use /start to try again.");
});

// ── /create_wallet ──

composer.command("create_wallet", async (ctx) => {
  const userId = ctx.from!.id;

  if (hasWallet(userId)) {
    const addr = getAddress(userId)!;
    const kb = new InlineKeyboard()
      .text("Disconnect & Create New", "wallet_disconnect_and_create")
      .text("Keep Current", "wallet_keep");
    await ctx.reply(
      `Already connected: <code>${addr}</code>\n\nDisconnect first to create a new one.`,
      { parse_mode: "HTML", reply_markup: kb },
    );
    return;
  }

  const { wallet, privateKey } = createEmbeddedWallet(userId);

  await ctx.reply(
    `<b>Backup Your Private Key</b>\n\n` +
    `<tg-spoiler>${privateKey}</tg-spoiler>\n\n` +
    `Tap to reveal. Save it somewhere safe.`,
    { parse_mode: "HTML" },
  );

  await ctx.reply(
    `<b>Wallet Created</b>\n\n` +
    `Address: <code>${wallet.address}</code>\n` +
    `Type: Embedded\n\n` +
    `Fund it with Sepolia ETH and gUSD or gETH to start.`,
    { parse_mode: "HTML", reply_markup: mainMenuKeyboard() },
  );
});

// ── Disconnect & create new (callback) ──

composer.callbackQuery("wallet_disconnect_and_create", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;
  removeWallet(userId);
  unsubscribe(userId);

  const { wallet, privateKey } = createEmbeddedWallet(userId);

  await ctx.reply(
    `<b>Backup Your Private Key</b>\n\n` +
    `<tg-spoiler>${privateKey}</tg-spoiler>\n\n` +
    `Tap to reveal. Save it somewhere safe.`,
    { parse_mode: "HTML" },
  );

  await ctx.reply(
    `<b>New Wallet Created</b>\n\n` +
    `Address: <code>${wallet.address}</code>\n` +
    `Type: Embedded`,
    { parse_mode: "HTML", reply_markup: mainMenuKeyboard() },
  );
});

composer.callbackQuery("wallet_keep", async (ctx) => {
  await ctx.answerCallbackQuery("Keeping current wallet");
});

// ── /import_wallet ──

composer.command("import_wallet", async (ctx) => {
  const key = ctx.match?.trim();
  if (!key) {
    await ctx.reply("Usage: <code>/import_wallet 0xYOUR_PRIVATE_KEY</code>", { parse_mode: "HTML" });
    return;
  }

  const userId = ctx.from!.id;

  if (hasWallet(userId)) {
    await ctx.reply("You already have a wallet connected. Use /disconnect first.");
    try { await ctx.deleteMessage(); } catch {}
    return;
  }

  try {
    try { await ctx.deleteMessage(); } catch {}

    const wallet = importWallet(userId, key);

    await ctx.reply(
      `<b>Wallet Imported</b>\n\n` +
      `<code>${wallet.address}</code>\n` +
      `Type: Imported`,
      { parse_mode: "HTML", reply_markup: mainMenuKeyboard() },
    );
  } catch (err: any) {
    await ctx.reply(`Invalid private key: ${escapeHtml(err.message)}`, { parse_mode: "HTML" });
  }
});

// ── /wallet ──

composer.command("wallet", async (ctx) => {
  const userId = ctx.from!.id;
  const addr = getAddress(userId);

  if (!addr) {
    await ctx.reply(
      `<b>No Wallet Connected</b>\n\nConnect a wallet to get started.`,
      { parse_mode: "HTML", reply_markup: walletSetupKeyboard() },
    );
    return;
  }

  const wType = getWalletType(userId);
  const kb = new InlineKeyboard()
    .text("Balances", "wallet_check_bal");
  if (wType !== "connected") kb.text("Export Key", "wallet_export");
  kb.row().text("Disconnect", "wallet_disconnect_confirm");

  await ctx.reply(
    `<b>Wallet</b>\n\n` +
    `Address: <code>${addr}</code>\n` +
    `Type: ${wType}`,
    { parse_mode: "HTML", reply_markup: kb },
  );
});

// ── /export_key ──

composer.command("export_key", async (ctx) => {
  const userId = ctx.from!.id;
  if (getWalletType(userId) === "connected") {
    await ctx.reply("Not available for WalletConnect wallets.");
    return;
  }
  const key = exportPrivateKey(userId);
  if (!key) {
    await ctx.reply("No wallet connected.");
    return;
  }
  await ctx.reply(
    `<b>Private Key</b>\n\n` +
    `<tg-spoiler>${key}</tg-spoiler>\n\n` +
    `Tap to reveal. Never share this.`,
    { parse_mode: "HTML" },
  );
});

// ── /disconnect ──

composer.command("disconnect", async (ctx) => {
  if (removeWallet(ctx.from!.id)) {
    unsubscribe(ctx.from!.id);
    await ctx.reply("\u{2705} Wallet disconnected.");
  } else {
    await ctx.reply("\u{26A0} No wallet to disconnect.");
  }
});

// ── Wallet inline callbacks ──

composer.callbackQuery("wallet_check_bal", async (ctx) => {
  await ctx.answerCallbackQuery();
  const wallet = getWallet(ctx.from.id);
  if (!wallet) { await ctx.reply("No wallet connected."); return; }

  const loadMsg = await ctx.reply("Fetching balances...");
  try {
    const [onChain, vault] = await Promise.all([
      getOnChainBalances(wallet.address, getProvider()),
      getVaultBalances(wallet).catch(() => ({ gUSD: "0", gETH: "0" })),
    ]);
    await ctx.api.editMessageText(loadMsg.chat.id, loadMsg.message_id,
      `<b>Wallet Balances</b>\n` +
      `<code>${wallet.address}</code>\n\n` +
      `<b>On Chain</b>\n` +
      `\u{1FA99} gUSD  <code>${fmtEth(onChain.gUSD)}</code>\n` +
      `\u{1FA99} gETH  <code>${fmtEth(onChain.gETH)}</code>\n` +
      `\u{26AA} ETH   <code>${fmtEth(onChain.ETH)}</code>\n\n` +
      `<b>Private Vault</b>\n` +
      `\u{1FA99} gUSD  <code>${fmtEth(vault.gUSD)}</code>\n` +
      `\u{1FA99} gETH  <code>${fmtEth(vault.gETH)}</code>`,
      { parse_mode: "HTML" },
    );
  } catch (err: any) {
    await editError(ctx, loadMsg.chat.id, loadMsg.message_id, err);
  }
});

composer.callbackQuery("wallet_export", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (getWalletType(ctx.from.id) === "connected") {
    await ctx.reply("Not available for WalletConnect wallets.");
    return;
  }
  const key = exportPrivateKey(ctx.from.id);
  if (!key) { await ctx.reply("No wallet to export."); return; }
  await ctx.reply(
    `<b>Private Key</b>\n\n` +
    `<tg-spoiler>${key}</tg-spoiler>\n\n` +
    `Tap to reveal. Never share this.`,
    { parse_mode: "HTML" },
  );
});

composer.callbackQuery("wallet_disconnect_confirm", async (ctx) => {
  await ctx.answerCallbackQuery();
  const kb = new InlineKeyboard()
    .text("Yes, Disconnect", "wallet_disconnect_yes")
    .text("Cancel", "wallet_keep");
  await ctx.reply(
    `<b>Disconnect?</b>\n\nMake sure you exported your key if embedded.`,
    { parse_mode: "HTML", reply_markup: kb },
  );
});

composer.callbackQuery("wallet_disconnect_yes", async (ctx) => {
  await ctx.answerCallbackQuery();
  removeWallet(ctx.from.id);
  unsubscribe(ctx.from.id);

  await ctx.reply(
    `Wallet disconnected.`,
    { parse_mode: "HTML", reply_markup: walletSetupKeyboard() },
  );
});

// ── Menu callbacks ──

composer.callbackQuery("menu_wallet", async (ctx) => {
  await ctx.answerCallbackQuery();
  const userId = ctx.from.id;

  if (hasWallet(userId)) {
    const addr = getAddress(userId)!;
    const wType = getWalletType(userId);
    const kb = new InlineKeyboard()
      .text("Balances", "wallet_check_bal");
    if (wType !== "connected") kb.text("Export Key", "wallet_export");
    kb.row().text("Disconnect", "wallet_disconnect_confirm");

    await ctx.reply(
      `<b>Wallet</b>\n\n` +
      `Address: <code>${addr}</code>\n` +
      `Type: ${wType}\n` +
      `Status: Active`,
      { parse_mode: "HTML", reply_markup: kb },
    );
  } else {
    await ctx.reply(
      `<b>No Wallet Connected</b>\n\n` +
      `Connect a wallet to get started.`,
      { parse_mode: "HTML", reply_markup: walletSetupKeyboard() },
    );
  }
});

export default composer;
