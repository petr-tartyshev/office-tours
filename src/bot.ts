import { Telegraf } from "telegraf";
import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

const bot = new Telegraf(token);

bot.start((ctx) =>
  ctx.reply("Привет! Я бот для записи на экскурсии в офис Авито.")
);

bot.hears(["/help", "help"], (ctx) =>
  ctx.reply("Скоро здесь появится функционал записи на экскурсии.")
);

bot.launch().then(() => {
  console.log("Excursion bot started");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
