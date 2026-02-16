import * as ExcelJS from "exceljs";
import * as path from "path";
import * as fs from "fs";

const REGISTRATIONS_DIR = path.join(process.cwd(), "registrations");
const STUDENTS_FILE = path.join(REGISTRATIONS_DIR, "students.xlsx");
const GROUP_LEADERS_FILE = path.join(REGISTRATIONS_DIR, "group_leaders.xlsx");

const MAX_SHEET_NAME_LENGTH = 31;
const INVALID_SHEET_CHARS = /[\\/*?:\[\]]/g;

export interface StudentRegistrationData {
  slot: string;
  surname?: string;
  name?: string;
  patronymic?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  university?: string;
  faculty?: string;
}

export interface GroupLeaderRegistrationData {
  slot: string;
  surname?: string;
  name?: string;
  patronymic?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  institutionType?: string;
  institutionName?: string;
  faculty?: string;
  participants?: { fullName: string; birthDate: string }[];
}

function ensureDir() {
  if (!fs.existsSync(REGISTRATIONS_DIR)) {
    fs.mkdirSync(REGISTRATIONS_DIR, { recursive: true });
  }
}

function slotToSheetName(slot: string): string {
  const sanitized = slot.replace(INVALID_SHEET_CHARS, " ").replace(/\s+/g, " ").trim();
  if (sanitized.length <= MAX_SHEET_NAME_LENGTH) return sanitized;
  return sanitized.slice(0, MAX_SHEET_NAME_LENGTH);
}

async function getOrCreateWorkbook(filePath: string): Promise<ExcelJS.Workbook> {
  ensureDir();
  const workbook = new ExcelJS.Workbook();
  if (fs.existsSync(filePath)) {
    await workbook.xlsx.readFile(filePath);
  }
  return workbook;
}

async function getOrCreateSheet(
  workbook: ExcelJS.Workbook,
  sheetName: string
): Promise<ExcelJS.Worksheet> {
  const name = slotToSheetName(sheetName);
  let sheet = workbook.getWorksheet(name);
  if (!sheet) {
    sheet = workbook.addWorksheet(name);
  }
  return sheet;
}

const STUDENT_HEADERS = [
  "Слот",
  "Фамилия",
  "Имя",
  "Отчество",
  "Дата рождения",
  "Почта",
  "Телефон",
  "Университет",
  "Факультет",
];

function ensureStudentHeaders(sheet: ExcelJS.Worksheet) {
  if (sheet.rowCount < 1) {
    sheet.addRow(STUDENT_HEADERS);
  }
}

const GROUP_LEADER_HEADERS = [
  "Слот",
  "Фамилия",
  "Имя",
  "Отчество",
  "Дата рождения",
  "Почта",
  "Телефон",
  "Тип учреждения",
  "Название учреждения",
  "Факультет",
  "Участники (ФИО, дата рождения)",
];

function ensureGroupLeaderHeaders(sheet: ExcelJS.Worksheet) {
  if (sheet.rowCount < 1) {
    sheet.addRow(GROUP_LEADER_HEADERS);
  }
}

export async function appendStudent(data: StudentRegistrationData): Promise<void> {
  const workbook = await getOrCreateWorkbook(STUDENTS_FILE);
  const sheet = await getOrCreateSheet(workbook, data.slot);
  ensureStudentHeaders(sheet);
  sheet.addRow([
    data.slot ?? "",
    data.surname ?? "",
    data.name ?? "",
    data.patronymic ?? "",
    data.birthDate ?? "",
    data.email ?? "",
    data.phone ?? "",
    data.university ?? "",
    data.faculty ?? "",
  ]);
  await workbook.xlsx.writeFile(STUDENTS_FILE);
}

function formatParticipantsColumn(participants: { fullName: string; birthDate: string }[]): string {
  return (participants ?? [])
    .map((p) => `${p.fullName} — ${p.birthDate}`)
    .join("; ");
}

export async function appendGroupLeader(data: GroupLeaderRegistrationData): Promise<void> {
  const workbook = await getOrCreateWorkbook(GROUP_LEADERS_FILE);
  const sheet = await getOrCreateSheet(workbook, data.slot);
  ensureGroupLeaderHeaders(sheet);
  const institutionTypeLabel =
    data.institutionType === "university"
      ? "ВУЗ"
      : data.institutionType === "school"
      ? "Школа"
      : data.institutionType === "spo"
      ? "СПО"
      : data.institutionType ?? "";
  sheet.addRow([
    data.slot ?? "",
    data.surname ?? "",
    data.name ?? "",
    data.patronymic ?? "",
    data.birthDate ?? "",
    data.email ?? "",
    data.phone ?? "",
    institutionTypeLabel,
    data.institutionName ?? "",
    data.faculty ?? "",
    formatParticipantsColumn(data.participants ?? []),
  ]);
  await workbook.xlsx.writeFile(GROUP_LEADERS_FILE);
}

async function loadWorkbookIfExists(filePath: string): Promise<ExcelJS.Workbook | null> {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  return workbook;
}

async function exportSingleSheetWorkbook(
  sourceFile: string,
  slot: string,
  prefix: string
): Promise<string | null> {
  ensureDir();
  const sourceWb = await loadWorkbookIfExists(sourceFile);
  if (!sourceWb) return null;

  const sheetName = slotToSheetName(slot);
  const sourceSheet = sourceWb.getWorksheet(sheetName);
  if (!sourceSheet) return null;

  const outWb = new ExcelJS.Workbook();
  const outSheet = outWb.addWorksheet(sheetName);

  sourceSheet.eachRow((row) => {
    const values = row.values as any[];
    // row.values[0] зарезервирован, данные начинаются с индекса 1
    outSheet.addRow(values.slice(1));
  });

  const safeName = sheetName.replace(/\\s+/g, "_");
  const outPath = path.join(REGISTRATIONS_DIR, `${prefix}_${safeName}.xlsx`);
  await outWb.xlsx.writeFile(outPath);
  return outPath;
}

export async function exportStudentsSlot(slot: string): Promise<string | null> {
  return exportSingleSheetWorkbook(STUDENTS_FILE, slot, "students");
}

export async function exportGroupLeadersSlot(slot: string): Promise<string | null> {
  return exportSingleSheetWorkbook(GROUP_LEADERS_FILE, slot, "group_leaders");
}
