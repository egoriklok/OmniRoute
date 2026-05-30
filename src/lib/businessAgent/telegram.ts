import { type BusinessAgentInterviewInput } from "./interview";
import { type BusinessAgentResponse } from "./schema";

export type TelegramBusinessAgentUpdate = {
  update_id?: number;
  message?: {
    date?: number;
    text?: string;
    voice?: {
      file_id: string;
      duration?: number;
      mime_type?: string;
    };
    chat: {
      id: number | string;
    };
  };
};

export type TelegramBusinessAgentInput = {
  chatId: string;
  input: BusinessAgentInterviewInput;
  needsVoiceTranscription: boolean;
  voiceFileId?: string;
};

const supportedCommands = new Set(["/start", "/brief", "/generate", "/reset", "/help"]);

function clean(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function telegramDateToIso(date: number | undefined) {
  return date ? new Date(date * 1000).toISOString() : undefined;
}

function parseCommand(text: string): BusinessAgentInterviewInput["command"] {
  const first = text.split(/\s+/)[0]?.split("@")[0]?.toLowerCase();
  return supportedCommands.has(first)
    ? (first as BusinessAgentInterviewInput["command"])
    : undefined;
}

export function extractTelegramBusinessAgentInput(
  update: TelegramBusinessAgentUpdate,
  options: { voiceTranscript?: string } = {}
): TelegramBusinessAgentInput | null {
  const message = update.message;
  if (!message?.chat) return null;

  const receivedAt = telegramDateToIso(message.date);
  const chatId = String(message.chat.id);
  const text = clean(message.text);
  const command = text ? parseCommand(text) : undefined;

  if (message.voice) {
    const voiceTranscript = clean(options.voiceTranscript);
    return {
      chatId,
      input: {
        command,
        voiceTranscript: voiceTranscript || undefined,
        receivedAt,
      },
      needsVoiceTranscription: !voiceTranscript,
      voiceFileId: message.voice.file_id,
    };
  }

  if (!text && !command) return null;

  return {
    chatId,
    input: {
      command,
      text: command ? undefined : text,
      receivedAt,
    },
    needsVoiceTranscription: false,
  };
}

export function buildTelegramBusinessAgentDocument(response: BusinessAgentResponse) {
  return {
    filename: response.filledFile.filename,
    mimeType: response.filledFile.mimeType,
    content: response.filledFile.content,
    caption:
      response.mode === "ai"
        ? "Business Agent strategy file"
        : "Business Agent strategy file, generated with local fallback",
  };
}
