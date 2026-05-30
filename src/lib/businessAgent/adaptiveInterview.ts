import {
  businessAgentQuestions,
  type BusinessAgentQuestion,
  type BusinessAgentQuestionId,
} from "./schema";
import type { BusinessAgentInterviewSession } from "./interview";

export type BusinessAgentProjectMemory = {
  project?: string;
  customer?: string;
  problem?: string;
  solution?: string;
  positioning?: string;
  evidence?: string;
  risks?: string[];
  assumptions?: string[];
  nextFocus?: string;
  updatedAt?: string;
};

export type BusinessAgentAdaptiveQuestionResult = {
  memory: BusinessAgentProjectMemory;
  question: string;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, 5);
}

function questionLabel(id: BusinessAgentQuestionId) {
  return businessAgentQuestions.find((question) => question.id === id)?.label || id;
}

export function formatBusinessAgentProjectMemory(memory?: BusinessAgentProjectMemory) {
  if (!memory) return "";
  const lines = [
    memory.project ? `Project: ${memory.project}` : "",
    memory.customer ? `Customer: ${memory.customer}` : "",
    memory.problem ? `Problem: ${memory.problem}` : "",
    memory.solution ? `Solution: ${memory.solution}` : "",
    memory.positioning ? `Positioning: ${memory.positioning}` : "",
    memory.evidence ? `Evidence: ${memory.evidence}` : "",
    memory.risks?.length ? `Risks: ${memory.risks.join("; ")}` : "",
    memory.assumptions?.length ? `Assumptions: ${memory.assumptions.join("; ")}` : "",
    memory.nextFocus ? `Next focus: ${memory.nextFocus}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildDeterministicBusinessAgentMemory(
  session: BusinessAgentInterviewSession
): BusinessAgentProjectMemory {
  const answers = session.answers;
  return {
    ...session.memory,
    project: cleanText(answers.projectName) || cleanText(answers.idea) || session.memory?.project,
    customer: cleanText(answers.targetCustomer) || session.memory?.customer,
    problem: cleanText(answers.problem) || session.memory?.problem,
    solution: cleanText(answers.solution) || cleanText(answers.product) || session.memory?.solution,
    positioning: cleanText(answers.differentiation) || session.memory?.positioning,
    evidence: cleanText(answers.traction) || session.memory?.evidence,
    risks: [
      cleanText(answers.constraints),
      cleanText(answers.competition),
      ...(session.memory?.risks || []),
    ]
      .filter(Boolean)
      .slice(0, 5),
    assumptions: [
      cleanText(answers.marketSize),
      cleanText(answers.price),
      cleanText(answers.businessModel),
      ...(session.memory?.assumptions || []),
    ]
      .filter(Boolean)
      .slice(0, 5),
    updatedAt: new Date().toISOString(),
  };
}

export function buildBusinessAgentAdaptiveQuestionMessages(
  session: BusinessAgentInterviewSession,
  nextQuestion: BusinessAgentQuestion
) {
  const outputLanguage = session.language === "ru" ? "Russian" : "English";
  const answerLines = businessAgentQuestions
    .map((question) => {
      const value = session.answers[question.id]?.trim();
      return value ? `- ${question.label}: ${value}` : "";
    })
    .filter(Boolean);
  const transcriptTail = session.transcript
    .slice(-8)
    .map(
      (entry) =>
        `${entry.source}${entry.questionId ? `/${questionLabel(entry.questionId)}` : ""}: ${entry.text}`
    )
    .join("\n");

  return [
    {
      role: "system",
      content: [
        `You are AI Agent Business running a Telegram founder interview. Respond in ${outputLanguage}.`,
        "Use temporary memory only for this chat session. Do not use permanent memory and do not invent facts.",
        "Apply GStack skill: CEO, product reviewer, growth lead, skeptic, and integrator pressure-test each answer.",
        "Apply Startup skill: narrow ICP, painful problem, wedge, offer, distribution, proof, 90-day learning loop, and first paid validation.",
        "Your job is to make the founder understand the idea more deeply with each answer.",
        "Ask exactly one next question. It must target the requested field, but be phrased from the previous answers and temporary memory.",
        "Return JSON only, no markdown, no code fence.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "Current temporary project memory:",
        formatBusinessAgentProjectMemory(session.memory) || "empty",
        "",
        "Known answers:",
        answerLines.length ? answerLines.join("\n") : "none",
        "",
        "Recent transcript:",
        transcriptTail || "none",
        "",
        "Next required field:",
        `- id: ${nextQuestion.id}`,
        `- label: ${nextQuestion.label}`,
        `- base prompt: ${nextQuestion.prompt}`,
        `- example: ${nextQuestion.placeholder}`,
        "",
        "JSON schema:",
        '{"memory":{"project":"short","customer":"short","problem":"short","solution":"short","positioning":"short","evidence":"short","risks":["short"],"assumptions":["short"],"nextFocus":"short"},"question":"one concise question"}',
      ].join("\n"),
    },
  ];
}

export function parseBusinessAgentAdaptiveQuestion(
  raw: string,
  fallbackMemory: BusinessAgentProjectMemory,
  fallbackQuestion: string
): BusinessAgentAdaptiveQuestionResult {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { memory: fallbackMemory, question: fallbackQuestion };
  }

  const record = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const rawMemory =
    record.memory && typeof record.memory === "object"
      ? (record.memory as Record<string, unknown>)
      : {};
  const memory: BusinessAgentProjectMemory = {
    ...fallbackMemory,
    project: cleanText(rawMemory.project) || fallbackMemory.project,
    customer: cleanText(rawMemory.customer) || fallbackMemory.customer,
    problem: cleanText(rawMemory.problem) || fallbackMemory.problem,
    solution: cleanText(rawMemory.solution) || fallbackMemory.solution,
    positioning: cleanText(rawMemory.positioning) || fallbackMemory.positioning,
    evidence: cleanText(rawMemory.evidence) || fallbackMemory.evidence,
    risks: cleanList(rawMemory.risks).length ? cleanList(rawMemory.risks) : fallbackMemory.risks,
    assumptions: cleanList(rawMemory.assumptions).length
      ? cleanList(rawMemory.assumptions)
      : fallbackMemory.assumptions,
    nextFocus: cleanText(rawMemory.nextFocus) || fallbackMemory.nextFocus,
    updatedAt: new Date().toISOString(),
  };

  return {
    memory,
    question: cleanText(record.question) || fallbackQuestion,
  };
}
