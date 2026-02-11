import { Telegraf } from "telegraf";
import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

const bot = new Telegraf(token);

// Глобальный перехватчик ошибок, чтобы видеть проблемы в консоли
bot.catch((err) => {
  console.error("Ошибка в боте:", err);
});

bot.start((ctx) =>
  ctx.reply("Привет! Я бот для записи на экскурсии в офис Авито.")
);

// Минимальный функционал: на любое сообщение отвечаем датой, временем и ником пользователя
bot.on("message", (ctx) => {
  const now = new Date();
  const formatted = now.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const from = ctx.from;

  let nick = "неизвестный пользователь";

  if (from) {
    if (from.username) {
      nick = `@${from.username}`;
    } else {
      const nameParts = [from.first_name, from.last_name].filter(Boolean);
      if (nameParts.length > 0) {
        nick = nameParts.join(" ");
      }
    }
  }

  return ctx.reply(`Текущая дата и время: ${formatted}\nТвой ник: ${nick}`);
});

bot
  .launch()
  .then(async () => {
    try {
      const me = await bot.telegram.getMe();
      console.log(
        `Excursion bot started as @${me.username} (id=${me.id.toString()})`
      );
    } catch (e) {
      console.log("Excursion bot started, но не удалось получить getMe:", e);
    }
  })
  .catch((e) => {
    console.error("Не удалось запустить бота:", e);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
