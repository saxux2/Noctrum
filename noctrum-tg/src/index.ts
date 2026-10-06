import { Bot } from "grammy";
import { BOT_TOKEN } from "./config";
import commands from "./commands";
import { startNotifier } from "./notifier";

const bot = new Bot(BOT_TOKEN);

bot.use(commands);

bot.catch((err) => {
  console.error("Bot error:", err);
});

startNotifier(bot);
bot.start();
console.log("GHOST Telegram bot started!");
