import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  buildBusinessAgentFilledFile,
  buildBusinessAgentMessages,
  buildLocalBusinessConsultation,
  businessAgentRequestSchema,
  isFreeBusinessAgentModel,
  type BusinessAgentRequest,
  type BusinessAgentResponse,
} from "@/lib/businessAgent";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";

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

function asErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unknown provider error";
}

function getRequestOrigin(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return "http://localhost:20128";
  }
}

async function callFreeModel(request: Request, input: BusinessAgentRequest) {
  const origin = getRequestOrigin(request);
  const response = await fetch(`${origin}/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(request.headers.get("cookie") ? { Cookie: request.headers.get("cookie") || "" } : {}),
      ...(request.headers.get("authorization")
        ? { Authorization: request.headers.get("authorization") || "" }
        : {}),
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      temperature: 0.25,
      messages: buildBusinessAgentMessages(input),
    }),
  });

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

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const validation = validateBody(businessAgentRequestSchema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
  }

  const input = validation.data;
  if (!isFreeBusinessAgentModel(input.model)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: "Business Agent only accepts free model routes.",
          allowedExamples: ["kr/claude-sonnet-4.5", "kr/claude-haiku-4.5", "combo/free-stack"],
        },
      },
      { status: 400 }
    );
  }

  const warnings: string[] = [];
  try {
    const reportMarkdown = await callFreeModel(request, input);
    const response: BusinessAgentResponse = {
      success: true,
      mode: "ai",
      model: input.model,
      freeOnly: true,
      reportMarkdown,
      filledFile: buildBusinessAgentFilledFile(input, reportMarkdown),
      warnings,
    };
    return NextResponse.json(response);
  } catch (error) {
    warnings.push(
      `Free model was unavailable, so OmniRoute generated a local fallback report: ${asErrorMessage(
        error
      )}`
    );
    const reportMarkdown = buildLocalBusinessConsultation(input);
    const response: BusinessAgentResponse = {
      success: true,
      mode: "local-fallback",
      model: input.model,
      freeOnly: true,
      reportMarkdown,
      filledFile: buildBusinessAgentFilledFile(input, reportMarkdown),
      warnings,
    };
    return NextResponse.json(response);
  }
}
