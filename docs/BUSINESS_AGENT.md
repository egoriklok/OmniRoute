# Business Agent

Business Agent is a local dashboard workflow for a free startup consultation. A founder fills a
structured interview, OmniRoute tries a free model route, and the dashboard returns a practical
markdown report with startup diagnosis, market opportunity, recommendations, and a 90-day plan.

## Free-Only Route

- Default model: `kr/claude-sonnet-4.5`
- Other built-in free options: `kr/claude-haiku-4.5`, `if/kimi-k2-thinking`, `pol/gpt-5`,
  `lc/longcat-flash-lite`, `combo/free-stack`, `combo/free-forever`
- Paid model ids are rejected by `/api/business-agent`
- If the selected free provider is not connected or fails, the API returns a local fallback report
  instead of charging a paid model

Kiro can be connected from `Dashboard -> Providers -> Kiro -> Connect`. The workflow still works
without Kiro by using the local fallback engine.

## Analysis Framework

The prompt combines three lenses:

1. YC-style pressure test: urgent problem, narrow customer, evidence, distribution, learning speed
2. GStack-style role review: CEO, product reviewer, growth lead, skeptic, integrator
3. Market opportunity: bottom-up TAM, SAM, SOM, top-down validation plan, growth drivers, sanity checks

The local fallback does not invent market data. If the founder gives a numerical customer-count
assumption and a price assumption, it calculates a draft bottom-up market size. Otherwise, it gives
the formulas and asks for the missing assumptions.

## Multi-Agent Decision Log

| Decision                                                      | Alternatives Considered                   | Objection                                                          | Resolution                                               |
| ------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------- |
| Add a dedicated dashboard page at `/dashboard/business-agent` | Hide the workflow inside Skills or Agents | A hidden workflow would be hard for non-technical founders to find | Accepted dedicated page and added a dashboard quick link |
| Enforce free-only model ids in the API                        | Let users choose any model                | This could accidentally use paid resources                         | Accepted strict allowlist/prefix guard                   |
| Use Kiro as the default free route                            | Require OpenRouter/Groq/Gemini API keys   | The user explicitly pointed to Kiro connect flow                   | Accepted Kiro default with other free backups            |
| Provide local fallback when provider auth is missing          | Fail until the user logs in               | This would block the free consultation                             | Accepted deterministic fallback with clear warning       |
| Avoid sourced market numbers without data                     | Ask the model to estimate everything      | Hallucinated TAM/SAM/SOM would create false confidence             | Accepted formulas, assumptions, and validation plan      |

## Review Notes

- Skeptic: the feature must not imply "world-class" certainty when market data is missing.
- Constraint Guardian: no paid providers, no external paid services, no secrets in code.
- User Advocate: the first screen must be a usable form with a visible Kiro connection path.
- Integrator: ship a free-only route with local fallback, then allow Kiro login to improve the report.
