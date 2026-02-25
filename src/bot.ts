import { Telegraf, Markup, session } from "telegraf";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as ExcelJS from "exceljs";
import {
  appendStudent,
  appendGroupLeader,
  appendWaitingList,
  exportStudentsSlot,
  exportGroupLeadersSlot,
  WAITING_LIST_FILE,
} from "./excel-registrations";
import {
  getLastRegistration,
  setLastRegistration,
  isSlotConfirmed,
  setSlotConfirmed,
  setSlotAvailable,
  getStudentSlotCount,
  incrementStudentSlotCount,
} from "./registrations-store";
import {
  recordUserFromContext,
  exportUsersToExcel,
  getAllUsers,
} from "./users-store";
import {
  createSupportThread,
  findThreadByTopic,
  getActiveThreadForUser,
  getSupportThreadById,
  updateSupportThread,
  closeSupportThread,
} from "./support-store";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
// ID супергруппы поддержки с топиками
const SUPPORT_CHAT_ID = -1003751564165;

const getAdminPassword = (): string => "Kp9#mN2$xL7qR4vWz";

const adminAuthenticatedIds = new Set<number>();

const addAdmin = (userId: number) => {
  adminAuthenticatedIds.add(userId);
};

const isAdmin = (ctx: any): boolean => {
  const id = ctx.from?.id;
  return id != null && adminAuthenticatedIds.has(id);
};

const adminInfoText = `✅ Вход под Администратором выполнен.
Доступные команды:

Выгрузка данных слота:
/export_student [дата: 00 месяц, время: 00:00_MSK / _SPB]
/export_group_leader [дата: 00 месяц, время: 00:00_MSK / _SPB]

Добавление новых слотов:
/add_slot_student [дата: 00 месяц, время: 00:00_MSK / _SPB]
/add_slot_group_leader [дата: 00 месяц, время: 00:00_MSK / _SPB]

Корректировка данных вручную:
/change_export_student [дата: 00 месяц, время: 00:00_MSK / _SPB]
/change_export_group_leader [дата: 00 месяц, время: 00:00_MSK / _SPB]

Рассылки:
/send_mailing [Текст сообщения]
/send_mailing_waiting_list [дата: 00 месяц, время: 00:00_MSK / _SPB; Текст сообщения]

Лист ожидания:
/waiting_list_admin

Экспорт пользователей:
/export_data

Лист ожидания:
/waiting_list`;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not set in environment variables");
}

type RegistrationFlow = "student" | "group_leader" | "waiting_list";

type RegistrationStep =
  | "surname"
  | "name"
  | "patronymic"
  | "birthDate"
  | "email"
  | "phone"
  | "university"
  | "faculty"
  | "confirm"
  // Дополнительные шаги для анкеты руководителя группы
  | "institutionType"
  | "schoolName"
  | "spoName"
  | "participantsFio"
  | "participantsBirthDate"
  | "editParticipantFio"
  | "editParticipantBirthDate"
  | "groupLeaderConfirm"
  | "waitingListSurname"
  | "waitingListName"
  | "waitingListPatronymic"
  | "waitingListPhone"
  | "waitingListEmail";

interface RegistrationData {
  slot?: string;
  city?: "MSK" | "SPB";
  surname?: string;
  name?: string;
  patronymic?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  university?: string;
  faculty?: string;
  // Данные для руководителя группы
  institutionType?: "university" | "school" | "spo";
  institutionName?: string;
  tempParticipantName?: string;
  participants?: { fullName: string; birthDate: string }[];
  editingParticipantIndex?: number;
}

interface SessionData {
  flow?: RegistrationFlow;
  step?: RegistrationStep;
  data?: RegistrationData;
  // Состояние диалога поддержки
  supportMode?: "awaiting_first" | "active";
}
const bot = new Telegraf(token as string);

bot.use(
  session({
    defaultSession: () => ({} as SessionData),
  })
);

// Глобально запоминаем всех пользователей, которые взаимодействуют с ботом
bot.use((ctx, next) => {
  try {
    recordUserFromContext(ctx);
  } catch (e) {
    console.error("Ошибка записи пользователя в users-store:", e);
  }
  return next();
});

// Глобальный перехватчик ошибок, чтобы видеть проблемы в консоли
bot.catch((err) => {
  console.error("Ошибка в боте:", err);
});

// Проверка пароля администратора (отдельным сообщением)
bot.on("text", (ctx, next) => {
  const text = ctx.message?.text?.trim();
  const userId = ctx.from?.id;
  if (text === getAdminPassword() && userId != null) {
    addAdmin(userId);
    return ctx.reply(adminInfoText);
  }
  return next();
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
  const lines: string[] = [
    `Слот: ${data.slot ?? "-"}`,
    `Фамилия: ${data.surname ?? "-"}`,
    `Имя: ${data.name ?? "-"}`,
    `Отчество: ${data.patronymic ?? "-"}`,
    `День рождения: ${data.birthDate ?? "-"}`,
    `Почта: ${data.email ?? "-"}`,
    `Телефон: ${data.phone ?? "-"}`,
    `Университет: ${data.university ?? "-"}`,
    `Факультет: ${data.faculty ?? "-"}`,
  ];

  if (data.institutionType) {
    const typeLabel =
      data.institutionType === "university"
        ? "ВУЗ"
        : data.institutionType === "school"
        ? "Школа"
        : "СПО";
    lines.push(
      `Учреждение (${typeLabel}): ${data.institutionName ?? "-"}`
    );
  }

  if (data.participants && data.participants.length > 0) {
    lines.push("", "Участники:");
    data.participants.forEach((p, index) => {
      lines.push(`${index + 1}. ${p.fullName ?? "-"} — ${p.birthDate ?? "-"}`);
    });
  }

  return lines.join("\n");
};

const isAgeAtLeast14 = (birthDateText: string): boolean => {
  const parts = birthDateText.split(".");
  if (parts.length !== 3) {
    // Если формат странный, не блокируем пользователя
    return true;
  }

  const [dayStr, monthStr, yearStr] = parts;
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);

  if (!day || !month || !year) {
    return true;
  }

  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) {
    return true;
  }

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age >= 14;
};

const formatParticipantsList = (
  participants: { fullName: string; birthDate: string }[]
): string => {
  return participants
    .map(
      (p, i) =>
        `Участник ${i + 1}\nФИО: ${p.fullName}\nДата рождения: ${p.birthDate}`
    )
    .join("\n\n");
};

const buildParticipantsListKeyboard = (
  participants: { fullName: string; birthDate: string }[]
) => {
  const rows: any[] = [];
  if (participants.length < 15) {
    rows.push([
      Markup.button.callback("Добавить участника", "participants_add"),
    ]);
  }
  rows.push([
    Markup.button.callback("Изменить участника", "participants_edit"),
  ]);
  rows.push([
    Markup.button.callback(
      "Завершить регистрацию",
      "group_leader_data_verification"
    ),
  ]);
  return Markup.inlineKeyboard(rows);
};

const sendParticipantsIntro = (ctx: any, s: SessionData) => {
  s.step = "participantsFio";
  (ctx as any).session = s;

  return ctx.reply(
    [
      "Далее отправьте данные участников экскурсии в Офис.",
      "Максимальное количество участников - 15 человек.",
      "Возраст - от 14 лет.",
    ].join("\n"),
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "Добавить первого участника",
          "participants_add"
        ),
      ],
    ])
  );
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
  await ctx.reply("Спасибо! Можно продолжать 🚀");
  return ctx.reply(mainMenuText, mainMenuKeyboard);
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

// Выбор города перед расписанием
const cityKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Москва", "sity_MSK")],
  [Markup.button.callback("Санкт-Петербург", "sity_SPB")],
]);

const sendCityChoice = (ctx: any) => {
  return ctx.reply("Выберите город", cityKeyboard);
};

bot.command("sity", (ctx) => sendCityChoice(ctx));

// 3. После выбора роли сразу показываем слоты (без упоминания команд)
bot.action("role_group_leader", (ctx) => {
  ctx.answerCbQuery();
  resetSession(ctx);
  return ctx
    .reply("Вы выбрали: Руководитель группы.")
    .then(() => showScheduleGroupLeader(ctx));
});

bot.action("role_student", (ctx) => {
  ctx.answerCbQuery();
  resetSession(ctx);
  return ctx
    .reply("Вы выбрали: Студент.")
    .then(() => showScheduleStudent(ctx));
});

// Расписание по городам
const STUDENT_SLOT_CAPACITY = 15;
const groupLeaderSlotsMSK = [
  "20 февраля, 15:00",
  "22 февраля, 11:00",
  "27 февраля, 16:00",
];

const groupLeaderSlotsSPB: string[] = [];

const studentSlotsMSK = [
  "25 февраля, 15:00",
  "26 февраля, 10:00",
  "28 февраля, 14:00",
];

const studentSlotsSPB: string[] = [];

const getCityFromSession = (ctx: any): "MSK" | "SPB" => {
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  const city = s.data?.city;
  return city === "SPB" ? "SPB" : "MSK";
};

const showScheduleGroupLeader = (ctx: any) => {
  const city = getCityFromSession(ctx);
  const allSlots =
    city === "SPB" ? groupLeaderSlotsSPB : groupLeaderSlotsMSK;
  if (!allSlots.length) {
    return ctx.reply(
      city === "SPB"
        ? "Для Санкт-Петербурга пока нет слотов для руководителей групп."
        : "Для Москвы пока нет слотов для руководителей групп."
    );
  }

  const cityLabel = city === "SPB" ? "Санкт-Петербург" : "Москва";
  return ctx.reply(
    `Доступные слоты (${cityLabel}):`,
    Markup.inlineKeyboard(
      allSlots.map((slot, index) => {
        const booked = isSlotConfirmed(`${slot}_${city}`);
        const label = booked ? `${slot} — Забронирован` : slot;
        return [Markup.button.callback(label, `slot_group_${city}_${index}`)];
      })
    )
  );
};

const showScheduleStudent = (ctx: any) => {
  const city = getCityFromSession(ctx);
  const allSlots = city === "SPB" ? studentSlotsSPB : studentSlotsMSK;
  if (!allSlots.length) {
    return ctx.reply(
      city === "SPB"
        ? "Для Санкт-Петербурга пока нет слотов для студентов."
        : "Для Москвы пока нет слотов для студентов."
    );
  }

  const cityLabel = city === "SPB" ? "Санкт-Петербург" : "Москва";
  return ctx.reply(
    `Доступные слоты (${cityLabel}):`,
    Markup.inlineKeyboard(
      allSlots.map((slot, index) => {
        const slotId = `${slot}_${city}`;
        const used = getStudentSlotCount(slotId);
        const remaining = Math.max(0, STUDENT_SLOT_CAPACITY - used);
        const availabilityLabel =
          remaining > 0
            ? `Доступно ${remaining}/${STUDENT_SLOT_CAPACITY}`
            : "Мест нет";
        const label = `${slot} — ${availabilityLabel}`;
        return [Markup.button.callback(label, `slot_student_${city}_${index}`)];
      })
    )
  );
};

// Тестовые команды по городам
bot.command("schedule_group_leader_MSK", (ctx) => {
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.data = s.data || {};
  s.data.city = "MSK";
  (ctx as any).session = s;
  return showScheduleGroupLeader(ctx);
});

bot.command("schedule_group_leader_SPB", (ctx) => {
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.data = s.data || {};
  s.data.city = "SPB";
  (ctx as any).session = s;
  return showScheduleGroupLeader(ctx);
});

bot.command("schedule_student_MSK", (ctx) => {
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.data = s.data || {};
  s.data.city = "MSK";
  (ctx as any).session = s;
  return showScheduleStudent(ctx);
});

bot.command("schedule_student_SPB", (ctx) => {
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.data = s.data || {};
  s.data.city = "SPB";
  (ctx as any).session = s;
  return showScheduleStudent(ctx);
});

// Выбор роли для расписания
const scheduleInfoText =
  "Для выбора свободных слотов, пожалуйста укажите, вы:";

const scheduleInfoKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Руководитель группы", "schedule_info_group")],
  [Markup.button.callback("Студент вуза", "schedule_info_student")],
]);

// Выбор города (inline-кнопки) → выбор роли (scheduleInfoKeyboard)
bot.action("sity_MSK", (ctx) => {
  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.data = s.data || {};
  s.data.city = "MSK";
  (ctx as any).session = s;

  return ctx.reply(scheduleInfoText, scheduleInfoKeyboard);
});

bot.action("sity_SPB", (ctx) => {
  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.data = s.data || {};
  s.data.city = "SPB";
  (ctx as any).session = s;

  return ctx.reply(scheduleInfoText, scheduleInfoKeyboard);
});

bot.command("schedule_info", (ctx) => sendCityChoice(ctx));

bot.action("schedule_info_group", (ctx) => {
  ctx.answerCbQuery();
  return showScheduleGroupLeader(ctx);
});

bot.action("schedule_info_student", (ctx) => {
  ctx.answerCbQuery();
  return showScheduleStudent(ctx);
});

// Кнопка «Расписание» в /main ведёт к выбору города
bot.action("main_schedule_info", (ctx) => {
  ctx.answerCbQuery();
  return ctx.reply("Выберите город", cityKeyboard);
});

// Обработка выбора слота руководителем группы
bot.action(/slot_group_.+/, (ctx) => {
  const raw =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? (ctx.callbackQuery.data as string)
      : "";

  ctx.answerCbQuery();

  const match = raw.match(/^slot_group_(MSK|SPB)_(\d+)$/);
  const cityCode = (match?.[1] as "MSK" | "SPB") || "MSK";
  const index = match ? parseInt(match[2], 10) : 0;
  const slots =
    cityCode === "SPB" ? groupLeaderSlotsSPB : groupLeaderSlotsMSK;
  const slotLabel = slots[index] ?? "неизвестный слот";
  const slotId = `${slotLabel}_${cityCode}`;

  if (isSlotConfirmed(slotId)) {
    const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
    s.data = s.data || {};
    s.data.slot = slotId;
    s.data.city = cityCode;
    (s.data as any).waitingListSlotLabel = slotLabel;
    (ctx as any).session = s;
    return ctx.reply(
      "Этот слот уже забронирован.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Вступить в лист ожидания", "waiting_list")],
      ])
    );
  }

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "group_leader";
  s.step = "surname";
  s.data = s.data || {};
  s.data.city = cityCode;
  s.data.slot = slotId;
  s.data.participants = [];
  s.data.tempParticipantName = undefined;
  (ctx as any).session = s;

  return ctx.reply(`Вы выбрали слот: ${slotLabel}\n\nВаша фамилия`);
});

// Обработка выбора слота студентом
bot.action(/slot_student_.+/, (ctx) => {
  const raw =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? (ctx.callbackQuery.data as string)
      : "";

  ctx.answerCbQuery();

  const match = raw.match(/^slot_student_(MSK|SPB)_(\d+)$/);
  const cityCode = (match?.[1] as "MSK" | "SPB") || "MSK";
  const index = match ? parseInt(match[2], 10) : 0;
  const slots = cityCode === "SPB" ? studentSlotsSPB : studentSlotsMSK;
  const slotLabel = slots[index] ?? "неизвестный слот";
  const slotId = `${slotLabel}_${cityCode}`;

  const used = getStudentSlotCount(slotId);
  if (used >= STUDENT_SLOT_CAPACITY) {
    const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
    s.data = s.data || {};
    s.data.slot = slotId;
    s.data.city = cityCode;
    (s.data as any).waitingListSlotLabel = slotLabel;
    (ctx as any).session = s;
    return ctx.reply(
      "Этот слот уже забронирован.",
      Markup.inlineKeyboard([
        [Markup.button.callback("Вступить в лист ожидания", "waiting_list")],
      ])
    );
  }

  // Явно работаем через session как через any, чтобы не мешала типизация
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "student";
  s.step = "surname";
  s.data = s.data || {};
  s.data.city = cityCode;
  s.data.slot = slotId;
  (ctx as any).session = s;

  return ctx.reply(
    `Вы выбрали слот: ${slotLabel}\n\nВаша фамилия`
  );
});

bot.action("waiting_list", (ctx) => {
  ctx.answerCbQuery();
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  const slot = s.data?.slot;
  if (!slot) {
    return ctx.reply("Сначала выберите слот в расписании.");
  }
  s.flow = "waiting_list";
  s.step = "waitingListSurname";
  s.data = s.data || {};
  (ctx as any).session = s;
  return ctx.reply("Введите фамилию");
});

bot.command("waiting_list", (ctx) => {
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  const slot = s.data?.slot;
  if (!slot) {
    return ctx.reply(
      "Чтобы вступить в лист ожидания, выберите слот в расписании и нажмите «Вступить в лист ожидания» под сообщением о забронированном слоте."
    );
  }
  s.flow = "waiting_list";
  s.step = "waitingListSurname";
  s.data = s.data || {};
  (ctx as any).session = s;
  return ctx.reply("Введите фамилию");
});

// Остальные команды-информационные
bot.command("schedule", (ctx) => sendCityChoice(ctx));

bot.command("faq", (ctx) =>
  ctx.reply("Ответы на самые частые вопросы", Markup.removeKeyboard())
);

bot.command("question", (ctx) =>
  {
    const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
    s.supportMode = "awaiting_first";
    (ctx as any).session = s;
    return ctx.reply(
      "Напишите ваш вопрос в чат, менеджер обработает его в ближайшее время и вернётся с ответом.",
      Markup.removeKeyboard()
    );
  });

const reminderKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Подтвердить", "reminder_confirm")],
  [
    Markup.button.callback("Изменить", "reminder_change"),
    Markup.button.callback("Отменить", "reminder_cancel"),
  ],
  [Markup.button.callback("Задать вопрос", "reminder_question")],
]);

const rulesKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback("Ознакомлен", "rules_ack")],
]);

const FEEDBACK_FORM_TEXT = "Спасибо, что пришли в гости! Заполните форму";
const feedbackKeyboardMSK = Markup.inlineKeyboard([
  [Markup.button.url("Заполнить форму", "https://www.google.com")],
]);
const feedbackKeyboardSPB = Markup.inlineKeyboard([
  [Markup.button.url("Заполнить форму", "https://ya.ru")],
]);

/** Рассылка сразу после регистрации: правила, два напоминания, форма обратной связи (по городу слота). */
async function sendPostRegistrationMailings(
  ctx: any,
  userId: number
): Promise<void> {
  const reg = getLastRegistration(userId);
  if (!reg) return;
  const summary = formatRegistrationSummary(reg.data as RegistrationData);
  const reminderText = `Вы зарегистрировались на экскурсию в Офис. Данные вашей заявки:\n\n${summary}`;
  const slot = reg.data?.slot ?? "";
  const isSPB = slot.endsWith("_SPB");
  const feedbackKeyboard = isSPB ? feedbackKeyboardSPB : feedbackKeyboardMSK;
  try {
    await ctx.telegram.sendMessage(userId, "Правила посещения офиса", rulesKeyboard);
    await ctx.telegram.sendMessage(userId, reminderText, reminderKeyboard);
    await ctx.telegram.sendMessage(userId, reminderText, reminderKeyboard);
    await ctx.telegram.sendMessage(userId, FEEDBACK_FORM_TEXT, feedbackKeyboard);
  } catch (e) {
    console.error("Ошибка рассылки после регистрации:", e);
  }
}

async function handleUserSupportMessage(
  ctx: any,
  userId: number,
  text: string,
  mode: "awaiting_first" | "active"
): Promise<void> {
  if (!SUPPORT_CHAT_ID) {
    console.error("SUPPORT_CHAT_ID is not настроен в ENV");
    return;
  }

  const session = (ctx as any).session as SessionData;

  let thread = getActiveThreadForUser(userId);

  if (!thread || mode === "awaiting_first") {
    const nick = formatUserNick(ctx);
    let topicId: number;
    try {
      const topic: any = await ctx.telegram.createForumTopic(
        SUPPORT_CHAT_ID,
        nick
      );
      topicId = topic.message_thread_id;
    } catch (e) {
      console.error("Не удалось создать топик для поддержки:", e);
      return;
    }

    const adminMsg = await ctx.telegram.sendMessage(
      SUPPORT_CHAT_ID,
      `Новый вопрос от ${nick} (id=${userId}):\n\n${text}`,
      { message_thread_id: topicId }
    );

    thread = createSupportThread({
      userId,
      username: ctx.from?.username,
      adminChatId: SUPPORT_CHAT_ID,
      adminTopicId: topicId,
      firstUserMessageId: adminMsg.message_id,
    });

    session.supportMode = "active";
    (ctx as any).session = session;

    await ctx.reply(
      "Ваш вопрос отправлен менеджеру. Мы ответим в ближайшее время."
    );
    return;
  }

  const adminMsg = await ctx.telegram.sendMessage(
    thread.adminChatId,
    `Сообщение от ${formatUserNick(ctx)} (id=${userId}) в диалоге ${thread.id}:\n\n${text}`,
    { message_thread_id: thread.adminTopicId }
  );

  updateSupportThread(thread.id, {
    status: "waiting",
    lastUserMessageId: adminMsg.message_id,
  });
}

bot.command("reminder_3day", (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return ctx.reply("Не удалось определить пользователя.");
  const reg = getLastRegistration(userId);
  if (!reg) {
    return ctx.reply("Нет данных о вашей регистрации на экскурсию.");
  }
  const summary = formatRegistrationSummary(reg.data as RegistrationData);
  return ctx.reply(
    `Вы зарегистрировались на экскурсию в Офис. Данные вашей заявки:\n\n${summary}`,
    reminderKeyboard
  );
});

bot.command("reminder_9am", (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return ctx.reply("Не удалось определить пользователя.");
  const reg = getLastRegistration(userId);
  if (!reg) {
    return ctx.reply("Нет данных о вашей регистрации на экскурсию.");
  }
  const summary = formatRegistrationSummary(reg.data as RegistrationData);
  return ctx.reply(
    `Вы зарегистрировались на экскурсию в Офис. Данные вашей заявки:\n\n${summary}`,
    reminderKeyboard
  );
});

bot.action("reminder_confirm", (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from?.id;
  if (!userId) return ctx.reply("Ошибка.");
  const reg = getLastRegistration(userId);
  if (!reg?.slot)
    return ctx.reply("Нет данных о регистрации.");
  if (reg.flow === "group_leader") {
    setSlotConfirmed(reg.slot);
  } else if (reg.flow === "student") {
    incrementStudentSlotCount(reg.slot, 1);
  }
  return ctx.reply("Спасибо, что подтвердили участие в экскурсии!");
});

bot.action("reminder_cancel", (ctx) => {
  ctx.answerCbQuery();
  const userId = ctx.from?.id;
  if (!userId) return ctx.reply("Ошибка.");
  const reg = getLastRegistration(userId);
  if (!reg?.slot)
    return ctx.reply("Нет данных о регистрации.");
  if (reg.flow === "group_leader") {
    setSlotAvailable(reg.slot);
  } else if (reg.flow === "student") {
    // Уменьшаем счётчик, но не даём уйти в минус
    incrementStudentSlotCount(reg.slot, -1);
  }
  return ctx.reply(
    "Вы отменили участие. Слот снова доступен для записи."
  );
});

bot.action("reminder_change", (ctx) => {
  ctx.answerCbQuery();
  return ctx.reply(
    "Если вы хотите изменить дату или время экскурсии, пройдите запись заново: меню → Расписание."
  );
});

bot.action("reminder_question", (ctx) => {
  ctx.answerCbQuery();
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.supportMode = "awaiting_first";
  (ctx as any).session = s;
  return ctx.reply(
    "Напишите ваш вопрос в чат, менеджер обработает его в ближайшее время и вернётся с ответом."
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

bot.command("feedback_form_MSK", (ctx) =>
  ctx.reply(FEEDBACK_FORM_TEXT, feedbackKeyboardMSK)
);

bot.command("feedback_form_SPB", (ctx) =>
  ctx.reply(FEEDBACK_FORM_TEXT, feedbackKeyboardSPB)
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

// Обработка шагов регистрации (студент и руководитель группы)
bot.on("text", async (ctx, next) => {
  const s = (ctx as any).session as SessionData | undefined;

  // Диалог поддержки: перенаправляем сообщения менеджерам
  if (s?.supportMode === "awaiting_first" || s?.supportMode === "active") {
    const text = ctx.message.text.trim();
    try {
      const userId = ctx.from?.id;
      if (userId && SUPPORT_CHAT_ID) {
        await handleUserSupportMessage(ctx, userId, text, s.supportMode);
      }
    } catch (e) {
      console.error("Ошибка обработки сообщения поддержки:", e);
    }
    return;
  }

  if (!s || !s.flow || !s.step) {
    return next();
  }

  const text = ctx.message.text.trim();
  s.data = s.data || {};

  if (s.flow === "student") {
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
        // Университет выбирается по кнопкам, текст сюда не ожидается
        return ctx.reply(
          "Пожалуйста, выберите вариант из кнопок ниже, а не вводите текстом."
        );

      case "faculty":
        // Факультет теперь пользователь вводит текстом
        s.data.faculty = text;
        setStudentFlowStep(ctx, "confirm");
        const summary = formatRegistrationSummary(s.data);
        return ctx.reply(
          `Давайте сверим данные:\n\n${summary}\n\nЕсли они верны, нажмите кнопку «Подтвердить».`,
          Markup.inlineKeyboard([
            Markup.button.callback(
              "Подтвердить",
              "student_data_verification"
            ),
          ])
        );

      default:
        resetSession(ctx);
        return ctx.reply(
          "Что-то пошло не так, давайте начнём сначала. Выберите «Расписание» в меню и снова выберите слот."
        );
    }
  }

  if (s.flow === "group_leader") {
    switch (s.step) {
      case "surname":
        s.data.surname = text;
        s.step = "name";
        (ctx as any).session = s;
        return ctx.reply("Ваше имя");

      case "name":
        s.data.name = text;
        s.step = "patronymic";
        (ctx as any).session = s;
        return ctx.reply("Ваше отчество");

      case "patronymic":
        s.data.patronymic = text;
        s.step = "birthDate";
        (ctx as any).session = s;
        return ctx.reply("Дата рождения (формат 00.00.0000)");

      case "birthDate":
        s.data.birthDate = text;
        s.step = "email";
        (ctx as any).session = s;
        return ctx.reply("Ваша почта");

      case "email":
        s.data.email = text;
        s.step = "phone";
        (ctx as any).session = s;
        return ctx.reply("Ваш номер телефона (формат 79*********)");

      case "phone":
        s.data.phone = text;
        s.step = "institutionType";
        (ctx as any).session = s;
        return ctx.reply(
          "Какое учебное заведение представляете",
          Markup.inlineKeyboard([
            [
              Markup.button.callback("ВУЗ", "institution_university"),
              Markup.button.callback("Школа", "institution_school"),
              Markup.button.callback("СПО", "institution_spo"),
            ],
          ])
        );

      case "institutionType":
        return ctx.reply(
          "Пожалуйста, выберите один из вариантов с помощью кнопок ниже."
        );

      case "schoolName":
        s.data.institutionType = "school";
        s.data.institutionName = text;
        return sendParticipantsIntro(ctx, s);

      case "spoName":
        s.data.institutionType = "spo";
        s.data.institutionName = text;
        return sendParticipantsIntro(ctx, s);

      case "university":
        return ctx.reply(
          "Пожалуйста, выберите университет из кнопок ниже, а не вводите текстом."
        );

      case "faculty":
        s.data.faculty = text;
        return sendParticipantsIntro(ctx, s);

      case "participantsFio":
        s.data.tempParticipantName = text;
        s.step = "participantsBirthDate";
        (ctx as any).session = s;
        return ctx.reply(
          "Дата рождения участника (формат 00.00.0000)"
        );

      case "participantsBirthDate": {
        const ageOk = isAgeAtLeast14(text);
        if (!ageOk) {
          return ctx.reply(
            "Возраст участника должен быть старше 14 лет!"
          );
        }

        const name = s.data.tempParticipantName ?? "Без имени";
        const participants = s.data.participants || [];
        participants.push({ fullName: name, birthDate: text });
        s.data.participants = participants;
        s.data.tempParticipantName = undefined;

        const listText = formatParticipantsList(participants);
        (ctx as any).session = s;
        return ctx.reply(listText, buildParticipantsListKeyboard(participants));
      }

      case "editParticipantFio": {
        const idx = s.data.editingParticipantIndex ?? 0;
        const participants = s.data.participants ?? [];
        if (idx < 0 || idx >= participants.length) {
          s.step = "participantsFio";
          s.data.editingParticipantIndex = undefined;
          (ctx as any).session = s;
          return ctx.reply("Ошибка. Укажите ФИО участника.");
        }
        participants[idx].fullName = text;
        s.step = "editParticipantBirthDate";
        (ctx as any).session = s;
        return ctx.reply("Введите новую дату рождения /participants_birth_date");
      }

      case "editParticipantBirthDate": {
        const ageOk = isAgeAtLeast14(text);
        if (!ageOk) {
          return ctx.reply(
            "Возраст участника должен быть старше 14 лет!"
          );
        }
        const idx = s.data.editingParticipantIndex ?? 0;
        const participants = s.data.participants ?? [];
        if (idx < 0 || idx >= participants.length) {
          s.step = "participantsFio";
          s.data.editingParticipantIndex = undefined;
          (ctx as any).session = s;
          return ctx.reply("Ошибка. Укажите ФИО участника.");
        }
        participants[idx].birthDate = text;
        s.data.editingParticipantIndex = undefined;
        s.step = "participantsFio";
        (ctx as any).session = s;
        const listText = formatParticipantsList(participants);
        return ctx.reply(listText, buildParticipantsListKeyboard(participants));
      }

      default:
        resetSession(ctx);
        return ctx.reply(
          "Что-то пошло не так, давайте начнём сначала. Выберите «Расписание» в меню и снова выберите слот."
        );
    }
  }

  if (s.flow === "waiting_list") {
    const slotLabel = (s.data as any).waitingListSlotLabel ?? s.data.slot ?? "слот";
    switch (s.step) {
      case "waitingListSurname":
        s.data.surname = text;
        s.step = "waitingListName";
        (ctx as any).session = s;
        return ctx.reply("Введите имя");

      case "waitingListName":
        s.data.name = text;
        s.step = "waitingListPatronymic";
        (ctx as any).session = s;
        return ctx.reply("Введите отчество");

      case "waitingListPatronymic":
        s.data.patronymic = text;
        s.step = "waitingListPhone";
        (ctx as any).session = s;
        return ctx.reply("Введите номер телефона (формат 79*********)");

      case "waitingListPhone":
        s.data.phone = text;
        s.step = "waitingListEmail";
        (ctx as any).session = s;
        return ctx.reply("Введите почту");

      case "waitingListEmail": {
        s.data.email = text;
        const userId = ctx.from?.id;
        try {
          await appendWaitingList({
            telegramUserId: userId,
            city: s.data.city ?? "MSK",
            slot: s.data.slot ?? "",
            surname: s.data.surname,
            name: s.data.name,
            patronymic: s.data.patronymic,
            phone: s.data.phone,
            email: s.data.email,
          });
        } catch (e) {
          console.error("Ошибка записи в лист ожидания:", e);
        }
        resetSession(ctx);
        return ctx.reply(
          `Вы добавлены в лист ожидания на слот ${slotLabel}. Мы свяжемся с вами, если место освободится.`
        );
      }

      default:
        resetSession(ctx);
        return ctx.reply("Начните заново: выберите слот в расписании и нажмите «Вступить в лист ожидания».");
    }
  }

  return next();
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
  // Сохраняем текущий flow (student или group_leader), по умолчанию считаем student
  s.flow = s.flow || "student";
  s.step = "faculty";
  s.data = s.data || {};
  s.data.university = uni;
  (ctx as any).session = s;

  return ctx.reply("Напишите ваш факультет");
});

// Выбор типа учреждения и работа с участниками (анкета руководителя группы)
bot.action("institution_university", (ctx) => {
  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "group_leader";
  s.step = "university";
  s.data = s.data || {};
  s.data.institutionType = "university";
  (ctx as any).session = s;

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
});

bot.action("institution_school", (ctx) => {
  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "group_leader";
  s.step = "schoolName";
  s.data = s.data || {};
  s.data.institutionType = "school";
  (ctx as any).session = s;

  return ctx.reply("Впишите полное наименование школы");
});

bot.action("institution_spo", (ctx) => {
  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "group_leader";
  s.step = "spoName";
  s.data = s.data || {};
  s.data.institutionType = "spo";
  (ctx as any).session = s;

  return ctx.reply("Впишите полное наименование СПО");
});

bot.action("participants_add", (ctx) => {
  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "group_leader";
  s.step = "participantsFio";
  s.data = s.data || {};
  (ctx as any).session = s;

  return ctx.reply("Укажите ФИО участника");
});

bot.action("participants_edit", (ctx) => {
  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  const participants = s.data?.participants ?? [];
  if (participants.length === 0) {
    return ctx.reply("Нет участников для изменения.");
  }

  const buttons = participants.map((_, i) => [
    Markup.button.callback(`Участник ${i + 1}`, `participants_edit_${i}`),
  ]);
  return ctx.reply(
    "Какого участника вы хотите изменить?",
    Markup.inlineKeyboard(buttons)
  );
});

bot.action(/participants_edit_\d+/, (ctx) => {
  const raw =
    ctx.callbackQuery && "data" in ctx.callbackQuery
      ? (ctx.callbackQuery.data as string)
      : "";
  const match = raw.match(/participants_edit_(\d+)/);
  const index = match ? parseInt(match[1], 10) : 0;

  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "group_leader";
  s.step = "editParticipantFio";
  s.data = s.data || {};
  s.data.editingParticipantIndex = index;
  (ctx as any).session = s;

  return ctx.reply("Введите новое ФИО /participants_fio");
});

bot.action("group_leader_data_verification", (ctx) => {
  ctx.answerCbQuery();

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.flow = "group_leader";
  s.step = "groupLeaderConfirm";
  s.data = s.data || {};
  (ctx as any).session = s;

  const summary = formatRegistrationSummary(s.data);
  return ctx.reply(
    `Давайте сверим данные:\n\n${summary}\n\nЕсли они верны, нажмите кнопку «Подтвердить».`,
    Markup.inlineKeyboard([
      Markup.button.callback("Подтвердить", "group_leader_confirm"),
    ])
  );
});

bot.action("group_leader_confirm", async (ctx) => {
  const s = (ctx as any).session as SessionData | undefined;
  const data = s?.data;

  ctx.answerCbQuery();

  if (!data) {
    return ctx.reply(
      "Не удалось найти данные регистрации. Пожалуйста, начните заново: меню → Расписание → Руководитель группы."
    );
  }

  const userId = ctx.from?.id;
  try {
    await appendGroupLeader({
      telegramUserId: userId,
      slot: data.slot ?? "",
      surname: data.surname,
      name: data.name,
      patronymic: data.patronymic,
      birthDate: data.birthDate,
      email: data.email,
      phone: data.phone,
      institutionType: data.institutionType,
      institutionName: data.institutionName,
      faculty: data.faculty,
      participants: data.participants,
    });
  } catch (e) {
    console.error("Ошибка записи в Excel (руководитель группы):", e);
  }

  if (userId && data.slot) {
    setLastRegistration(userId, "group_leader", data.slot, {
      slot: data.slot,
      surname: data.surname,
      name: data.name,
      patronymic: data.patronymic,
      birthDate: data.birthDate,
      email: data.email,
      phone: data.phone,
      institutionType: data.institutionType,
      institutionName: data.institutionName,
      faculty: data.faculty,
      participants: data.participants,
    });
    setSlotConfirmed(data.slot);
  }

  const summary = formatRegistrationSummary(data);
  resetSession(ctx);

  await ctx.reply(
    `Заявка руководителя группы подтверждена!\n\n${summary}\n\nСпасибо, что записались на экскурсию.`
  );
  if (userId) await sendPostRegistrationMailings(ctx, userId);
});

bot.action("student_data_verification", async (ctx) => {
  const s = (ctx as any).session as SessionData | undefined;
  const data = s?.data;

  ctx.answerCbQuery();

  if (!data) {
    return ctx.reply(
      "Не удалось найти данные регистрации. Пожалуйста, начните заново: меню → Расписание → Студент вуза."
    );
  }

  const userId = ctx.from?.id;
  try {
    await appendStudent({
      telegramUserId: userId,
      slot: data.slot ?? "",
      surname: data.surname,
      name: data.name,
      patronymic: data.patronymic,
      birthDate: data.birthDate,
      email: data.email,
      phone: data.phone,
      university: data.university,
      faculty: data.faculty,
    });
  } catch (e) {
    console.error("Ошибка записи в Excel (студент):", e);
  }

  if (userId && data.slot) {
    setLastRegistration(userId, "student", data.slot, {
      slot: data.slot,
      surname: data.surname,
      name: data.name,
      patronymic: data.patronymic,
      birthDate: data.birthDate,
      email: data.email,
      phone: data.phone,
      university: data.university,
      faculty: data.faculty,
    });
    // Счётчик фактических регистраций увеличиваем только после отдельного подтверждения участия
  }

  const summary = formatRegistrationSummary(data);
  resetSession(ctx);

  await ctx.reply(
    `Заявка подтверждена!\n\n${summary}\n\nСпасибо, что записались на экскурсию.`
  );
  if (userId) await sendPostRegistrationMailings(ctx, userId);
});

// Команда для повторного показа панели администратора
bot.command("admin_info", (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(
      "Доступ запрещён. Введите пароль администратора отдельным сообщением."
    );
  }
  return ctx.reply(adminInfoText);
});

// Экспорт данных в Excel по слоту (только для администратора)
bot.command("export_student", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(
      "Доступ запрещён. Введите пароль администратора отдельным сообщением."
    );
  }
  const text = ctx.message?.text || "";
  const args = text.split(" ").slice(1).join(" ").trim();

  if (!args) {
    return ctx.reply(
      "Укажите слот, например:\n/export_student 25 февраля, 15:00_MSK"
    );
  }

  const filePath = await exportStudentsSlot(args);
  if (!filePath) {
    return ctx.reply(
      "Не найдено данных для этого слота (студенты). Убедитесь, что слот указан так же, как в боте."
    );
  }

  return ctx.replyWithDocument({
    source: fs.createReadStream(filePath),
    filename: path.basename(filePath),
  });
});

// Обработка сообщений менеджеров в чате поддержки (супергруппа с топиками)
bot.on("message", async (ctx, next) => {
  if (!SUPPORT_CHAT_ID || ctx.chat?.id !== SUPPORT_CHAT_ID) {
    return next();
  }

  const msg: any = ctx.message;
  if (!msg || typeof msg.message_thread_id !== "number") {
    return next();
  }

  // интересуют только ответы живых людей, не бота
  if (ctx.from?.is_bot) {
    return next();
  }

  if (!msg.text) {
    return next();
  }

  const thread = findThreadByTopic(SUPPORT_CHAT_ID, msg.message_thread_id);
  if (!thread) {
    return next();
  }

  try {
    await ctx.telegram.sendMessage(
      thread.userId,
      `Ответ менеджера:\n\n${msg.text}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "Завершить диалог",
            `support_close_${thread.id}`
          ),
          Markup.button.callback(
            "Продолжить",
            `support_continue_${thread.id}`
          ),
        ],
      ])
    );

    updateSupportThread(thread.id, {
      status: "answered",
      lastAdminMessageId: msg.message_id,
    });
  } catch (e) {
    console.error(
      "Ошибка отправки ответа пользователю из чата поддержки:",
      e
    );
  }
});

bot.action(/support_close_(.+)/, (ctx) => {
  const threadId = ctx.match[1];
  const thread = getSupportThreadById(threadId);
  if (!thread || ctx.from?.id !== thread.userId) {
    return ctx.answerCbQuery();
  }

  closeSupportThread(threadId);
  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.supportMode = undefined;
  (ctx as any).session = s;

  ctx.answerCbQuery("Диалог завершён.");
  return ctx.reply(
    "Диалог завершён. Если захотите задать новый вопрос, нажмите «Задать вопрос» в меню."
  );
});

bot.action(/support_continue_(.+)/, (ctx) => {
  const threadId = ctx.match[1];
  const thread = getSupportThreadById(threadId);
  if (!thread || ctx.from?.id !== thread.userId) {
    return ctx.answerCbQuery();
  }

  updateSupportThread(threadId, { status: "waiting" });

  const s = ((ctx as any).session || ({} as SessionData)) as SessionData;
  s.supportMode = "active";
  (ctx as any).session = s;

  ctx.answerCbQuery("Можете задать следующий вопрос.");
  return ctx.reply("Напишите ваш следующий вопрос в чат.");
});

bot.command("export_group_leader", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(
      "Доступ запрещён. Введите пароль администратора отдельным сообщением."
    );
  }
  const text = ctx.message?.text || "";
  const args = text.split(" ").slice(1).join(" ").trim();

  if (!args) {
    return ctx.reply(
      "Укажите слот, например:\n/export_group_leader 20 февраля, 15:00_MSK"
    );
  }

  const filePath = await exportGroupLeadersSlot(args);
  if (!filePath) {
    return ctx.reply(
      "Не найдено данных для этого слота (руководители групп). Убедитесь, что слот указан так же, как в боте."
    );
  }

  return ctx.replyWithDocument({
    source: fs.createReadStream(filePath),
    filename: path.basename(filePath),
  });
});

// Выгрузка листа ожидания (для администратора)
bot.command("waiting_list_admin", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(
      "Доступ запрещён. Введите пароль администратора отдельным сообщением."
    );
  }

  if (!fs.existsSync(WAITING_LIST_FILE)) {
    return ctx.reply("Файл листа ожидания пока не создан.");
  }

  try {
    return await ctx.replyWithDocument({
      source: fs.createReadStream(WAITING_LIST_FILE),
      filename: path.basename(WAITING_LIST_FILE),
    });
  } catch (e) {
    console.error("Ошибка отправки файла листа ожидания:", e);
    return ctx.reply("Не удалось отправить файл листа ожидания.");
  }
});

// Общая рассылка всем пользователям, которые когда-либо взаимодействовали с ботом
bot.command("send_mailing", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(
      "Доступ запрещён. Введите пароль администратора отдельным сообщением."
    );
  }

  const text = ctx.message?.text || "";
  const messageText = text.replace("/send_mailing", "").trim();

  if (!messageText) {
    return ctx.reply(
      "Использование:\n/send_mailing Текст сообщения для всех пользователей"
    );
  }

  const users = getAllUsers();
  if (!users.length) {
    return ctx.reply("Пока нет пользователей для рассылки.");
  }

  let success = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await ctx.telegram.sendMessage(user.id, messageText);
      success += 1;
    } catch (e) {
      failed += 1;
      console.error(
        `Не удалось отправить сообщение пользователю ${user.id}:`,
        e
      );
    }
  }

  return ctx.reply(
    `Рассылка завершена.\nУспешно: ${success}\nОшибок: ${failed}`
  );
});

// Рассылка по листу ожидания для конкретного слота
bot.command("send_mailing_waiting_list", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(
      "Доступ запрещён. Введите пароль администратора отдельным сообщением."
    );
  }

  const text = ctx.message?.text || "";
  const [firstLine, ...restLines] = text.split("\n");
  const [command, ...slotParts] = firstLine.split(" ");
  const slot = slotParts.join(" ").trim();
  const messageText = restLines.join("\n").trim();

  if (!slot || !messageText) {
    return ctx.reply(
      "Использование:\n/send_mailing_waiting_list 20 февраля, 15:00_MSK\nТекст сообщения"
    );
  }

  if (!fs.existsSync(WAITING_LIST_FILE)) {
    return ctx.reply(
      "Файл листа ожидания пока не создан. Нет пользователей для рассылки."
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(WAITING_LIST_FILE);
  } catch (e) {
    console.error("Ошибка чтения waiting_list.xlsx:", e);
    return ctx.reply("Не удалось прочитать файл листа ожидания.");
  }

  const sheet = workbook.getWorksheet("Лист ожидания");
  if (!sheet) {
    return ctx.reply("В файле листа ожидания нет листа с данными.");
  }

  const userIds = new Set<number>();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // пропускаем заголовок
    const slotCell = row.getCell(3).value;
    if (typeof slotCell !== "string") return;
    if (slotCell.trim() !== slot) return;

    const idCell = row.getCell(1).value;
    if (idCell == null) return;
    const idNum =
      typeof idCell === "number"
        ? idCell
        : Number(
            typeof idCell === "object" && "toString" in idCell
              ? (idCell as any).toString()
              : idCell
          );
    if (!Number.isFinite(idNum)) return;
    userIds.add(idNum);
  });

  if (!userIds.size) {
    return ctx.reply(
      `В листе ожидания нет пользователей для слота "${slot}".`
    );
  }

  let success = 0;
  let failed = 0;

  for (const id of userIds) {
    try {
      await ctx.telegram.sendMessage(id, messageText);
      success += 1;
    } catch (e) {
      failed += 1;
      console.error(
        `Не удалось отправить сообщение пользователю ${id} из листа ожидания:`,
        e
      );
    }
  }

  return ctx.reply(
    `Рассылка по листу ожидания для слота "${slot}" завершена.\nУспешно: ${success}\nОшибок: ${failed}`
  );
});

// Экспорт базы всех пользователей, взаимодействовавших с ботом
bot.command("export_data", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply(
      "Доступ запрещён. Введите пароль администратора отдельным сообщением."
    );
  }

  try {
    const filePath = await exportUsersToExcel();
    return ctx.replyWithDocument({
      source: fs.createReadStream(filePath),
      filename: path.basename(filePath),
    });
  } catch (e) {
    console.error("Ошибка экспорта данных пользователей:", e);
    return ctx.reply("Не удалось выгрузить список пользователей.");
  }
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
