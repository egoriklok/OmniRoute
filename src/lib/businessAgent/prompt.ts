import { type BusinessAgentRequest, businessAgentQuestions } from "./schema";

export function buildBusinessAgentSystemPrompt(language: "ru" | "en") {
  const outputLanguage = language === "ru" ? "Russian" : "English";

  return [
    `You are a world-class startup business advisor. Respond in ${outputLanguage}.`,
    "Use only the founder's answers and clearly label assumptions. Do not invent sourced market numbers.",
    "Apply a YC-style founder pressure test: urgency, narrow customer, distribution, speed of learning, and evidence.",
    "Apply a GStack-style multi-role review: CEO, product reviewer, growth lead, skeptic, and integrator.",
    "Apply market-opportunity analysis: bottom-up TAM, SAM, SOM, top-down validation plan, growth drivers, and sanity checks.",
    "Output a concise but substantive markdown report with sections:",
    "1. Executive summary",
    "2. Core diagnosis",
    "3. Market opportunity with TAM/SAM/SOM formulas and assumptions",
    "4. Customer and positioning",
    "5. Go-to-market plan",
    "6. 90-day action plan",
    "7. Risks and experiments",
    "8. What to ask or measure next",
    "Keep the advice practical, specific, and honest. Avoid motivational filler.",
  ].join("\n");
}

export function buildBusinessAgentUserPrompt(input: BusinessAgentRequest) {
  const answerLines = businessAgentQuestions.map((question) => {
    const value = input.answers[question.id]?.trim() || "not provided";
    return `- ${question.label}: ${value}`;
  });

  return [
    "Founder interview answers:",
    ...answerLines,
    "",
    "Important constraints:",
    "- The user wants a free consultation using free provider routes only.",
    "- If market data is missing, give a research plan and formulas instead of pretending certainty.",
    "- Use direct recommendations, not generic business-school abstractions.",
  ].join("\n");
}

export function buildBusinessAgentMessages(input: BusinessAgentRequest) {
  return [
    { role: "system", content: buildBusinessAgentSystemPrompt(input.language) },
    { role: "user", content: buildBusinessAgentUserPrompt(input) },
  ];
}
