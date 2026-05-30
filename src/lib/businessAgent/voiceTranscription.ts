import { handleAudioTranscription } from "@omniroute/open-sse/handlers/audioTranscription.ts";

type TelegramGetFileResponse = {
  ok?: boolean;
  result?: {
    file_path?: string;
  };
  description?: string;
};

type SttJsonResponse = {
  text?: unknown;
  transcript?: unknown;
};

function configuredLocalSttEndpoint() {
  const endpoint = process.env.BUSINESS_AGENT_STT_ENDPOINT?.trim();
  return endpoint || null;
}

function configuredInternalSttModel() {
  return process.env.BUSINESS_AGENT_STT_MODEL?.trim() || "qwen/qwen3-asr";
}

function assertLocalSttEndpoint(endpoint: string) {
  if (process.env.BUSINESS_AGENT_ALLOW_REMOTE_STT === "1") return;
  const parsed = new URL(endpoint);
  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(host)) {
    throw new Error(
      "BUSINESS_AGENT_STT_ENDPOINT must point to localhost unless BUSINESS_AGENT_ALLOW_REMOTE_STT=1"
    );
  }
}

async function getTelegramFilePath(botToken: string, fileId: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  );
  const data = (await response.json().catch(() => null)) as TelegramGetFileResponse | null;
  if (!response.ok || !data?.ok || !data.result?.file_path) {
    throw new Error(data?.description || `Telegram getFile failed with ${response.status}`);
  }
  return data.result.file_path;
}

async function downloadTelegramFile(botToken: string, filePath: string) {
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!response.ok) throw new Error(`Telegram file download failed with ${response.status}`);
  return {
    bytes: await response.arrayBuffer(),
    filename: filePath.split("/").pop() || "telegram-voice.ogg",
  };
}

async function transcribeWithLocalEndpoint(audio: { bytes: ArrayBuffer; filename: string }) {
  const endpoint = configuredLocalSttEndpoint();
  if (!endpoint) {
    return null;
  }

  assertLocalSttEndpoint(endpoint);

  const formData = new FormData();
  formData.set("file", new Blob([audio.bytes], { type: "audio/ogg" }), audio.filename);
  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
  });
  const data = (await response.json().catch(() => null)) as SttJsonResponse | null;
  if (!response.ok) throw new Error(`Local STT failed with ${response.status}`);

  const transcript =
    typeof data?.text === "string"
      ? data.text.trim()
      : typeof data?.transcript === "string"
        ? data.transcript.trim()
        : "";
  if (!transcript) throw new Error("Local STT returned an empty transcript");
  return transcript;
}

async function transcribeWithInternalAudioHandler(audio: { bytes: ArrayBuffer; filename: string }) {
  const formData = new FormData();
  formData.set("model", configuredInternalSttModel());
  formData.set("file", new Blob([audio.bytes], { type: "audio/ogg" }), audio.filename);

  const response = await handleAudioTranscription({
    formData,
    credentials: null,
  });
  const data = (await response.json().catch(() => null)) as SttJsonResponse | null;
  if (!response.ok) {
    const message =
      data && typeof (data as { error?: { message?: unknown } }).error?.message === "string"
        ? String((data as { error: { message: string } }).error.message)
        : `Internal STT failed with ${response.status}`;
    throw new Error(message);
  }

  const transcript =
    typeof data?.text === "string"
      ? data.text.trim()
      : typeof data?.transcript === "string"
        ? data.transcript.trim()
        : "";
  if (!transcript) throw new Error("Internal STT returned an empty transcript");
  return transcript;
}

export async function transcribeTelegramBusinessVoice(input: { botToken: string; fileId: string }) {
  const filePath = await getTelegramFilePath(input.botToken, input.fileId);
  const audio = await downloadTelegramFile(input.botToken, filePath);
  const localEndpointTranscript = await transcribeWithLocalEndpoint(audio);
  if (localEndpointTranscript) return localEndpointTranscript;
  return transcribeWithInternalAudioHandler(audio);
}
