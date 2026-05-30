import {
  businessAgentQuestions,
  freeBusinessAgentModels,
  type BusinessAgentQuestion,
  type BusinessAgentQuestionId,
  type BusinessAgentRequest,
} from "./schema";
import {
  buildDeterministicBusinessAgentMemory,
  formatBusinessAgentProjectMemory,
  type BusinessAgentProjectMemory,
} from "./adaptiveInterview";

export type BusinessAgentInterviewChannel = "dashboard" | "telegram-text" | "telegram-voice";
export type BusinessAgentInterviewStatus = "interviewing" | "reviewing" | "generating" | "complete";
export type BusinessAgentInterviewSource = "bot" | "user-text" | "user-voice";

export type BusinessAgentTranscriptEntry = {
  source: BusinessAgentInterviewSource;
  text: string;
  questionId?: BusinessAgentQuestionId;
  receivedAt: string;
};

export type BusinessAgentInterviewSession = {
  id: string;
  channel: BusinessAgentInterviewChannel;
  language: "ru" | "en";
  model: string;
  answers: Partial<Record<BusinessAgentQuestionId, string>>;
  transcript: BusinessAgentTranscriptEntry[];
  status: BusinessAgentInterviewStatus;
  createdAt: string;
  updatedAt: string;
  lastQuestionId?: BusinessAgentQuestionId;
  processedTelegramUpdateIds?: number[];
  memory?: BusinessAgentProjectMemory;
};

export type BusinessAgentInterviewInput = {
  text?: string;
  voiceTranscript?: string;
  command?: "/start" | "/brief" | "/generate" | "/reset" | "/help";
  receivedAt?: string;
};

export type BusinessAgentInterviewTurn = {
  session: BusinessAgentInterviewSession;
  reply: string;
  nextQuestion?: BusinessAgentQuestion;
  shouldGenerate: boolean;
  request?: BusinessAgentRequest;
};

const projectVaultQuestionIds: BusinessAgentQuestionId[] = [
  "projectName",
  "sector",
  "geography",
  "format",
  "projectType",
  "companySize",
  "product",
  "priceSegment",
];

const marketQuestionIds: BusinessAgentQuestionId[] = ["marketSize", "price", "businessModel"];

const strategyQuestionIds: BusinessAgentQuestionId[] = [
  "mission",
  "cjmContext",
  "roadmapContext",
  "contentChannels",
  "goToMarket",
  "goal90Days",
];

const evidenceQuestionIds: BusinessAgentQuestionId[] = [
  "currentAlternatives",
  "differentiation",
  "traction",
  "competition",
  "constraints",
  "founderContext",
];

function nowIso(now = new Date()) {
  return now.toISOString();
}

function cleanText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() || "";
}

function questionById(id: BusinessAgentQuestionId) {
  return businessAgentQuestions.find((question) => question.id === id);
}

function missingByPriority(session: BusinessAgentInterviewSession) {
  const requiredQuestionIds = businessAgentQuestions
    .filter((question) => question.required)
    .map((question) => question.id);
  const ordered = [
    ...requiredQuestionIds,
    ...projectVaultQuestionIds,
    ...marketQuestionIds,
    ...strategyQuestionIds,
    ...evidenceQuestionIds,
  ];
  const unique = Array.from(new Set(ordered));

  return unique.filter((id) => !cleanText(session.answers[id]));
}

function replyLine(session: BusinessAgentInterviewSession, ru: string, en: string) {
  return session.language === "ru" ? ru : en;
}

function appendTranscript(
  session: BusinessAgentInterviewSession,
  entry: Omit<BusinessAgentTranscriptEntry, "receivedAt"> & { receivedAt?: string }
) {
  return {
    ...session,
    transcript: [
      ...session.transcript,
      {
        ...entry,
        text: cleanText(entry.text),
        receivedAt: entry.receivedAt || nowIso(),
      },
    ],
    updatedAt: entry.receivedAt || nowIso(),
  };
}

export function createBusinessAgentInterviewSession(input: {
  id: string;
  channel?: BusinessAgentInterviewChannel;
  language?: "ru" | "en";
  model?: string;
  now?: Date;
}): BusinessAgentInterviewSession {
  const createdAt = nowIso(input.now);
  return {
    id: input.id,
    channel: input.channel || "telegram-voice",
    language: input.language || "ru",
    model: input.model || freeBusinessAgentModels[0],
    answers: {},
    transcript: [],
    memory: {},
    status: "interviewing",
    createdAt,
    updatedAt: createdAt,
  };
}

export function getBusinessAgentInterviewProgress(session: BusinessAgentInterviewSession) {
  const answered = businessAgentQuestions.filter((question) =>
    cleanText(session.answers[question.id])
  );
  const required = businessAgentQuestions.filter((question) => question.required);
  const requiredMissing = required.filter((question) => !cleanText(session.answers[question.id]));
  const missing = missingByPriority(session);

  return {
    answered: answered.length,
    total: businessAgentQuestions.length,
    requiredAnswered: required.length - requiredMissing.length,
    requiredTotal: required.length,
    requiredMissing: requiredMissing.map((question) => question.id),
    nextMissing: missing,
    readyToGenerate: requiredMissing.length === 0,
  };
}

export function getNextBusinessAgentInterviewQuestion(session: BusinessAgentInterviewSession) {
  const nextId = missingByPriority(session)[0];
  return nextId ? questionById(nextId) : undefined;
}

export function buildBusinessAgentRequestFromSession(
  session: BusinessAgentInterviewSession
): BusinessAgentRequest {
  return {
    answers: session.answers,
    language: session.language,
    model: session.model,
    projectMemory: formatBusinessAgentProjectMemory(
      session.memory || buildDeterministicBusinessAgentMemory(session)
    ),
  };
}

export function recordBusinessAgentInterviewAnswer(
  session: BusinessAgentInterviewSession,
  questionId: BusinessAgentQuestionId,
  text: string,
  source: Exclude<BusinessAgentInterviewSource, "bot"> = "user-text",
  receivedAt?: string
): BusinessAgentInterviewSession {
  const value = cleanText(text);
  const withAnswer = {
    ...session,
    answers: {
      ...session.answers,
      [questionId]: value,
    },
    lastQuestionId: undefined,
  };
  return {
    ...appendTranscript(withAnswer, { source, questionId, text: value, receivedAt }),
    memory: buildDeterministicBusinessAgentMemory(withAnswer),
  };
}

export function buildBusinessAgentInterviewBrief(session: BusinessAgentInterviewSession) {
  const progress = getBusinessAgentInterviewProgress(session);
  const missingLabels = progress.nextMissing
    .slice(0, 8)
    .map((id) => questionById(id)?.label || id)
    .join(", ");

  if (session.language === "ru") {
    return [
      `Заполнено ${progress.answered}/${progress.total}. Обязательные поля: ${progress.requiredAnswered}/${progress.requiredTotal}.`,
      progress.readyToGenerate
        ? "Можно генерировать файл командой /generate."
        : `Сначала нужно закрыть: ${missingLabels}.`,
    ].join("\n");
  }

  return [
    `Completed ${progress.answered}/${progress.total}. Required fields: ${progress.requiredAnswered}/${progress.requiredTotal}.`,
    progress.readyToGenerate
      ? "You can generate the file with /generate."
      : `Close these first: ${missingLabels}.`,
  ].join("\n");
}

function formatQuestion(session: BusinessAgentInterviewSession, question: BusinessAgentQuestion) {
  const requiredMark = question.required ? " *" : "";
  if (session.language === "ru") {
    return [
      `${question.label}${requiredMark}`,
      question.prompt,
      `Можно ответить голосом или текстом. Пример: ${question.placeholder}`,
    ].join("\n");
  }
  return [
    `${question.label}${requiredMark}`,
    question.prompt,
    `You can answer by voice or text. Example: ${question.placeholder}`,
  ].join("\n");
}

export function applyBusinessAgentInterviewTurn(
  session: BusinessAgentInterviewSession,
  input: BusinessAgentInterviewInput
): BusinessAgentInterviewTurn {
  const receivedAt = input.receivedAt || nowIso();
  const text = cleanText(input.voiceTranscript || input.text);
  const source: Exclude<BusinessAgentInterviewSource, "bot"> = input.voiceTranscript
    ? "user-voice"
    : "user-text";

  if (input.command === "/reset") {
    const reset = createBusinessAgentInterviewSession({
      id: session.id,
      channel: session.channel,
      language: session.language,
      model: session.model,
      now: new Date(receivedAt),
    });
    const question = getNextBusinessAgentInterviewQuestion(reset);
    return {
      session: { ...reset, lastQuestionId: question?.id },
      reply: question ? formatQuestion(reset, question) : buildBusinessAgentInterviewBrief(reset),
      nextQuestion: question,
      shouldGenerate: false,
    };
  }

  if (input.command === "/help") {
    return {
      session,
      reply: replyLine(
        session,
        "Я проведу интервью по бизнес-идее голосом или текстом. /brief покажет прогресс, /generate создаст файл, /reset начнет заново.",
        "I will interview you about the business idea by voice or text. /brief shows progress, /generate creates the file, /reset starts over."
      ),
      shouldGenerate: false,
    };
  }

  if (input.command === "/brief") {
    return {
      session,
      reply: buildBusinessAgentInterviewBrief(session),
      shouldGenerate: false,
    };
  }

  if (input.command === "/generate") {
    const progress = getBusinessAgentInterviewProgress(session);
    if (!progress.readyToGenerate) {
      const question = getNextBusinessAgentInterviewQuestion(session);
      const nextSession = {
        ...session,
        lastQuestionId: question?.id,
        status: "interviewing" as const,
      };
      return {
        session: nextSession,
        reply: question
          ? formatQuestion(session, question)
          : buildBusinessAgentInterviewBrief(session),
        nextQuestion: question,
        shouldGenerate: false,
      };
    }

    const nextSession = { ...session, status: "generating" as const, updatedAt: receivedAt };
    return {
      session: nextSession,
      reply: replyLine(
        session,
        "Генерирую заполненный strategy file: Project Vault brief, mission, CJM, roadmap, ЦА, content plan и 90-day plan.",
        "Generating the filled strategy file: Project Vault brief, mission, CJM, roadmap, target audience, content plan, and 90-day plan."
      ),
      shouldGenerate: true,
      request: buildBusinessAgentRequestFromSession(nextSession),
    };
  }

  let nextSession = session;
  if (text && session.lastQuestionId) {
    nextSession = recordBusinessAgentInterviewAnswer(
      session,
      session.lastQuestionId,
      text,
      source,
      receivedAt
    );
  } else if (text) {
    nextSession = appendTranscript(session, { source, text, receivedAt });
  }

  const question = getNextBusinessAgentInterviewQuestion(nextSession);
  if (question) {
    const withQuestion = appendTranscript(
      { ...nextSession, lastQuestionId: question.id, status: "interviewing" },
      {
        source: "bot",
        questionId: question.id,
        text: formatQuestion(nextSession, question),
        receivedAt,
      }
    );
    return {
      session: withQuestion,
      reply: formatQuestion(nextSession, question),
      nextQuestion: question,
      shouldGenerate: false,
    };
  }

  const reviewingSession = { ...nextSession, status: "reviewing" as const, updatedAt: receivedAt };
  return {
    session: reviewingSession,
    reply: replyLine(
      reviewingSession,
      `${buildBusinessAgentInterviewBrief(reviewingSession)}\nЕсли всё верно, отправьте /generate.`,
      `${buildBusinessAgentInterviewBrief(reviewingSession)}\nIf this is correct, send /generate.`
    ),
    shouldGenerate: false,
  };
}
