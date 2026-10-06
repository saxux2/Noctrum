import { Composer, InputFile } from "grammy";
import { join } from "path";
import { hasWallet, getAddress, getWalletType } from "../wallet";
import { mainMenuKeyboard, walletSetupKeyboard } from "../ui";

const BANNER_PATH = join(import.meta.dir, "..", "..", "welcome-banner.png");

const composer = new Composer();

composer.command("start", async (ctx) => {
  const userId = ctx.from!.id;

  if (hasWallet(userId)) {
    const addr = getAddress(userId)!;
    const wType = getWalletType(userId);

    await ctx.replyWithPhoto(new InputFile(BANNER_PATH), {
      caption:
        `GM! Welcome back to <b>GHOST Finance</b>\n\n` +
        `<code>${addr}</code>\n` +
        `Type: ${wType}\n\n` +
        `What would you like to do?`,
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
    });
  } else {
    await ctx.replyWithPhoto(new InputFile(BANNER_PATH), {
      caption:
        `GM! Welcome to <b>GHOST Finance</b>\n\n` +
        `Private P2P lending with encrypted rates powered by Chainlink CRE. Lend, borrow, and swap with complete rate privacy.\n\n` +
        `To get started, connect your wallet below.`,
      parse_mode: "HTML",
      reply_markup: walletSetupKeyboard(),
    });
  }
});

export default composer;
