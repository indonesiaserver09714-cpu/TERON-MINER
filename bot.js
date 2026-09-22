require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const db = require("./db");

const token = process.env.BOT_TOKEN;
const webapp = process.env.WEBAPP_URL;

if (!token) {
  console.warn("BOT_TOKEN is missing. Web server can still start.");
  module.exports = {};
} else {
  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const tg = ctx.from;
    db.upsertUser(tg);

    const payload = ctx.startPayload || "";
    if (payload.startsWith("ref_")) {
      const referrerId = Number(payload.slice(4));
      db.addReferral(referrerId, tg.id);
    }

    const text =
      `⚡️ *TERON MINER*\\n\\n` +
      `⛏️ Mine TERON\\n` +
      `🎁 Daily rewards\\n` +
      `👥 Referral rewards\\n` +
      `📋 Tasks\\n\\n` +
      `Tap *Open TERON Miner* to continue.`;

    if (webapp) {
      await ctx.replyWithMarkdownV2(
        text,
        Markup.inlineKeyboard([
          [Markup.button.webApp("🚀 Open TERON Miner", webapp)]
        ])
      );
    } else {
      await ctx.replyWithMarkdownV2(
        text + "\\n\\nSet WEBAPP_URL in your environment to enable the Mini App button."
      );
    }
  });

  bot.command("id", (ctx) => ctx.reply(`Your Telegram ID: ${ctx.from.id}`));

  bot.command("help", (ctx) => ctx.reply(
    "Use /start and open TERON Miner. Use /id to see your Telegram ID."
  ));

  bot.catch((err) => console.error("Bot error:", err));

  bot.launch().then(() => console.log("Telegram bot started"));

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
