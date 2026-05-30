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
process.env.DATA_DIR = tmpDir;

const core = await import("../../src/lib/db/core.ts");
const businessAgent = await import("../../src/lib/businessAgent/index.ts");
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
  assert.match(messages[0].content, /GStack-style multi-role review/);
  assert.match(messages[0].content, /TAM, SAM, SOM/);
  assert.match(messages[0].content, /Project Vault brief structure/);
  assert.match(messages[0].content, /CJM/);
  assert.match(messages[1].content, /AI consultant for early-stage founders/);
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
  assert.ok(filledFile.sections.includes("Target audience"));
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
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("TELEGRAM_BOT_TOKEN", originalTelegramBotToken);
    restoreEnv("BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET", originalTelegramWebhookSecret);
    sessionStore.deleteBusinessAgentTelegramSession("777");
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

test("business agent voice transcription defaults to local qwen ASR", async () => {
  const originalFetch = globalThis.fetch;
  delete process.env.BUSINESS_AGENT_STT_ENDPOINT;
  delete process.env.BUSINESS_AGENT_STT_MODEL;

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

    if (requestUrl === "http://localhost:8000/v1/audio/transcriptions") {
      const body = init?.body;
      assert.ok(body instanceof FormData);
      assert.equal(body.get("model"), "qwen3-asr");
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
      "http://localhost:8000/v1/audio/transcriptions",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv("BUSINESS_AGENT_STT_ENDPOINT", originalSttEndpoint);
    restoreEnv("BUSINESS_AGENT_STT_MODEL", originalSttModel);
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

test("business agent route falls back locally when the free provider is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "Kiro not connected" } }), {
      status: 503,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

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
    globalThis.fetch = originalFetch;
  }
});
