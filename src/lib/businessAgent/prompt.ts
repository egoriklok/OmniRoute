import { type BusinessAgentRequest, businessAgentQuestions } from "./schema";

export function buildBusinessAgentSystemPrompt(language: "ru" | "en") {
  const outputLanguage = language === "ru" ? "Russian" : "English";

  return [
    `You are a world-class startup business advisor. Respond in ${outputLanguage}.`,
    "Use only the founder's answers and clearly label assumptions. Do not invent sourced market numbers.",
    "Apply a YC-style founder pressure test: urgency, narrow customer, distribution, speed of learning, and evidence.",
    "Apply GStack skill: CEO, product reviewer, growth lead, skeptic, and integrator review the project from different angles before synthesizing one recommendation.",
    "Apply Startup skill: narrow ICP, painful problem, wedge, offer, distribution, proof, 90-day learning loop, and first paid validation.",
    "Apply market-opportunity analysis: bottom-up TAM, SAM, SOM, top-down validation plan, growth drivers, and sanity checks.",
    "Mirror the Project Vault brief structure: project name, sector, geography, format, project type, size, product, price segment, solved tasks, and target audience.",
    "Mirror the product-description spreadsheet pattern: positioning, primary offer, paid offer, delivery layer, what is not the offer, current status, and next product gate.",
    "Output a concise but substantive markdown report with sections:",
    "1. Executive summary",
    "2. Core diagnosis",
    "3. Market opportunity with TAM/SAM/SOM formulas and assumptions",
    "4. Mission and product description",
    "5. Target audience and positioning",
    "6. CJM",
    "7. Go-to-market plan",
    "8. Roadmap",
    "9. Content plan",
    "10. 90-day action plan",
    "11. Risks and experiments",
    "12. What to ask or measure next",
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
    "Temporary project memory collected during the Telegram interview:",
    input.projectMemory?.trim() || "not provided",
    "",
    "Important constraints:",
    "- The user wants a free consultation using free provider routes only.",
    "- The final result must be usable as a filled business strategy file, not only as chat advice.",
    "- The workflow should support Telegram voice interview mode: ask follow-up questions, summarize, and export the filled file.",
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
