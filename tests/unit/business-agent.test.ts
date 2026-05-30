import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-business-agent-"));
const originalDataDir = process.env.DATA_DIR;
process.env.DATA_DIR = tmpDir;

const core = await import("../../src/lib/db/core.ts");
const businessAgent = await import("../../src/lib/businessAgent/index.ts");
const route = await import("../../src/app/api/business-agent/route.ts");

const sampleAnswers = {
  idea: "AI consultant for early-stage founders",
  problem: "Founders cannot turn rough ideas into a market-backed plan",
  targetCustomer: "Solo founders before first revenue",
  solution: "A guided interview that produces a startup strategy",
  marketSize: "50000 reachable founders",
  price: "$49/month",
  goToMarket: "Founder-led communities and Telegram channels",
};

type BusinessAgentRouteBody = {
  success?: boolean;
  mode?: string;
  reportMarkdown?: string;
  warnings?: string[];
  error?: {
    message?: string;
  };
};

test.after(() => {
  core.resetDbInstance();
  process.env.DATA_DIR = originalDataDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("business agent accepts only free model routes", () => {
  assert.equal(businessAgent.isFreeBusinessAgentModel("kr/claude-sonnet-4.5"), true);
  assert.equal(businessAgent.isFreeBusinessAgentModel("openrouter/deepseek-r1:free"), true);
  assert.equal(businessAgent.isFreeBusinessAgentModel("combo/free-stack"), true);
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
  assert.match(messages[1].content, /AI consultant for early-stage founders/);
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
    assert.match(body.warnings[0], /Kiro not connected/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
