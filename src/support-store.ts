import * as fs from "fs";
import * as path from "path";

const REGISTRATIONS_DIR = path.join(process.cwd(), "registrations");
const SUPPORT_STORE_FILE = path.join(REGISTRATIONS_DIR, "support_store.json");

export type SupportStatus = "waiting" | "answered" | "closed";

export interface SupportThread {
  id: string;
  userId: number;
  username?: string;
  adminChatId: number;
  adminTopicId: number;
  lastUserMessageId?: number;
  lastAdminMessageId?: number;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
}

interface SupportStore {
  threads: Record<string, SupportThread>;
  threadsByUser: Record<string, string>; // userId -> threadId (активный диалог)
}

function ensureDir() {
  if (!fs.existsSync(REGISTRATIONS_DIR)) {
    fs.mkdirSync(REGISTRATIONS_DIR, { recursive: true });
  }
}

function readStore(): SupportStore {
  ensureDir();
  if (!fs.existsSync(SUPPORT_STORE_FILE)) {
    return { threads: {}, threadsByUser: {} };
  }
  try {
    const raw = fs.readFileSync(SUPPORT_STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SupportStore>;
    return {
      threads: parsed.threads || {},
      threadsByUser: parsed.threadsByUser || {},
    };
  } catch {
    return { threads: {}, threadsByUser: {} };
  }
}

function writeStore(store: SupportStore) {
  ensureDir();
  fs.writeFileSync(SUPPORT_STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
}

export function getActiveThreadForUser(userId: number): SupportThread | null {
  const store = readStore();
  const threadId = store.threadsByUser[String(userId)];
  if (!threadId) return null;
  return store.threads[threadId] ?? null;
}

export function getSupportThreadById(id: string): SupportThread | null {
  const store = readStore();
  return store.threads[id] ?? null;
}

export function createSupportThread(options: {
  userId: number;
  username?: string;
  adminChatId: number;
  adminTopicId: number;
  firstUserMessageId: number;
}): SupportThread {
  const now = new Date().toISOString();
  const id = `${options.userId}:${Date.now()}`;
  const thread: SupportThread = {
    id,
    userId: options.userId,
    username: options.username,
    adminChatId: options.adminChatId,
    adminTopicId: options.adminTopicId,
    lastUserMessageId: options.firstUserMessageId,
    status: "waiting",
    createdAt: now,
    updatedAt: now,
  };

  const store = readStore();
  store.threads[id] = thread;
  store.threadsByUser[String(options.userId)] = id;
  writeStore(store);
  return thread;
}

export function updateSupportThread(
  id: string,
  patch: Partial<SupportThread>
): void {
  const store = readStore();
  const existing = store.threads[id];
  if (!existing) return;
  const updated: SupportThread = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  store.threads[id] = updated;
  writeStore(store);
}

export function closeSupportThread(id: string): void {
  const store = readStore();
  const existing = store.threads[id];
  if (!existing) return;
  existing.status = "closed";
  existing.updatedAt = new Date().toISOString();
  store.threads[id] = existing;
  // удаляем активный диалог для пользователя
  if (store.threadsByUser[String(existing.userId)] === id) {
    delete store.threadsByUser[String(existing.userId)];
  }
  writeStore(store);
}

export function findThreadByTopic(
  adminChatId: number,
  adminTopicId: number
): SupportThread | null {
  const store = readStore();
  const all = Object.values(store.threads);
  return (
    all.find(
      (t) => t.adminChatId === adminChatId && t.adminTopicId === adminTopicId
    ) ?? null
  );
}

