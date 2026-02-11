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

// Минимальный функционал: на любой текст отвечаем текущей датой и временем
bot.on("text", (ctx) => {
  const now = new Date();
  const formatted = now.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  return ctx.reply(`Текущая дата и время: ${formatted}`);
});

bot.launch().then(() => {
  console.log("Excursion bot started");
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
