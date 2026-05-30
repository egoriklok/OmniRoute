# Telegram Business Voice Bot

This document defines the missing target product around the reusable Business Agent core: a Telegram
voice bot that interviews a founder from zero and returns a filled business strategy file.

## User Outcome

The user speaks with a Telegram bot about a new business idea. The bot asks structured follow-up
questions, keeps the conversation in interview mode, and produces a filled markdown file with:

- Project Vault brief
- product description
- mission
- target audience and ICP
- CJM
- roadmap
- market opportunity
- go-to-market plan
- content plan
- risk checks
- 90-day action plan

## Source Inputs

The adapter must use the same `src/lib/businessAgent` schema used by the dashboard.
The executable interview state machine lives in `src/lib/businessAgent/interview.ts` and is designed
for a Telegram adapter to call after receiving text or a voice transcript.
The executable webhook route is `POST /api/business-agent/telegram`.

Project Vault CSV fields:

- name
- activity sector
- geography
- format
- project type
- current size
- product
- price segment
- solved tasks
- target audience

Google Sheet product-description pattern:

- update date
- source spreadsheet
- repo/product evidence
- product name
- one-line positioning
- primary offer
- paid offer
- rail or delivery layer
- what changed
- not the offer
- current runtime status
- next product gate

## Free-Only Architecture

```mermaid
flowchart TD
  User["Founder in Telegram"] --> Voice["Voice or text answer"]
  Voice --> Adapter["Telegram adapter"]
  Adapter --> STT{"Voice?"}
  STT -->|text| State["Interview state"]
  STT -->|voice| LocalSTT["Local/free STT: whisper.cpp or Vosk"]
  LocalSTT --> State
  State --> Questions["Business Agent question schema"]
  Questions --> Missing["Find missing fields and ask follow-up"]
  Missing --> Complete{"Minimum brief complete?"}
  Complete -->|no| User
  Complete -->|yes| API["/api/business-agent/telegram"]
  API --> FreeModel["Business Agent local/free generator"]
  API --> Fallback["Local fallback report"]
  FreeModel --> File["Filled strategy markdown file"]
  Fallback --> File
  File --> TelegramFile["Send document back in Telegram"]
```

No paid STT, paid LLM, payment rail, or hosted database is required for the default path.

## Runtime Setup

Required environment variable:

- `TELEGRAM_BOT_TOKEN`: token from BotFather.

Recommended environment variable:

- `BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET`: secret passed to Telegram `setWebhook` and checked via
  `x-telegram-bot-api-secret-token`.

Optional local/free voice transcription:

- `BUSINESS_AGENT_STT_ENDPOINT`: local HTTP endpoint that accepts multipart `file` and returns JSON
  with `text` or `transcript`.
- `BUSINESS_AGENT_ALLOW_REMOTE_STT=1`: only set this if you intentionally use a remote STT endpoint.
  By default, non-local STT endpoints are rejected.

Webhook registration example:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://YOUR_HOST/api/business-agent/telegram" \
  -d "secret_token=$BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET"
```

## Interview Stages

1. Intake: name, sector, geography, format, project type, size.
2. Problem: painful job-to-be-done, urgency, current alternative.
3. Customer: target segment, budget context, decision trigger.
4. Product: first product, delivery format, differentiation, price.
5. Market: reachable customer count, pricing assumption, geography.
6. GTM: first 10 customers, channels, partnerships, founder-led sales.
7. Strategy: mission, CJM notes, roadmap milestones, content channels.
8. Review: bot summarizes answers and asks for corrections.
9. Export: bot calls Business Agent and returns the filled file.

## State Model

The adapter should persist one session per Telegram chat. The canonical TypeScript shape is exported
as `BusinessAgentInterviewSession`:

```ts
type TelegramBusinessSession = {
  chatId: string;
  answers: Partial<Record<BusinessAgentQuestionId, string>>;
  lastQuestionId?: BusinessAgentQuestionId;
  transcript: Array<{
    role: "bot" | "user";
    text: string;
    receivedAt: string;
  }>;
  status: "interviewing" | "reviewing" | "generating" | "complete";
};
```

SQLite is enough for local mode. The adapter can reuse OmniRoute's existing local database patterns,
but secrets such as `TELEGRAM_BOT_TOKEN` must stay in environment variables.

## Follow-Up Logic

The bot should ask one concise question at a time. It should not dump the whole questionnaire into
Telegram.

Priority order:

1. Required fields: business idea, problem, target customer, solution.
2. Project Vault fields needed for the filled brief.
3. Market math fields: market size assumption and price.
4. Strategy fields: mission, CJM notes, roadmap notes, content channels.
5. Evidence fields: traction, competition, constraints.

After every 4-6 answers, the bot should summarize what it understood and ask whether to continue or
correct something.

The implementation entrypoints are:

- `createBusinessAgentInterviewSession(...)`
- `applyBusinessAgentInterviewTurn(session, input)`
- `getBusinessAgentInterviewProgress(session)`
- `buildBusinessAgentRequestFromSession(session)`
- `extractTelegramBusinessAgentInput(update, { voiceTranscript })`
- `buildTelegramBusinessAgentDocument(response)`
- `getBusinessAgentTelegramSession(chatId)`
- `saveBusinessAgentTelegramSession(session)`
- `transcribeTelegramBusinessVoice({ botToken, fileId })`

`applyBusinessAgentInterviewTurn` accepts either text or a `voiceTranscript`. A Telegram adapter only
needs to transcribe the OGG voice message through a local/free STT engine, pass the transcript into
this function, and persist the returned session.

`extractTelegramBusinessAgentInput` performs the Telegram-specific part: chat id extraction, command
parsing, voice file detection, and signaling when local STT is needed.

## Telegram Commands

- `/start` creates or resumes a session.
- `/brief` shows completed and missing fields.
- `/generate` generates the report if required fields are present.
- `/reset` clears the current interview.
- `/help` explains voice/text support and that the default path is free-only.

## Implemented Flow

1. `POST /api/business-agent/telegram` receives Telegram updates.
2. The route validates `BUSINESS_AGENT_TELEGRAM_WEBHOOK_SECRET` when configured.
3. Text and commands are parsed directly.
4. Voice messages are downloaded through Telegram `getFile` and passed to `BUSINESS_AGENT_STT_ENDPOINT`.
5. Sessions are persisted in SQLite `key_value` under `businessAgentTelegramSessions`.
6. The interview state machine asks one missing question at a time.
7. `/generate` builds the Business Agent local fallback report and filled markdown strategy file.
8. The route sends the reply text and then sends the strategy file back as a Telegram document.

## Acceptance Criteria

- A founder can complete the required interview by voice or text.
- Paid model ids are rejected.
- If Kiro is disconnected, local fallback still returns a useful file.
- The returned file contains Project Vault brief, product description, mission, CJM, roadmap, target
  audience, content plan, market opportunity, and 90-day plan.
- The bot does not store secrets in Git and does not require paid infrastructure.
