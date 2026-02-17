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
  // Для студентов храним количество подтверждённых регистраций на слот
  studentSlotCounts: Record<string, number>;
}

function normalizeStore(raw: Partial<Store> | null | undefined): Store {
  const store = raw ?? {};
  return {
    lastByUser: store.lastByUser || {},
    confirmedSlots: store.confirmedSlots || {},
    studentSlotCounts: store.studentSlotCounts || {},
  };
}

function ensureDir() {
  if (!fs.existsSync(REGISTRATIONS_DIR)) {
    fs.mkdirSync(REGISTRATIONS_DIR, { recursive: true });
  }
}

function readStore(): Store {
  ensureDir();
  if (!fs.existsSync(STORE_FILE)) {
    return { lastByUser: {}, confirmedSlots: {}, studentSlotCounts: {} };
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return normalizeStore(parsed);
  } catch {
    return { lastByUser: {}, confirmedSlots: {}, studentSlotCounts: {} };
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

export function getStudentSlotCount(slotId: string): number {
  const store = readStore();
  return store.studentSlotCounts[slotId] ?? 0;
}

export function incrementStudentSlotCount(slotId: string, delta = 1) {
  if (!slotId) return;
  const store = readStore();
  const current = store.studentSlotCounts[slotId] ?? 0;
  const next = current + delta;
  store.studentSlotCounts[slotId] = next < 0 ? 0 : next;
  writeStore(store);
}
