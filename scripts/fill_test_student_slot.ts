import { appendStudent } from "../src/excel-registrations";
import { incrementStudentSlotCount } from "../src/registrations-store";

const SLOT_ID = "25 февраля, 15:00_MSK";
const CAPACITY = 15;

async function main() {
  console.log(`Filling slot "${SLOT_ID}" with ${CAPACITY} test students...`);

  for (let i = 1; i <= CAPACITY; i++) {
    const idx = i.toString().padStart(2, "0");
    await appendStudent({
      telegramUserId: 100000000 + i,
      slot: SLOT_ID,
      surname: `Тестовый${idx}`,
      name: `Студент${idx}`,
      patronymic: `Тестович${idx}`,
      birthDate: `01.01.200${i % 10}`,
      email: `student${idx}@example.com`,
      phone: `79000000${idx}`,
      university: "Тестовый университет",
      faculty: "Тестовый факультет",
    });
  }

  // Устанавливаем количество подтверждённых студентов на максимум,
  // чтобы слот считался полностью занятым.
  incrementStudentSlotCount(SLOT_ID, CAPACITY);

  console.log("Done.");
}

main().catch((e) => {
  console.error("Error filling test slot:", e);
  process.exit(1);
});

