import * as fs from "fs";
import * as path from "path";
import * as ExcelJS from "exceljs";

const REGISTRATIONS_DIR = path.join(process.cwd(), "registrations");
const USERS_STORE_FILE = path.join(REGISTRATIONS_DIR, "users_store.json");
const USERS_XLSX_FILE = path.join(REGISTRATIONS_DIR, "users.xlsx");

interface StoredUser {
  id: number;
  username?: string;
  firstName?: string;
  lastName?: string;
}

interface UsersStore {
  users: Record<string, StoredUser>;
}

function ensureDir() {
  if (!fs.existsSync(REGISTRATIONS_DIR)) {
    fs.mkdirSync(REGISTRATIONS_DIR, { recursive: true });
  }
}

function readStore(): UsersStore {
  ensureDir();
  if (!fs.existsSync(USERS_STORE_FILE)) {
    return { users: {} };
  }
  try {
    const raw = fs.readFileSync(USERS_STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<UsersStore>;
    return {
      users: parsed.users || {},
    };
  } catch {
    return { users: {} };
  }
}

function writeStore(store: UsersStore) {
  ensureDir();
  fs.writeFileSync(USERS_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function recordUserFromContext(ctx: any) {
  const from = ctx.from;
  if (!from || typeof from.id !== "number") return;

  const store = readStore();
  const existing = store.users[String(from.id)] || { id: from.id };

  const updated: StoredUser = {
    id: from.id,
    username: from.username ?? existing.username,
    firstName: from.first_name ?? existing.firstName,
    lastName: from.last_name ?? existing.lastName,
  };

  store.users[String(from.id)] = updated;
  writeStore(store);
}

export async function exportUsersToExcel(): Promise<string> {
  ensureDir();
  const store = readStore();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Users");

  sheet.addRow(["Telegram user id", "Username", "First name", "Last name"]);

  const users = Object.values(store.users).sort((a, b) => a.id - b.id);
  for (const user of users) {
    sheet.addRow([
      user.id,
      user.username ?? "",
      user.firstName ?? "",
      user.lastName ?? "",
    ]);
  }

  await workbook.xlsx.writeFile(USERS_XLSX_FILE);
  return USERS_XLSX_FILE;
}

