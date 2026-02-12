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
const bot = new Telegraf(token as string);

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

// Текст и клавиатура согласия (для /start и /approval)
const approvalText =
  "Чтобы продолжить, нужно согласиться с правилом 1 и условиями 1.";
const approvalKeyboard = Markup.inlineKeyboard([
  Markup.button.callback("Согласен", "approval_accept"),
]);

// Главное меню — текст и клавиатура (для approval_accept и /main)
const mainMenuText = "Об экскурсиях в офис.";
const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Расписание", "main_schedule_info")],
  [
    Markup.button.callback("Подробнее об экскурсиях", "main_about_tour"),
    Markup.button.callback("FAQ", "main_faq"),
  ],
  [Markup.button.callback("Задать вопрос", "main_question")],
]);

// Команды
// 1. /start: приветствие + сразу сообщение с согласием и кнопкой «Согласен»
bot.start(async (ctx) => {
  await ctx.reply("Привет! Это экскурсии в офис.", Markup.removeKeyboard());
  return ctx.reply(approvalText, approvalKeyboard);
});

bot.command("approval", (ctx) => ctx.reply(approvalText, approvalKeyboard));

// 2. После «Согласен» — одновременно текст «Спасибо!» и главное меню
bot.action("approval_accept", async (ctx) => {
  ctx.answerCbQuery();
  await Promise.all([
    ctx.editMessageText("Спасибо! Можно продолжать 🚀"),
    ctx.reply(mainMenuText, mainMenuKeyboard),
  ]);
});

// Главное меню (команды для тестирования)
bot.command("main", (ctx) => ctx.reply(mainMenuText, mainMenuKeyboard));

bot.command("menu", (ctx) => ctx.reply(mainMenuText, mainMenuKeyboard));

bot.command("about_tour", (ctx) => {
  return ctx.reply("Подробная информация об экскурсиях", Markup.removeKeyboard());
});

bot.command("info_egistration", (ctx) => {
  return ctx.reply("Дополнительная информация про экскурсии");
});

const sendRoleChoice = (ctx: any) => {
  return ctx.reply(
    "Уточните вы руководитель группы или студент?",
    Markup.inlineKeyboard([
      [Markup.button.callback("Руководитель группы", "role_group_leader")],
      [Markup.button.callback("Студент", "role_student")],
    ])
  );
};

bot.command("user_info", (ctx) => sendRoleChoice(ctx));

// 3. После выбора роли сразу показываем слоты (без упоминания команд)
bot.action("role_group_leader", (ctx) => {
  ctx.answerCbQuery();
  resetSession(ctx);
  return ctx
    .editMessageText("Вы выбрали: Руководитель группы.")
    .then(() => showScheduleGroupLeader(ctx));
});

bot.action("role_student", (ctx) => {
  ctx.answerCbQuery();
  resetSession(ctx);
  return ctx
    .editMessageText("Вы выбрали: Студент.")
    .then(() => showScheduleStudent(ctx));
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

const showScheduleGroupLeader = (ctx: any) =>
  ctx.reply(
    "Доступные слоты: 20 февраля, 15:00 (создано несколько слотов):",
    Markup.inlineKeyboard(
      groupLeaderSlots.map((slot) => [
        Markup.button.callback(slot, `slot_group_${slot}`),
      ])
    )
  );

const showScheduleStudent = (ctx: any) =>
  ctx.reply(
    "Доступные слоты: 25 февраля, 15:00 (создано несколько слотов):",
    Markup.inlineKeyboard(
      studentSlots.map((slot) => [
        Markup.button.callback(slot, `slot_student_${slot}`),
      ])
    )
  );

bot.command("schedule_group_leader", (ctx) => showScheduleGroupLeader(ctx));

bot.command("schedule_student", (ctx) => showScheduleStudent(ctx));

// Выбор роли для расписания
const scheduleInfoText =
  "Для выбора свободных слотов, пожалуйста укажите, вы:";

const scheduleInfoKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Руководитель группы", "schedule_info_group")],
  [Markup.button.callback("Студент вуза", "schedule_info_student")],
]);

bot.command("schedule_info", (ctx) =>
  ctx.reply(scheduleInfoText, scheduleInfoKeyboard)
);

bot.action("schedule_info_group", (ctx) => {
  ctx.answerCbQuery();
  return showScheduleGroupLeader(ctx);
});

bot.action("schedule_info_student", (ctx) => {
  ctx.answerCbQuery();
  return showScheduleStudent(ctx);
});

// Кнопка «Расписание» в /main ведёт к /schedule_info
bot.action("main_schedule_info", (ctx) => {
  ctx.answerCbQuery();
  return ctx.editMessageText(scheduleInfoText, scheduleInfoKeyboard);
});

// Обработка выбора слота студентом
bot.action(/slot_student_.+/, (ctx) => {
  const raw =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? (ctx.callbackQuery.data as string)
      : "";
  const slot = raw.replace("slot_student_", "");

  ctx.answerCbQuery();

  // Явно работаем через session как через any, чтобы не мешала типизация
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "student";
  s.step = "surname";
  s.data = s.data || {};
  s.data.slot = slot;
  (ctx as any).session = s;

  return ctx.reply(
    `Вы выбрали слот: ${slot}\n\nВаша фамилия`
  );
});

// Остальные команды-информационные
bot.command("schedule", (ctx) =>
  ctx.reply(scheduleInfoText, scheduleInfoKeyboard)
);

bot.command("faq", (ctx) =>
  ctx.reply("Ответы на самые частые вопросы", Markup.removeKeyboard())
);

bot.command("question", (ctx) =>
  ctx.reply(
    "Напишите свой вопрос в чат, менеджер ответит в ближайшее время",
    Markup.removeKeyboard()
  )
);

bot.command("reminder_3day", (ctx) => {
  const data = (ctx as any).session?.data as RegistrationData | undefined;
  const slot = data?.slot ?? "[дата и время не выбраны]";
  return ctx.reply(
    `Напоминаем про экскурсию в Офис: ${slot}`,
    Markup.inlineKeyboard([
      [Markup.button.callback("Подтвердить", "reminder3_confirm")],
      [Markup.button.callback("Изменить", "reminder3_change")],
      [Markup.button.callback("Задать вопрос", "reminder3_question")],
    ])
  );
});

bot.action("reminder3_confirm", (ctx) => {
  ctx.answerCbQuery();
  return ctx.editMessageText("Спасибо, что подтвердили участие в экскурсии!");
});

bot.action("reminder3_change", (ctx) => {
  ctx.answerCbQuery();
  return ctx.editMessageText(
    "Если вы хотите изменить дату или время экскурсии, напишите, пожалуйста, менеджеру или пройдите запись заново."
  );
});

bot.action("reminder3_question", (ctx) => {
  ctx.answerCbQuery();
  return ctx.reply(
    "Напишите свой вопрос в чат, менеджер ответит в ближайшее время"
  );
});

bot.command("visiting_rules", (ctx) =>
  ctx.reply(
    "Правила посещения офиса",
    Markup.inlineKeyboard([
      [Markup.button.callback("Ознакомлен", "rules_ack")],
    ])
  )
);

bot.action("rules_ack", (ctx) => {
  ctx.answerCbQuery("Спасибо! Правила посещения офиса приняты.");
  return ctx.editMessageReplyMarkup(undefined);
});

bot.command("reminder_9am", (ctx) => {
  const data = (ctx as any).session?.data as RegistrationData | undefined;
  const slot = data?.slot ?? "[дата и время не выбраны]";
  return ctx.reply(`Напоминаем про экскурсию в Офис: ${slot}`);
});

bot.command("feedback_form", (ctx) =>
  ctx.reply(
    "Спасибо, что пришли в гости! Заполните форму",
    Markup.inlineKeyboard([
      [
        Markup.button.url("Заполнить форму", "https://t.me/petrtar"),
      ],
    ])
  )
);

// Специальная стейдж-команда: удалить данные пользователя и остановить бота
bot.command("death", async (ctx) => {
  try {
    resetSession(ctx);
  } catch {
    // игнорируем ошибки при очистке сессии
  }

  await ctx.reply(
    "Ваши данные в сессии удалены. Бот сейчас будет остановлен.",
    Markup.removeKeyboard()
  );

  setTimeout(() => {
    process.exit(0);
  }, 500);
});

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
      return ctx.reply("Ваше имя");

    case "name":
      s.data.name = text;
      setStudentFlowStep(ctx, "patronymic");
      return ctx.reply("Ваше отчество");

    case "patronymic":
      s.data.patronymic = text;
      setStudentFlowStep(ctx, "birthDate");
      return ctx.reply("Дата рождения (формат 00.00.0000)");

    case "birthDate":
      s.data.birthDate = text;
      setStudentFlowStep(ctx, "email");
      return ctx.reply("Ваша почта");

    case "email":
      s.data.email = text;
      setStudentFlowStep(ctx, "phone");
      return ctx.reply("Ваш номер телефона (формат 79*********)");

    case "phone":
      s.data.phone = text;
      setStudentFlowStep(ctx, "university");
      return ctx.reply(
        "Ваш университет",
        Markup.inlineKeyboard([
          [
            Markup.button.callback("МГУ", "university_МГУ"),
            Markup.button.callback("ФИЗ ТЕХ", "university_ФИЗ ТЕХ"),
          ],
          [Markup.button.callback("ВШЭ", "university_ВШЭ")],
        ])
      );

    case "university":
    case "faculty":
      // Для этих шагов данные приходят через нажатие кнопок, а не текстом
      return ctx.reply(
        "Пожалуйста, выберите вариант из кнопок ниже, а не вводите текстом."
      );

    default:
      resetSession(ctx);
      return ctx.reply(
        "Что-то пошло не так, давайте начнём сначала. Выберите «Расписание» в меню и снова выберите слот."
      );
  }
});

// Обработка выбора университета и факультета через inline-кнопки
bot.action(/university_.+/, (ctx) => {
  const raw =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? (ctx.callbackQuery.data as string)
      : "";
  const uni = raw.replace("university_", "");

  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "student";
  s.step = "faculty";
  s.data = s.data || {};
  s.data.university = uni;
  (ctx as any).session = s;

  return ctx.reply(
    "Ваш факультет",
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "Прикладная математика",
          "faculty_Прикладная математика"
        ),
      ],
      [Markup.button.callback("Маркетинг и PR", "faculty_Маркетинг и PR")],
      [
        Markup.button.callback(
          "Информационная безопасность",
          "faculty_Информационная безопасность"
        ),
      ],
    ])
  );
});

bot.action(/faculty_.+/, (ctx) => {
  const raw =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? (ctx.callbackQuery.data as string)
      : "";
  const faculty = raw.replace("faculty_", "");

  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "student";
  s.step = "confirm";
  s.data = s.data || {};
  s.data.faculty = faculty;
  (ctx as any).session = s;

  const summary = formatRegistrationSummary(s.data);
  return ctx.reply(
    `Давайте сверим данные:\n\n${summary}\n\nЕсли они верны, нажмите кнопку «Подтвердить».`,
    Markup.inlineKeyboard([
      Markup.button.callback("Подтвердить", "confirm_registration"),
    ])
  );
});

bot.action("confirm_registration", (ctx) => {
  const s = (ctx as any).session as SessionData | undefined;
  const data = s?.data;

  ctx.answerCbQuery();

  if (!data) {
    return ctx.editMessageText(
      "Не удалось найти данные регистрации. Пожалуйста, начните заново: меню → Расписание → Студент вуза."
    );
  }

  const summary = formatRegistrationSummary(data);
  resetSession(ctx);

  return ctx.editMessageText(
    `Заявка подтверждена!\n\n${summary}\n\nСпасибо, что записались на экскурсию.`
  );
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
      console.log("Excursion bot started, но не удалось получить getMe или настроить меню:", e);
    }
  })
  .catch((e) => {
    console.error("Не удалось запустить бота:", e);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
