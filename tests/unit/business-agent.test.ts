import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-business-agent-"));
const originalDataDir = process.env.DATA_DIR;
const originalTelegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
const originalTelegramWebhookSecret = process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET;
const originalSttEndpoint = process.env.BUSINESS_AGENT_STT_ENDPOINT;
const originalSttModel = process.env.BUSINESS_AGENT_STT_MODEL;
const originalRequireApiKey = process.env.REQUIRE_API_KEY;
const originalGroqApiKey = process.env.GROQ_API_KEY;
process.env.DATA_DIR = tmpDir;

const core = await import("../../src/lib/db/core.ts");
const businessAgent = await import("../../src/lib/businessAgent/index.ts");
const businessAgentFreeModel = await import("../../src/lib/businessAgent/freeModel.ts");
const sessionStore = await import("../../src/lib/businessAgent/sessionStore.ts");
const voiceTranscription = await import("../../src/lib/businessAgent/voiceTranscription.ts");
const route = await import("../../src/app/api/business-agent/route.ts");
const telegramRoute = await import("../../src/app/api/business-agent/telegram/route.ts");

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

const sampleAnswers = {
  projectName: "Founder Strategy Bot",
  sector: "AI SaaS",
  idea: "AI consultant for early-stage founders",
  problem: "Founders cannot turn rough ideas into a market-backed plan",
  targetCustomer: "Solo founders before first revenue",
  format: "Telegram voice bot",
  projectType: "B2C subscription",
  solution: "A guided interview that produces a startup strategy",
  product: "Filled business strategy file",
  priceSegment: "Low-cost subscription",
  marketSize: "50000 reachable founders",
  price: "$49/month",
  goToMarket: "Founder-led communities and Telegram channels",
  mission: "Help founders turn vague ideas into validated action plans",
  cjmContext: "Voice interview, report review, first action sprint",
  roadmapContext: "MVP bot, markdown export, first pilots",
  contentChannels: "Telegram, LinkedIn",
};

type BusinessAgentRouteBody = {
  success?: boolean;
  mode?: string;
  reportMarkdown?: string;
  filledFile?: {
    filename?: string;
    content?: string;
    sections?: string[];
  };
  warnings?: string[];
  error?: {
    message?: string;
  };
};

test.after(() => {
  core.resetDbInstance();
  restoreEnv("DATA_DIR", originalDataDir);
  restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
  restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
  restoreEnv("BUSINESS_AGENT_STT_ENDPOINT", originalSttEndpoint);
  restoreEnv("BUSINESS_AGENT_STT_MODEL", originalSttModel);
  restoreEnv("REQUIRE_API_KEY", originalRequireApiKey);
  restoreEnv("GROQ_API_KEY", originalGroqApiKey);
  businessAgentFreeModel.setBusinessAgentChatExecutorForTest(null);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("business agent accepts only free model routes", () => {
  assert.equal(businessAgent.isFreeBusinessAgentModel("kr/claude-sonnet-4.5"), true);
  assert.equal(businessAgent.isFreeBusinessAgentModel("if/kimi-k2"), true);
  assert.equal(businessAgent.isFreeBusinessAgentModel("pol/openai-fast"), true);
  assert.equal(businessAgent.isFreeBusinessAgentModel("lc/LongCat-Flash-Lite"), true);
  assert.equal(businessAgent.isFreeBusinessAgentModel("openrouter/deepseek-r1:free"), true);
  assert.equal(businessAgent.isFreeBusinessAgentModel("combo/free-stack"), false);
  assert.equal(businessAgent.isFreeBusinessAgentModel("combo/free-unreviewed"), false);
  assert.equal(businessAgent.isFreeBusinessAgentModel("if/kimi-k2-thinking"), false);
  assert.equal(businessAgent.isFreeBusinessAgentModel("lc/longcat-flash-lite"), false);
  assert.equal(businessAgent.isFreeBusinessAgentModel("openai/gpt-5"), false);
  assert.equal(businessAgent.isFreeBusinessAgentModel("anthropic/claude-opus"), false);
});

test("local fallback report includes startup advice and market sizing", () => {
  const report = businessAgent.buildLocalBusinessConsultation({
    answers: sampleAnswers,
    language: "en",
    model: "kr/claude-sonnet-4.5",
  });

  assert.match(report, /Free Business Agent Consultation/);
  assert.match(report, /Market Opportunity/);
  assert.match(report, /TAM/);
  assert.match(report, /\$29\.4M/);
  assert.match(report, /Filled Project Vault Brief/);
  assert.match(report, /Mission and Product Description/);
  assert.match(report, /CJM/);
  assert.match(report, /Roadmap/);
  assert.match(report, /Content Plan/);
  assert.match(report, /90-Day Action Plan/);
});

test("business agent prompt applies market-opportunity and GStack-style review", () => {
  const messages = businessAgent.buildBusinessAgentMessages({
    answers: sampleAnswers,
    language: "en",
    model: "kr/claude-sonnet-4.5",
  });

  assert.equal(messages.length, 2);
  assert.match(messages[0].content, /GStack skill/);
  assert.match(messages[0].content, /Startup skill/);
  assert.match(messages[0].content, /TAM, SAM, SOM/);
  assert.match(messages[0].content, /Project Vault brief structure/);
  assert.match(messages[0].content, /CJM/);
  assert.match(messages[1].content, /AI consultant for early-stage founders/);
});

test("business agent adaptive interview builds temporary memory prompts", () => {
  const session = businessAgent.recordBusinessAgentInterviewAnswer(
    businessAgent.createBusinessAgentInterviewSession({
      id: "adaptive-memory",
      channel: "telegram-voice",
      language: "en",
    }),
    "idea",
    "AI consultant that turns rough startup ideas into a strategy file"
  );
  const nextQuestion = businessAgent.businessAgentQuestions.find(
    (question) => question.id === "problem"
  );
  assert.ok(nextQuestion);

  const messages = businessAgent.buildBusinessAgentAdaptiveQuestionMessages(session, nextQuestion);
  assert.match(messages[0].content, /temporary memory/);
  assert.match(messages[0].content, /GStack skill/);
  assert.match(messages[0].content, /Startup skill/);
  assert.match(messages[1].content, /AI consultant/);

  const adaptive = businessAgent.parseBusinessAgentAdaptiveQuestion(
    JSON.stringify({
      memory: {
        project: "Founder strategy bot",
        customer: "Solo founders",
        assumptions: ["Founders will answer by voice"],
      },
      question: "What painful moment makes the founder need this right now?",
    }),
    businessAgent.buildDeterministicBusinessAgentMemory(session),
    "Fallback question"
  );

  assert.equal(adaptive.memory.project, "Founder strategy bot");
  assert.equal(adaptive.question, "What painful moment makes the founder need this right now?");
});

test("business agent builds a downloadable filled strategy file", () => {
  const report = businessAgent.buildLocalBusinessConsultation({
    answers: sampleAnswers,
    language: "en",
    model: "kr/claude-sonnet-4.5",
  });
  const filledFile = businessAgent.buildBusinessAgentFilledFile(
    {
      answers: sampleAnswers,
      language: "en",
      model: "kr/claude-sonnet-4.5",
    },
    report
  );

  assert.match(filledFile.filename, /strategy-file\.md$/);
  assert.match(filledFile.content, /Filled Project Vault brief/);
  assert.match(filledFile.content, /Product description/);
  assert.match(filledFile.content, /Mission/);
  assert.match(filledFile.content, /CJM/);
  assert.match(filledFile.content, /Roadmap/);
  assert.match(filledFile.content, /Content plan/);
  assert.match(filledFile.content, /Market opportunity/);
  assert.match(filledFile.content, /90-day action plan/);
  assert.match(filledFile.content, /TAM/);
  assert.match(filledFile.content, /\$29\.4M/);
  assert.ok(filledFile.sections.includes("Target audience"));
  assert.ok(filledFile.sections.includes("Market opportunity"));
  assert.ok(filledFile.sections.includes("90-day action plan"));
});

test("business agent interview core supports telegram voice turns", () => {
  let session = businessAgent.createBusinessAgentInterviewSession({
    id: "telegram-chat-1",
    channel: "telegram-voice",
    language: "en",
    now: new Date("2026-05-30T10:00:00.000Z"),
  });

  let turn = businessAgent.applyBusinessAgentInterviewTurn(session, { command: "/start" });
  assert.equal(turn.nextQuestion?.id, "idea");
  assert.equal(turn.shouldGenerate, false);

  session = turn.session;
  turn = businessAgent.applyBusinessAgentInterviewTurn(session, {
    voiceTranscript: "AI consultant for founders",
    receivedAt: "2026-05-30T10:01:00.000Z",
  });
  assert.equal(turn.session.answers.idea, "AI consultant for founders");
  assert.equal(turn.session.transcript.at(-2)?.source, "user-voice");
  assert.equal(turn.nextQuestion?.id, "problem");

  session = turn.session;
  turn = businessAgent.applyBusinessAgentInterviewTurn(session, { command: "/brief" });
  assert.match(turn.reply, /Completed 1\/27/);
  assert.match(turn.reply, /Required fields: 1\/4/);
});

test("business agent interview core only generates after required answers", () => {
  let session = businessAgent.createBusinessAgentInterviewSession({
    id: "telegram-chat-2",
    channel: "telegram-text",
    language: "en",
  });

  let turn = businessAgent.applyBusinessAgentInterviewTurn(session, { command: "/generate" });
  assert.equal(turn.shouldGenerate, false);
  assert.equal(turn.nextQuestion?.id, "idea");

  session = {
    ...turn.session,
    answers: {
      idea: sampleAnswers.idea,
      problem: sampleAnswers.problem,
      targetCustomer: sampleAnswers.targetCustomer,
      solution: sampleAnswers.solution,
    },
  };
  turn = businessAgent.applyBusinessAgentInterviewTurn(session, { command: "/generate" });

  assert.equal(turn.shouldGenerate, true);
  assert.equal(turn.session.status, "generating");
  assert.equal(turn.request?.answers.idea, sampleAnswers.idea);
  assert.equal(turn.request?.model, "kr/claude-sonnet-4.5");
});

test("business agent telegram adapter extracts commands and voice transcript turns", () => {
  const textInput = businessAgent.extractTelegramBusinessAgentInput({
    message: {
      chat: { id: 42 },
      date: 1780135200,
      text: "/brief@BusinessAgentBot",
    },
  });

  assert.equal(textInput?.chatId, "42");
  assert.equal(textInput?.input.command, "/brief");
  assert.equal(textInput?.needsVoiceTranscription, false);

  const pendingVoice = businessAgent.extractTelegramBusinessAgentInput({
    message: {
      chat: { id: "founder-chat" },
      date: 1780135260,
      voice: { file_id: "voice-file-1", duration: 12 },
    },
  });

  assert.equal(pendingVoice?.chatId, "founder-chat");
  assert.equal(pendingVoice?.needsVoiceTranscription, true);
  assert.equal(pendingVoice?.voiceFileId, "voice-file-1");

  const transcribedVoice = businessAgent.extractTelegramBusinessAgentInput(
    {
      message: {
        chat: { id: "founder-chat" },
        date: 1780135260,
        voice: { file_id: "voice-file-1", duration: 12 },
      },
    },
    { voiceTranscript: "We help founders create a strategy file" }
  );

  assert.equal(transcribedVoice?.needsVoiceTranscription, false);
  assert.equal(transcribedVoice?.input.voiceTranscript, "We help founders create a strategy file");
});

test("business agent telegram sessions persist in local sqlite", () => {
  const session = businessAgent.createBusinessAgentInterviewSession({
    id: "telegram-chat-store",
    channel: "telegram-text",
    language: "en",
  });
  const next = businessAgent.recordBusinessAgentInterviewAnswer(
    session,
    "idea",
    "AI strategy interviewer"
  );

  sessionStore.saveBusinessAgentTelegramSession(next);
  const loaded = sessionStore.getBusinessAgentTelegramSession("telegram-chat-store");
  assert.equal(loaded?.answers.idea, "AI strategy interviewer");

  sessionStore.deleteBusinessAgentTelegramSession("telegram-chat-store");
  assert.equal(sessionStore.getBusinessAgentTelegramSession("telegram-chat-store"), null);
});

test("business agent telegram webhook starts an interview without paid providers", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET = "secret";

  const fetchCalls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await telegramRoute.POST(
      new Request("http://localhost/api/business-agent/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "secret",
        },
        body: JSON.stringify({
          update_id: 1001,
          message: {
            chat: { id: 777 },
            date: 1780135200,
            text: "/start",
          },
        }),
      })
    );
    const body = (await response.json()) as {
      success?: boolean;
      chatId?: string;
      shouldGenerate?: boolean;
    };

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.chatId, "777");
    assert.equal(body.shouldGenerate, false);
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0], /sendMessage/);
    assert.deepEqual(
      sessionStore.getBusinessAgentTelegramSession("777")?.processedTelegramUpdateIds,
      [1001]
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
    restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
    sessionStore.deleteBusinessAgentTelegramSession("777");
  }
});

test("business agent telegram webhook ignores retried update ids", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET = "secret";

  const fetchCalls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const requestBody = {
    update_id: 1002,
    message: {
      chat: { id: 780 },
      date: 1780135200,
      text: "/start",
    },
  };

  try {
    const first = await telegramRoute.POST(
      new Request("http://localhost/api/business-agent/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "secret",
        },
        body: JSON.stringify(requestBody),
      })
    );
    const duplicate = await telegramRoute.POST(
      new Request("http://localhost/api/business-agent/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "secret",
        },
        body: JSON.stringify(requestBody),
      })
    );
    const duplicateBody = (await duplicate.json()) as {
      success?: boolean;
      duplicate?: boolean;
      shouldGenerate?: boolean;
    };

    assert.equal(first.status, 200);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicateBody.success, true);
    assert.equal(duplicateBody.duplicate, true);
    assert.equal(duplicateBody.shouldGenerate, false);
    assert.equal(fetchCalls.length, 1);
    assert.deepEqual(
      sessionStore.getBusinessAgentTelegramSession("780")?.processedTelegramUpdateIds,
      [1002]
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
    restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
    sessionStore.deleteBusinessAgentTelegramSession("780");
  }
});

test("business agent telegram webhook ignores retried reset updates", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET = "secret";

  const fetchCalls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  businessAgentFreeModel.setBusinessAgentChatExecutorForTest(async () => {
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                memory: { project: "New idea after reset" },
                question: "Which problem does this reset idea solve first?",
              }),
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  });

  const resetBody = {
    update_id: 1003,
    message: {
      chat: { id: 781 },
      date: 1780135200,
      text: "/reset",
    },
  };

  try {
    const reset = await telegramRoute.POST(
      new Request("http://localhost/api/business-agent/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "secret",
        },
        body: JSON.stringify(resetBody),
      })
    );
    const answer = await telegramRoute.POST(
      new Request("http://localhost/api/business-agent/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "secret",
        },
        body: JSON.stringify({
          update_id: 1004,
          message: {
            chat: { id: 781 },
            date: 1780135260,
            text: "New idea after reset",
          },
        }),
      })
    );
    const duplicateReset = await telegramRoute.POST(
      new Request("http://localhost/api/business-agent/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "secret",
        },
        body: JSON.stringify(resetBody),
      })
    );
    const duplicateBody = (await duplicateReset.json()) as {
      success?: boolean;
      duplicate?: boolean;
    };
    const session = sessionStore.getBusinessAgentTelegramSession("781");

    assert.equal(reset.status, 200);
    assert.equal(answer.status, 200);
    assert.equal(duplicateReset.status, 200);
    assert.equal(duplicateBody.success, true);
    assert.equal(duplicateBody.duplicate, true);
    assert.equal(fetchCalls.length, 2);
    assert.equal(session?.answers.idea, "New idea after reset");
    assert.deepEqual(session?.processedTelegramUpdateIds, [1003, 1004]);
  } finally {
    globalThis.fetch = originalFetch;
    businessAgentFreeModel.setBusinessAgentChatExecutorForTest(null);
    restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
    restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
    sessionStore.deleteBusinessAgentTelegramSession("781");
  }
});

test("business agent telegram webhook stores temporary memory from adaptive LLM questions", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET = "secret";

  const seededSession = {
    ...businessAgent.createBusinessAgentInterviewSession({
      id: "783",
      channel: "telegram-text",
      language: "en",
    }),
    lastQuestionId: "idea" as const,
  };
  sessionStore.saveBusinessAgentTelegramSession(seededSession);

  const fetchCalls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCalls.push(String(url));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  businessAgentFreeModel.setBusinessAgentChatExecutorForTest(async (chatRequest) => {
    const body = await chatRequest.json();
    assert.equal(body.model, "kr/claude-sonnet-4.5");
    assert.match(body.messages[0].content, /AI Agent Business/);
    assert.match(body.messages[0].content, /GStack skill/);
    assert.match(body.messages[0].content, /Startup skill/);
    assert.match(body.messages[1].content, /Next required field/);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                memory: {
                  project: "Founder Strategy Bot",
                  customer: "Solo founders before first revenue",
                  problem: "Ideas stay vague",
                  assumptions: ["Voice answers are enough to build a first brief"],
                },
                question:
                  "Where exactly does the founder feel the pain: before choosing the niche, writing the offer, or finding first customers?",
              }),
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  });

  try {
    const response = await telegramRoute.POST(
      new Request("http://localhost/api/business-agent/telegram", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "secret",
        },
        body: JSON.stringify({
          update_id: 1006,
          message: {
            chat: { id: 783 },
            date: 1780135380,
            text: "AI bot that interviews founders and creates a strategy file",
          },
        }),
      })
    );
    const session = sessionStore.getBusinessAgentTelegramSession("783");

    assert.equal(response.status, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(
      session?.answers.idea,
      "AI bot that interviews founders and creates a strategy file"
    );
    assert.equal(session?.memory?.project, "Founder Strategy Bot");
    assert.match(session?.transcript.at(-1)?.text || "", /Where exactly/);
  } finally {
    globalThis.fetch = originalFetch;
    businessAgentFreeModel.setBusinessAgentChatExecutorForTest(null);
    restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
    restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
    sessionStore.deleteBusinessAgentTelegramSession("783");
  }
});

test("business agent telegram webhook keeps prior session when reset reply fails", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET = "secret";

  const existingSession = businessAgent.createBusinessAgentInterviewSession({
    id: "782",
    channel: "telegram-text",
    language: "en",
  });
  sessionStore.saveBusinessAgentTelegramSession({
    ...existingSession,
    answers: { idea: "Existing idea before failed reset" },
    lastQuestionId: "problem",
  });

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: false, description: "temporary Telegram failure" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        telegramRoute.POST(
          new Request("http://localhost/api/business-agent/telegram", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-telegram-bot-api-secret-token": "secret",
            },
            body: JSON.stringify({
              update_id: 1005,
              message: {
                chat: { id: 782 },
                date: 1780135320,
                text: "/reset",
              },
            }),
          })
        ),
      /temporary Telegram failure/
    );
    assert.equal(
      sessionStore.getBusinessAgentTelegramSession("782")?.answers.idea,
      "Existing idea before failed reset"
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
    restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
    sessionStore.deleteBusinessAgentTelegramSession("782");
  }
});

test("business agent telegram webhook requires a configured secret", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  delete process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET;

  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const response = await telegramRoute.POST(
      new Request("http://localhost/api/business-agent/telegram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            chat: { id: 778 },
            date: 1780135200,
            text: "/start",
          },
        }),
      })
    );
    const body = (await response.json()) as {
      success?: boolean;
      error?: string;
    };

    assert.equal(response.status, 503);
    assert.equal(body.success, false);
    assert.match(body.error, /WEBHOOK_SECRET/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
    restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
    sessionStore.deleteBusinessAgentTelegramSession("778");
  }
});

test("business agent telegram webhook persists only after reply delivery", async () => {
  const originalFetch = globalThis.fetch;
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET = "secret";

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: false, description: "temporary Telegram failure" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        telegramRoute.POST(
          new Request("http://localhost/api/business-agent/telegram", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-telegram-bot-api-secret-token": "secret",
            },
            body: JSON.stringify({
              message: {
                chat: { id: 779 },
                date: 1780135200,
                text: "/start",
              },
            }),
          })
        ),
      /temporary Telegram failure/
    );
    assert.equal(sessionStore.getBusinessAgentTelegramSession("779"), null);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
    restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
    sessionStore.deleteBusinessAgentTelegramSession("779");
  }
});

test("business agent voice transcription defaults to Whisper Large v3", async () => {
  const originalFetch = globalThis.fetch;
  delete process.env.BUSINESS_AGENT_STT_ENDPOINT;
  delete process.env.BUSINESS_AGENT_STT_MODEL;
  process.env.GROQ_API_KEY = "test-groq-key";

  const fetchCalls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const requestUrl = String(url);
    fetchCalls.push(requestUrl);

    if (requestUrl.includes("/getFile")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file.ogg" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (requestUrl.includes("https://api.telegram.org/file/")) {
      return new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
        headers: { "content-type": "audio/ogg" },
      });
    }

    if (requestUrl === "https://api.groq.com/openai/v1/audio/transcriptions") {
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-groq-key");
      const body = init?.body;
      assert.ok(body instanceof FormData);
      assert.equal(body.get("model"), "whisper-large-v3");
      return new Response(JSON.stringify({ text: "Founder idea transcript" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(`Unexpected fetch call: ${requestUrl}`);
  }) as typeof fetch;

  try {
    const transcript = await voiceTranscription.transcribeTelegramBusinessVoice({
      botToken: "test-token",
      fileId: "voice-file-id",
    });

    assert.equal(transcript, "Founder idea transcript");
    assert.deepEqual(fetchCalls, [
      "https://api.telegram.org/bottest-token/getFile?file_id=voice-file-id",
      "https://api.telegram.org/file/bottest-token/voice/file.ogg",
      "https://api.groq.com/openai/v1/audio/transcriptions",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("BUSINESS_AGENT_STT_ENDPOINT", originalSttEndpoint);
    restoreEnv("BUSINESS_AGENT_STT_MODEL", originalSttModel);
    restoreEnv("GROQ_API_KEY", originalGroqApiKey);
  }
});

test("business agent route rejects paid models before provider calls", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("should not call provider");
  }) as typeof fetch;

  try {
    const response = await route.POST(
      new Request("http://localhost/api/business-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: sampleAnswers,
          language: "en",
          model: "openai/gpt-5",
        }),
      })
    );
    const body = (await response.json()) as BusinessAgentRouteBody;

    assert.equal(response.status, 400);
    assert.equal(fetchCalled, false);
    assert.match(body.error.message, /free model/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("business agent route calls the chat handler directly when API keys are required", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("business agent should not self-fetch /api/v1/chat/completions");
  }) as typeof fetch;
  process.env.REQUIRE_API_KEY = "true";

  businessAgentFreeModel.setBusinessAgentChatExecutorForTest(async (chatRequest) => {
    assert.equal(chatRequest.url, "http://localhost/api/v1/chat/completions");
    assert.equal(chatRequest.headers.get("authorization"), null);
    assert.equal(chatRequest.headers.get("x-omniroute-internal-caller"), "business-agent");

    const body = await chatRequest.json();
    assert.equal(body.model, "kr/claude-sonnet-4.5");
    assert.equal(body.stream, false);
    assert.equal(body.messages.length, 2);

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: "## AI Business Strategy\nDirect handler result." } }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    );
  });

  try {
    const response = await route.POST(
      new Request("http://localhost/api/business-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: sampleAnswers,
          language: "en",
          model: "kr/claude-sonnet-4.5",
        }),
      })
    );
    const body = (await response.json()) as BusinessAgentRouteBody;

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.mode, "ai");
    assert.match(body.reportMarkdown, /Direct handler result/);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("REQUIRE_API_KEY", originalRequireApiKey);
    businessAgentFreeModel.setBusinessAgentChatExecutorForTest(null);
  }
});

test("business agent route falls back locally when the free provider is unavailable", async () => {
  businessAgentFreeModel.setBusinessAgentChatExecutorForTest(async () => {
    return new Response(JSON.stringify({ error: { message: "Kiro not connected" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    const response = await route.POST(
      new Request("http://localhost/api/business-agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: sampleAnswers,
          language: "en",
          model: "kr/claude-sonnet-4.5",
        }),
      })
    );
    const body = (await response.json()) as BusinessAgentRouteBody;

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.mode, "local-fallback");
    assert.match(body.reportMarkdown, /Free Business Agent Consultation/);
    assert.match(body.filledFile?.content, /Filled Project Vault brief/);
    assert.match(body.filledFile?.content, /Content plan/);
    assert.match(body.warnings[0], /Kiro not connected/);
  } finally {
    businessAgentFreeModel.setBusinessAgentChatExecutorForTest(null);
  }
});
