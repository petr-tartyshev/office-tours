import { Telegraf, Markup, session } from "telegraf";
import * as dotenv from "dotenv";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

type RegistrationStep =
  | "surname"
  | "name"
  | "patronymic"
  | "birthDate"
  | "email"
  | "phone"
  | "university"
  | "faculty"
  | "confirm";

type RegistrationFlow = "student";

interface RegistrationData {
  slot?: string;
  surname?: string;
  name?: string;
  patronymic?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  university?: string;
  faculty?: string;
}

interface SessionData {
  flow?: RegistrationFlow;
  step?: RegistrationStep;
  data?: RegistrationData;
}

interface MyContextSession {
  session?: SessionData;
}

const bot = new Telegraf<MyContextSession>(token);

bot.use(
  session({
    defaultSession: () => ({} as SessionData),
  })
);

// Глобальный перехватчик ошибок, чтобы видеть проблемы в консоли
bot.catch((err) => {
  console.error("Ошибка в боте:", err);
});

// Вспомогательные функции
const formatUserNick = (ctx: any): string => {
  const from = ctx.from;
  if (!from) return "неизвестный пользователь";

  if (from.username) {
    return `@${from.username}`;
  }

  const nameParts = [from.first_name, from.last_name].filter(Boolean);
  if (nameParts.length > 0) {
    return nameParts.join(" ");
  }

  return "неизвестный пользователь";
};

const resetSession = (ctx: any) => {
  ctx.session = {};
};

const setStudentFlowStep = (ctx: any, step: RegistrationStep) => {
  ctx.session = ctx.session || {};
  ctx.session.flow = "student";
  ctx.session.step = step;
  ctx.session.data = ctx.session.data || {};
};

const formatRegistrationSummary = (data: RegistrationData): string => {
  return [
    `Слот: ${data.slot ?? "-"}`,
    `Фамилия: ${data.surname ?? "-"}`,
    `Имя: ${data.name ?? "-"}`,
    `Отчество: ${data.patronymic ?? "-"}`,
    `День рождения: ${data.birthDate ?? "-"}`,
    `Почта: ${data.email ?? "-"}`,
    `Телефон: ${data.phone ?? "-"}`,
    `Университет: ${data.university ?? "-"}`,
    `Факультет: ${data.faculty ?? "-"}`,
  ].join("\n");
};

// Команды
bot.start((ctx) => ctx.reply("привет!"));

bot.command("approval", (ctx) => {
  return ctx.reply(
    "Чтобы продолжить, нужно согласиться с правилом 1 и условиями 1",
    Markup.inlineKeyboard([
      Markup.button.callback("Ознакомился и согласен", "approval_accept"),
    ])
  );
});

bot.action("approval_accept", (ctx) =>
  ctx.editMessageText("Спасибо! Можно продолжать 🚀")
);

bot.command("menu", (ctx) => {
  return ctx.reply(
    "Меню:",
    Markup.keyboard([
      ["/schedule"],
      ["/about_tour", "/faq"],
      ["/question"],
    ])
      .resize()
      .persistent()
  );
});

bot.command("about_tour", (ctx) => {
  return ctx.reply("об экскурсиях");
});

bot.command("info_egistration", (ctx) => {
  return ctx.reply("Дополнительная информация про экскурсии");
});

bot.command("user_info", (ctx) => {
  return ctx.reply(
    "Уточните, вы руководитель группы или студент",
    Markup.keyboard([["Руководитель группы", "Студент"]]).resize()
  );
});

bot.hears("Руководитель группы", (ctx) => {
  resetSession(ctx);
  return ctx.reply(
    "Вы выбрали: Руководитель группы.\nИспользуйте команду /schedule_group_leader, чтобы посмотреть расписание."
  );
});

bot.hears("Студент", (ctx) => {
  resetSession(ctx);
  return ctx.reply(
    "Вы выбрали: Студент.\nИспользуйте команду /schedule_student, чтобы посмотреть расписание."
  );
});

// Расписание
const groupLeaderSlots = [
  "20 февраля, 15:00",
  "22 февраля, 11:00",
  "27 февраля, 16:00",
];

const studentSlots = [
  "25 февраля, 15:00",
  "26 февраля, 10:00",
  "28 февраля, 14:00",
];

bot.command("schedule_group_leader", (ctx) => {
  return ctx.reply(
    "Доступные слоты для руководителей группы:",
    Markup.inlineKeyboard(
      groupLeaderSlots.map((slot) => [
        Markup.button.callback(slot, `slot_group_${slot}`),
      ])
    )
  );
});

bot.command("schedule_student", (ctx) => {
  return ctx.reply(
    "Доступные слоты для студентов:",
    Markup.inlineKeyboard(
      studentSlots.map((slot) => [
        Markup.button.callback(slot, `slot_student_${slot}`),
      ])
    )
  );
});

// Обработка выбора слота студентом
bot.action(/slot_student_.+/, (ctx) => {
  const raw =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? (ctx.callbackQuery.data as string)
      : "";
  const slot = raw.replace("slot_student_", "");

  ctx.answerCbQuery();

  setStudentFlowStep(ctx, "surname");
  ctx.session!.data!.slot = slot;

  return ctx.reply(
    `Вы выбрали слот: ${slot}\n\n/student_surname\nФамилия`
  );
});

// Остальные команды-информационные
bot.command("schedule", (ctx) => {
  return ctx.reply(
    "Выберите, для кого расписание:\n- /schedule_group_leader\n- /schedule_student"
  );
});

bot.command("faq", (ctx) =>
  ctx.reply("FAQ (здесь позже появятся вопросы и ответы)")
);

bot.command("question", (ctx) =>
  ctx.reply("Напишите ваш вопрос текстом, мы обязательно ответим позже.")
);

bot.command("reminder_3day", (ctx) => {
  const data = (ctx as any).session?.data as RegistrationData | undefined;
  const slot = data?.slot ?? "дата и время не выбраны";
  return ctx.reply(`Напоминаем про экскурсию в Офис: ${slot}`);
});

bot.command("visiting_rules", (ctx) =>
  ctx.reply("Правила посещения офиса")
);

bot.command("reminder_9am", (ctx) => {
  const data = (ctx as any).session?.data as RegistrationData | undefined;
  const slot = data?.slot ?? "дата и время не выбраны";
  return ctx.reply(`Напоминаем про экскурсию в Офис: ${slot}`);
});

bot.command("feedback_form", (ctx) =>
  ctx.reply("Спасибо, что пришли в гости! Заполните форму ОС.")
);

// Обработка шагов регистрации студента
bot.on("text", (ctx, next) => {
  const s = (ctx as any).session as SessionData | undefined;

  if (!s || s.flow !== "student" || !s.step) {
    return next();
  }

  const text = ctx.message.text.trim();
  s.data = s.data || {};

  switch (s.step) {
    case "surname":
      s.data.surname = text;
      setStudentFlowStep(ctx, "name");
      return ctx.reply("/student_name\nИмя");

    case "name":
      s.data.name = text;
      setStudentFlowStep(ctx, "patronymic");
      return ctx.reply("/student_patronymic\nОтчество");

    case "patronymic":
      s.data.patronymic = text;
      setStudentFlowStep(ctx, "birthDate");
      return ctx.reply(
        "/student_birth_date\nДень рождения (формат 00.00.0000)"
      );

    case "birthDate":
      s.data.birthDate = text;
      setStudentFlowStep(ctx, "email");
      return ctx.reply("/student_email\nВаша почта");

    case "email":
      s.data.email = text;
      setStudentFlowStep(ctx, "phone");
      return ctx.reply("/student_phone\nВаш телефон в формате 79*********");

    case "phone":
      s.data.phone = text;
      setStudentFlowStep(ctx, "university");
      return ctx.reply(
        "/student_university\nВыберите Университет",
        Markup.keyboard([["МГУ", "ФИЗ ТЕХ"], ["МИССИС", "ВШЭ"]]).resize()
      );

    case "university":
      s.data.university = text;
      setStudentFlowStep(ctx, "faculty");
      return ctx.reply(
        "/student_faculty\nВыберите ваш факультет",
        Markup.keyboard([
          ["Прикладная математика", "Компьютерные науки"],
          ["Маркетинг и ПР"],
        ]).resize()
      );

    case "faculty":
      s.data.faculty = text;
      setStudentFlowStep(ctx, "confirm");
      const summary = formatRegistrationSummary(s.data);
      return ctx.reply(
        `/data_verification\nДавайте сверим данные:\n\n${summary}\n\nЕсли они верны, нажмите кнопку «Подтвердить».`,
        Markup.inlineKeyboard([
          Markup.button.callback("Подтвердить", "confirm_registration"),
        ])
      );

    default:
      resetSession(ctx);
      return ctx.reply(
        "Что-то пошло не так, давайте начнём сначала. Используйте /schedule_student, чтобы выбрать слот."
      );
  }
});

bot.action("confirm_registration", (ctx) => {
  const s = (ctx as any).session as SessionData | undefined;
  const data = s?.data;

  ctx.answerCbQuery();

  if (!data) {
    return ctx.editMessageText(
      "Не удалось найти данные регистрации. Пожалуйста, начните заново через /schedule_student."
    );
  }

  const summary = formatRegistrationSummary(data);
  resetSession(ctx);

  return ctx.editMessageText(
    `Заявка подтверждена!\n\n${summary}\n\nСпасибо, что записались на экскурсию.`
  );
});

// Фолбэк: если нет активного сценария и это не команда, отвечаем датой/временем и ником
bot.on("message", (ctx) => {
  const msg: any = ctx.message;

  // Если это текстовая команда (/start, /approval и т.п.) — ничего не делаем,
  // чтобы не перебивать ответы команд.
  if (msg && typeof msg.text === "string" && msg.text.startsWith("/")) {
    return;
  }

  const now = new Date();
  const formatted = now.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const nick = formatUserNick(ctx);

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
