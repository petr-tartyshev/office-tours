import * as fs from "fs";
import * as path from "path";

const REGISTRATIONS_DIR = path.join(process.cwd(), "registrations");
const STORE_FILE = path.join(REGISTRATIONS_DIR, "registrations_store.json");

export interface StoredRegistrationData {
  slot?: string;
  surname?: string;
  name?: string;
  patronymic?: string;
  birthDate?: string;
  email?: string;
  phone?: string;
  university?: string;
  faculty?: string;
  institutionType?: string;
  institutionName?: string;
  participants?: { fullName: string; birthDate: string }[];
}

export interface StoredRegistration {
  flow: "student" | "group_leader";
  slot: string;
  data: StoredRegistrationData;
}

interface Store {
  lastByUser: Record<string, StoredRegistration>;
  confirmedSlots: Record<string, boolean>;
}

function ensureDir() {
  if (!fs.existsSync(REGISTRATIONS_DIR)) {
    fs.mkdirSync(REGISTRATIONS_DIR, { recursive: true });
  }
}

function readStore(): Store {
  ensureDir();
  if (!fs.existsSync(STORE_FILE)) {
    return { lastByUser: {}, confirmedSlots: {} };
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    return JSON.parse(raw) as Store;
  } catch {
    return { lastByUser: {}, confirmedSlots: {} };
  }
}

function writeStore(store: Store) {
  ensureDir();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function getLastRegistration(userId: number): StoredRegistration | null {
  const store = readStore();
  const r = store.lastByUser[String(userId)];
  return r ?? null;
}

export function setLastRegistration(
  userId: number,
  flow: "student" | "group_leader",
  slot: string,
  data: StoredRegistrationData
) {
  const store = readStore();
  store.lastByUser[String(userId)] = { flow, slot, data };
  writeStore(store);
}

export function isSlotConfirmed(slotId: string): boolean {
  const store = readStore();
  return !!store.confirmedSlots[slotId];
}

export function setSlotConfirmed(slotId: string) {
  const store = readStore();
  store.confirmedSlots[slotId] = true;
  writeStore(store);
}

export function setSlotAvailable(slotId: string) {
  const store = readStore();
  delete store.confirmedSlots[slotId];
  writeStore(store);
}
