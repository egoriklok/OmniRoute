import { getDbInstance } from "./core";
import { type BusinessAgentInterviewSession } from "@/lib/businessAgent/interview";

const TELEGRAM_SESSION_NAMESPACE = "businessAgentTelegramSessions";

function sessionKey(chatId: string) {
  return `telegram:${chatId}`;
}

function parseSession(value: string | undefined): BusinessAgentInterviewSession | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as BusinessAgentInterviewSession;
    if (!parsed || typeof parsed !== "object" || typeof parsed.id !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getBusinessAgentTelegramSession(chatId: string) {
  const db = getDbInstance();
  const row = db
    .prepare("SELECT value FROM key_value WHERE namespace = ? AND key = ?")
    .get(TELEGRAM_SESSION_NAMESPACE, sessionKey(chatId)) as { value?: string } | undefined;
  return parseSession(row?.value);
}

export function saveBusinessAgentTelegramSession(session: BusinessAgentInterviewSession) {
  const db = getDbInstance();
  db.prepare("INSERT OR REPLACE INTO key_value (namespace, key, value) VALUES (?, ?, ?)").run(
    TELEGRAM_SESSION_NAMESPACE,
    sessionKey(session.id),
    JSON.stringify(session)
  );
}

export function deleteBusinessAgentTelegramSession(chatId: string) {
  const db = getDbInstance();
  db.prepare("DELETE FROM key_value WHERE namespace = ? AND key = ?").run(
    TELEGRAM_SESSION_NAMESPACE,
    sessionKey(chatId)
  );
}
