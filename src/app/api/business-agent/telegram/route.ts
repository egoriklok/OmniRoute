import { NextResponse } from "next/server";
import {
  applyBusinessAgentInterviewTurn,
  buildLocalBusinessConsultation,
  buildBusinessAgentFilledFile,
  buildTelegramBusinessAgentDocument,
  createBusinessAgentInterviewSession,
  extractTelegramBusinessAgentInput,
  type BusinessAgentResponse,
  type TelegramBusinessAgentUpdate,
} from "@/lib/businessAgent";
import {
  getBusinessAgentTelegramSession,
  isBusinessAgentTelegramUpdateProcessed,
  markBusinessAgentTelegramUpdateProcessed,
  saveBusinessAgentTelegramSession,
} from "@/lib/businessAgent/sessionStore";
import { transcribeTelegramBusinessVoice } from "@/lib/businessAgent/voiceTranscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramSendResponse = {
  ok?: boolean;
  description?: string;
};

function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
}

function getWebhookSecret() {
  return process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET?.trim() || "";
}

function normalizeTelegramUpdateId(updateId: unknown) {
  return typeof updateId === "number" && Number.isSafeInteger(updateId) ? updateId : null;
}

function validateTelegramSecret(
  request: Request
): { ok: true } | { ok: false; status: number; error: string } {
  const expected = getWebhookSecret();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET is not configured",
    };
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return { ok: false, status: 401, error: "Invalid Telegram webhook secret" };
  }
  return { ok: true };
}

async function callTelegram(method: string, body: BodyInit) {
  const token = getBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body,
  });
  const data = (await response.json().catch(() => null)) as TelegramSendResponse | null;
  if (!response.ok || !data?.ok) {
    throw new Error(data?.description || `Telegram ${method} failed with ${response.status}`);
  }
}

async function sendTelegramMessage(chatId: string, text: string) {
  const formData = new FormData();
  formData.set("chat_id", chatId);
  formData.set("text", text.slice(0, 3900));
  await callTelegram("sendMessage", formData);
}

async function sendTelegramDocument(chatId: string, response: BusinessAgentResponse) {
  const document = buildTelegramBusinessAgentDocument(response);
  const formData = new FormData();
  formData.set("chat_id", chatId);
  formData.set("caption", document.caption);
  formData.set(
    "document",
    new Blob([document.content], { type: document.mimeType }),
    document.filename
  );
  await callTelegram("sendDocument", formData);
}

function buildLocalTelegramBusinessResponse(
  request: ReturnType<typeof applyBusinessAgentInterviewTurn>["request"]
): BusinessAgentResponse {
  if (!request) throw new Error("Business Agent request is missing");
  const reportMarkdown = buildLocalBusinessConsultation(request);
  return {
    success: true,
    mode: "local-fallback",
    model: request.model,
    freeOnly: true,
    reportMarkdown,
    filledFile: buildBusinessAgentFilledFile(request, reportMarkdown),
    warnings: ["Generated locally from the Telegram interview without paid providers."],
  };
}

export async function POST(request: Request) {
  const secretValidation = validateTelegramSecret(request);
  if (!secretValidation.ok) {
    return NextResponse.json(
      { success: false, error: secretValidation.error },
      { status: secretValidation.status }
    );
  }

  if (!getBotToken()) {
    return NextResponse.json(
      { success: false, error: "TELEGRAM_BOT_TOKEN is not configured" },
      { status: 503 }
    );
  }

  let update: TelegramBusinessAgentUpdate;
  try {
    update = (await request.json()) as TelegramBusinessAgentUpdate;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let extracted = extractTelegramBusinessAgentInput(update);
  if (!extracted) return NextResponse.json({ success: true, ignored: true });

  const updateId = normalizeTelegramUpdateId(update.update_id);
  const existing = getBusinessAgentTelegramSession(extracted.chatId);
  if (isBusinessAgentTelegramUpdateProcessed(existing, updateId)) {
    return NextResponse.json({
      success: true,
      chatId: extracted.chatId,
      duplicate: true,
      status: existing?.status,
      shouldGenerate: false,
    });
  }

  if (extracted.needsVoiceTranscription && extracted.voiceFileId) {
    try {
      const voiceTranscript = await transcribeTelegramBusinessVoice({
        botToken: getBotToken(),
        fileId: extracted.voiceFileId,
      });
      extracted = extractTelegramBusinessAgentInput(update, { voiceTranscript });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Voice transcription failed. Send the answer as text or configure local STT.";
      await sendTelegramMessage(extracted.chatId, message);
      return NextResponse.json({ success: true, voiceTranscriptionNeeded: true });
    }
  }

  if (!extracted) return NextResponse.json({ success: true, ignored: true });

  const session =
    existing ||
    createBusinessAgentInterviewSession({
      id: extracted.chatId,
      channel: extracted.input.voiceTranscript ? "telegram-voice" : "telegram-text",
    });

  const turn = applyBusinessAgentInterviewTurn(session, extracted.input);
  await sendTelegramMessage(extracted.chatId, turn.reply);
  const processedSession = markBusinessAgentTelegramUpdateProcessed(turn.session, updateId);

  if (turn.shouldGenerate) {
    const response = buildLocalTelegramBusinessResponse(turn.request);
    await sendTelegramDocument(extracted.chatId, response);
    saveBusinessAgentTelegramSession({ ...processedSession, status: "complete" });
  } else {
    saveBusinessAgentTelegramSession(processedSession);
  }

  return NextResponse.json({
    success: true,
    chatId: extracted.chatId,
    status: turn.session.status,
    shouldGenerate: turn.shouldGenerate,
  });
}
