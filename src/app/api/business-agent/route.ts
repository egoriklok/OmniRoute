import { NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import {
  buildBusinessAgentFilledFile,
  buildLocalBusinessConsultation,
  businessAgentRequestSchema,
  isFreeBusinessAgentModel,
  type BusinessAgentResponse,
} from "@/lib/businessAgent";
import { callBusinessAgentFreeModel } from "@/lib/businessAgent/freeModel";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";

function asErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Unknown provider error";
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
          allowedExamples: ["kr/claude-sonnet-4.5", "if/kimi-k2", "lc/LongCat-Flash-Lite"],
        },
      },
      { status: 400 }
    );
  }

  const warnings: string[] = [];
  try {
    const reportMarkdown = await callBusinessAgentFreeModel(request, input);
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
