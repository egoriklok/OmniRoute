import {
  deleteBusinessAgentTelegramSession,
  getBusinessAgentTelegramSession,
  saveBusinessAgentTelegramSession,
} from "@/lib/db/businessAgentTelegramSessions";
import { type BusinessAgentInterviewSession } from "./interview";

const MAX_PROCESSED_UPDATE_IDS = 50;

export {
  deleteBusinessAgentTelegramSession,
  getBusinessAgentTelegramSession,
  saveBusinessAgentTelegramSession,
};

export function isBusinessAgentTelegramUpdateProcessed(
  session: BusinessAgentInterviewSession | null,
  updateId: number | null
) {
  if (!session || updateId === null) return false;
  return session.processedTelegramUpdateIds?.includes(updateId) ?? false;
}

export function markBusinessAgentTelegramUpdateProcessed(
  session: BusinessAgentInterviewSession,
  updateId: number | null
): BusinessAgentInterviewSession {
  if (updateId === null) return session;
  const updateIds = session.processedTelegramUpdateIds ?? [];
  if (updateIds.includes(updateId)) return session;
  return {
    ...session,
    processedTelegramUpdateIds: [...updateIds, updateId].slice(-MAX_PROCESSED_UPDATE_IDS),
  };
}
