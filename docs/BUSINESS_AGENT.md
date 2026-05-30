# Business Agent

Business Agent is a local/free startup consultation workflow. A founder answers a structured
interview, OmniRoute tries a free model route, and the dashboard returns both a consultation report
and a downloadable filled strategy file.

The workflow is designed to be the same core engine a Telegram voice bot would use: transcribe voice
answers, ask follow-up questions, normalize the answers into the Project Vault brief, and export a
filled file with mission, CJM, roadmap, target audience, content plan, market sizing, risks, and a
90-day execution plan.

## Free-Only Route

- Default model: `kr/claude-sonnet-4.5`
- Other built-in free options: `kr/claude-haiku-4.5`, `if/kimi-k2`, `pol/openai-fast`,
  `lc/LongCat-Flash-Lite`, plus explicit `:free` model routes
- Paid model ids are rejected by `/api/business-agent`
- If the selected free provider is not connected or fails, the API returns a local fallback report
  instead of charging a paid model

Kiro can be connected from `Dashboard -> Providers -> Kiro -> Connect`. The workflow still works
without Kiro by using the local fallback engine.

## Source Templates Used

The first source is the local Project Vault CSV brief. The Business Agent now maps founder answers to
these brief fields:

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

The second source is the product-description Google Sheet pattern available to the authenticated
Drive user. Its exported structure is a field/value product update with product name, one-line
positioning, primary offer, paid offer, delivery layer, "not the offer", current runtime status, and
next product gate. Business Agent mirrors that pattern inside the generated strategy file.

Example Google Sheet product record used as a pattern:

- Product name: Agent Fiscal Autonomy Audit
- Positioning: readiness audit for services that want to be safely usable by AI buyer-agents
- Primary offer: free public/no-payment readiness snapshot
- Paid offer: fixed-scope readiness review after explicit scope acceptance
- Next gate: rail-aware scoring inside free snapshots and routing prospects to scope acceptance

## Analysis Framework

The prompt combines three lenses:

1. YC-style pressure test: urgent problem, narrow customer, evidence, distribution, learning speed
2. GStack-style role review: CEO, product reviewer, growth lead, skeptic, integrator
3. Market opportunity: bottom-up TAM, SAM, SOM, top-down validation plan, growth drivers, sanity checks

It also uses the gstack idea of explicit specialist roles instead of one blended persona. The startup
review separates CEO judgment, product review, growth review, skeptic review, and integrator output.

The local fallback does not invent market data. If the founder gives a numerical customer-count
assumption and a price assumption, it calculates a draft bottom-up market size. Otherwise, it gives
the formulas and asks for the missing assumptions.

## Dashboard Output

`/dashboard/business-agent` now returns:

- consultation report
- downloadable `*-strategy-file.md`
- filled Project Vault brief
- product-description table
- mission
- target audience profile
- CJM
- roadmap
- content plan
- market opportunity analysis
- risk and experiment backlog

## Telegram Voice Bot Target Flow

See [Telegram Business Voice Bot](TELEGRAM_BUSINESS_VOICE_BOT.md) for the full voice-bot design.
The dashboard implementation intentionally keeps the reusable core in `src/lib/businessAgent` so the
same schema, prompt, local fallback, and filled-file generator can be called from a Telegram adapter.

## Multi-Agent Decision Log

| Decision                                                      | Alternatives Considered                   | Objection                                                          | Resolution                                               |
| ------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Add a dedicated dashboard page at `/dashboard/business-agent` | Hide the workflow inside Skills or Agents | A hidden workflow would be hard for non-technical founders to find | Accepted dedicated page and added a dashboard quick link |
| Enforce free-only model ids in the API                        | Let users choose any model                | This could accidentally use paid resources                         | Accepted strict allowlist plus `:free` routes            |
| Use Kiro as the default free route                            | Require OpenRouter/Groq/Gemini API keys   | The user explicitly pointed to Kiro connect flow                   | Accepted Kiro default with other free backups            |
| Provide local fallback when provider auth is missing          | Fail until the user logs in               | This would block the free consultation                             | Accepted deterministic fallback with clear warning       |
| Avoid sourced market numbers without data                     | Ask the model to estimate everything      | Hallucinated TAM/SAM/SOM would create false confidence             | Accepted formulas, assumptions, and validation plan      |
| Generate a filled file, not just advice                       | Show markdown only in the dashboard       | The original request asked for a filled file after interview       | Accepted downloadable markdown strategy file             |
| Keep Telegram voice as an adapter layer                       | Build a separate paid bot service now     | Bot tokens and voice transcription are runtime concerns            | Accepted documented adapter with reusable free core      |

## Review Notes

- Skeptic: the feature must not imply "world-class" certainty when market data is missing.
- Constraint Guardian: no paid providers, no external paid services, no secrets in code.
- User Advocate: the first screen must be a usable form with a visible Kiro connection path.
- Integrator: ship a free-only route with local fallback, then allow Kiro login to improve the report.
