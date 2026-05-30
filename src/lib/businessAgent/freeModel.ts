import { createInjectionGuard } from "@/middleware/promptInjectionGuard";
import { handleChat } from "@/sse/handlers/chat";
import { initTranslators } from "@omniroute/open-sse/translator/index.ts";
import { buildBusinessAgentMessages } from "./prompt";
import type { BusinessAgentRequest } from "./schema";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type BusinessAgentChatExecutor = (request: Request) => Promise<Response>;

let initPromise: Promise<void> | null = null;
let chatExecutorForTest: BusinessAgentChatExecutor | null = null;

const injectionGuard = createInjectionGuard();

function getRequestOrigin(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:20128";
  }
}

async function ensureChatInitialized() {
  if (!initPromise) {
    initPromise = Promise.resolve(initTranslators()).then(() => undefined);
  }
  return initPromise;
}

function buildChatRequestHeaders(sourceRequest: Request) {
  const headers = new Headers({
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-OmniRoute-Internal-Caller": "business-agent",
  });

  const authorization = sourceRequest.headers.get("authorization");
  if (authorization) {
    headers.set("Authorization", authorization);
  }

  const connection = sourceRequest.headers.get("x-omniroute-connection");
  if (connection) {
    headers.set("X-OmniRoute-Connection", connection);
  }

  return headers;
}

async function executeBusinessAgentChat(request: Request) {
  if (chatExecutorForTest) {
    return chatExecutorForTest(request);
  }

  await ensureChatInitialized();
  return handleChat(request);
}

export function setBusinessAgentChatExecutorForTest(executor: BusinessAgentChatExecutor | null) {
  chatExecutorForTest = executor;
}

export async function callBusinessAgentFreeModel(
  request: Request,
  input: BusinessAgentRequest
): Promise<string> {
  const body = {
    model: input.model,
    stream: false,
    temperature: 0.25,
    messages: buildBusinessAgentMessages(input),
  };

  const guard = injectionGuard(body);
  if (guard.blocked) {
    const detections = Array.isArray(guard.result?.detections) ? guard.result.detections.length : 0;
    throw new Error(`Request blocked: potential prompt injection detected (${detections})`);
  }

  const origin = getRequestOrigin(request);
  const response = await executeBusinessAgentChat(
    new Request(`${origin}/api/v1/chat/completions`, {
      method: "POST",
      headers: buildChatRequestHeaders(request),
      body: JSON.stringify(body),
    })
  );

  const data = (await response.json().catch(() => null)) as ChatCompletionResponse | null;
  if (!response.ok) {
    throw new Error(data?.error?.message || `Free model call failed with ${response.status}`);
  }

  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Free model returned an empty response");
  }

  return content;
}
