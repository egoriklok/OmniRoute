import {
  type BusinessAgentQuestionId,
  type BusinessAgentRequest,
  type BusinessAgentResponse,
} from "./schema";

const projectVaultBriefFields = [
  "Name",
  "Activity sector",
  "Geography",
  "Format",
  "Project type",
  "Current size",
  "Product",
  "Price segment",
  "Solved tasks",
  "Target audience",
] as const;

const productDescriptionPattern = [
  "Update date",
  "Source spreadsheet",
  "Repo/product evidence",
  "Product name",
  "One-line positioning",
  "Primary offer",
  "Paid offer",
  "Rail or delivery layer",
  "What changed",
  "Not the offer",
  "Current runtime status",
  "Next product gate",
] as const;

const answerLabels: Record<BusinessAgentQuestionId, string> = {
  projectName: "Project name",
  sector: "Sector",
  founderContext: "Founder context",
  idea: "Business idea",
  problem: "Problem",
  targetCustomer: "Target customer",
  geography: "Geography",
  format: "Format",
  projectType: "Project type",
  companySize: "Current size",
  currentAlternatives: "Current alternatives",
  solution: "Solution",
  product: "Product",
  priceSegment: "Price segment",
  differentiation: "Differentiation",
  businessModel: "Business model",
  price: "Price",
  marketSize: "Market size assumption",
  goToMarket: "Go-to-market",
  traction: "Traction",
  competition: "Competition",
  constraints: "Constraints",
  goal90Days: "90-day goal",
  mission: "Mission draft",
  cjmContext: "Customer journey notes",
  roadmapContext: "Roadmap notes",
  contentChannels: "Content channels",
};

function clean(value: string | undefined, fallback = "not provided") {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function answer(input: BusinessAgentRequest, id: BusinessAgentQuestionId, fallback?: string) {
  return clean(input.answers[id], fallback);
}

function firstNumber(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function moneyLabel(value: number) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

function row(cells: string[]) {
  return `| ${cells.map((cell) => escapeMarkdownCell(cell)).join(" | ")} |`;
}

function sanitizeFilenamePart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function projectTitle(input: BusinessAgentRequest) {
  return clean(input.answers.projectName, clean(input.answers.idea, "business-agent-project"));
}

function channels(input: BusinessAgentRequest) {
  const raw = answer(input, "contentChannels", answer(input, "goToMarket", ""));
  const parsed = raw
    .split(/[,;\n]/)
    .map((channel) => channel.trim())
    .filter(Boolean)
    .slice(0, 5);
  return parsed.length ? parsed : ["Telegram", "LinkedIn", "Founder communities"];
}

function buildFilledBrief(input: BusinessAgentRequest) {
  return [
    row(["Field", "Answer", "Agent synthesis"]),
    row(["---", "---", "---"]),
    row([
      "Name",
      answer(input, "projectName"),
      "Use as the top-level brand or personal-brand label.",
    ]),
    row([
      "Activity sector",
      answer(input, "sector"),
      "Anchor examples, competitors, and content topics here.",
    ]),
    row([
      "Geography",
      answer(input, "geography"),
      "Start narrow before expanding the market story.",
    ]),
    row(["Format", answer(input, "format"), "Defines delivery, onboarding, and sales motion."]),
    row([
      "Project type",
      answer(input, "projectType"),
      "Clarifies whether the first strategy is B2B, B2C, marketplace, or personal brand.",
    ]),
    row(["Current size", answer(input, "companySize"), "Sets execution realism for the roadmap."]),
    row([
      "Product",
      answer(input, "product", answer(input, "solution")),
      "What the customer actually receives.",
    ]),
    row([
      "Price segment",
      answer(input, "priceSegment", answer(input, "price")),
      "Use for positioning and qualification.",
    ]),
    row([
      "Solved tasks",
      answer(input, "problem"),
      "Translate pain into concrete jobs-to-be-done.",
    ]),
    row([
      "Target audience",
      answer(input, "targetCustomer"),
      "First ICP; avoid broad market claims until validated.",
    ]),
  ].join("\n");
}

function buildProductDescriptionPattern(input: BusinessAgentRequest) {
  return [
    row(["Field", "Filled value"]),
    row(["---", "---"]),
    row(["Update date", new Date().toISOString().slice(0, 10)]),
    row([
      "Source spreadsheet",
      "Project Vault brief CSV + product-description Google Sheet pattern",
    ]),
    row(["Product name", projectTitle(input)]),
    row(["One-line positioning", answer(input, "idea")]),
    row(["Primary offer", answer(input, "solution")]),
    row([
      "Paid offer",
      answer(input, "price", "Define after 3-5 paid pilots or strong willingness-to-pay evidence."),
    ]),
    row([
      "Delivery layer",
      answer(
        input,
        "format",
        "Telegram voice interview, dashboard form, and markdown strategy file"
      ),
    ]),
    row([
      "What changed",
      "Founder answers were converted into strategy, CJM, roadmap, content plan, and validation tasks.",
    ]),
    row([
      "Not the offer",
      "Do not present assumptions as proven market facts. Do not use paid models unless explicitly selected outside this free workflow.",
    ]),
    row([
      "Current runtime status",
      "Free-only API route with Kiro default and local fallback report.",
    ]),
    row([
      "Next product gate",
      answer(
        input,
        "goal90Days",
        "Validate the first customer segment and ship the smallest useful output file."
      ),
    ]),
  ].join("\n");
}

function buildMission(input: BusinessAgentRequest) {
  const mission = answer(input, "mission", "");
  if (mission) return mission;
  return `Help ${answer(input, "targetCustomer")} solve "${answer(input, "problem")}" through ${answer(
    input,
    "solution"
  )}.`;
}

function buildCjm(input: BusinessAgentRequest) {
  return [
    row(["Stage", "Customer state", "Bot interview focus", "Output artifact", "Success signal"]),
    row(["---", "---", "---", "---", "---"]),
    row([
      "Awareness",
      "Customer notices the pain.",
      "Ask what triggered the search now.",
      "Problem narrative",
      "Clear urgent trigger",
    ]),
    row([
      "Consideration",
      "Customer compares alternatives.",
      "Ask what they use today and why it fails.",
      "Alternatives map",
      "Named substitutes",
    ]),
    row([
      "Decision",
      "Customer judges trust and fit.",
      "Ask budget, risk, and expected outcome.",
      "Offer and objections",
      "Willingness to pay or pilot",
    ]),
    row([
      "Activation",
      "Customer receives first value.",
      "Ask what file/report/action plan must be useful today.",
      "Filled strategy file",
      "First action completed",
    ]),
    row([
      "Retention",
      "Customer returns for next step.",
      "Ask what changed after the first sprint.",
      "Roadmap update",
      "Repeat use or referral",
    ]),
  ].join("\n");
}

function buildRoadmap(input: BusinessAgentRequest) {
  return [
    row(["Timeframe", "Goal", "Actions", "Evidence gate"]),
    row(["---", "---", "---", "---"]),
    row([
      "Days 0-7",
      "Tighten ICP and problem.",
      `Interview 5-10 ${answer(input, "targetCustomer")} and capture current alternatives.`,
      "At least 3 repeated pain patterns.",
    ]),
    row([
      "Days 8-30",
      "Ship smallest useful product.",
      answer(input, "roadmapContext", answer(input, "solution")),
      "One working demo or delivered manual service.",
    ]),
    row([
      "Days 31-60",
      "Prove distribution.",
      answer(input, "goToMarket", "Founder-led outbound and community posts."),
      "Qualified conversations every week.",
    ]),
    row([
      "Days 61-90",
      "Validate payment and retention.",
      answer(input, "goal90Days", "Close pilots and measure repeated use."),
      "Paid pilots or clear rejection reasons.",
    ]),
  ].join("\n");
}

function buildContentPlan(input: BusinessAgentRequest) {
  const planChannels = channels(input);
  return [
    row(["Channel", "Content angle", "Weekly cadence", "Conversion action"]),
    row(["---", "---", "---", "---"]),
    ...planChannels.map((channel) =>
      row([
        channel,
        `Show the cost of "${answer(input, "problem")}" and the before/after of ${answer(input, "solution")}.`,
        "2-3 posts or short demos",
        "Invite to a free diagnostic interview or pilot.",
      ])
    ),
  ].join("\n");
}

function buildMarketOpportunity(input: BusinessAgentRequest) {
  const customers = firstNumber(input.answers.marketSize);
  const price = firstNumber(input.answers.price);

  if (customers && price) {
    const annualRevenuePerCustomer = price < 1000 ? price * 12 : price;
    const tam = customers * annualRevenuePerCustomer;
    const sam = tam * 0.25;
    const som3 = sam * 0.03;
    const som5 = sam * 0.06;

    return [
      row(["Metric", "Draft value", "Assumption"]),
      row(["---", "---", "---"]),
      row([
        "TAM",
        moneyLabel(tam),
        `${customers.toLocaleString()} reachable customers x ${moneyLabel(
          annualRevenuePerCustomer
        )} annual revenue per customer.`,
      ]),
      row([
        "SAM",
        moneyLabel(sam),
        "25% of TAM is realistically serviceable with the first geography, offer, and delivery capacity.",
      ]),
      row([
        "SOM year 3",
        moneyLabel(som3),
        "3% of SAM until sales evidence proves a stronger capture rate.",
      ]),
      row([
        "SOM year 5",
        moneyLabel(som5),
        "6% of SAM if retention, referrals, and acquisition channels compound.",
      ]),
      "",
      "- Treat this as a working model, not proven market truth.",
      "- Validate with public datasets, competitor revenue, customer interviews, and paid-pilot conversion.",
    ].join("\n");
  }

  return [
    row(["Metric", "How to fill", "Evidence needed"]),
    row(["---", "---", "---"]),
    row([
      "TAM",
      "First geography customer count x annual revenue per customer.",
      "Public datasets, industry directories, taxonomies, or bottom-up lead lists.",
    ]),
    row([
      "SAM",
      "Narrow TAM by reachable channel, budget fit, product readiness, and delivery capacity.",
      "Customer interviews and channel tests.",
    ]),
    row([
      "SOM",
      "Use 2-3% of SAM for a conservative 3-year target and 4-6% for year 5.",
      "Pilot close rate, retention, repeat purchase, and referral data.",
    ]),
    "",
    "- Missing data: add a numerical customer-count assumption and price assumption to unlock automatic bottom-up math.",
  ].join("\n");
}

function buildNinetyDayActionPlan(input: BusinessAgentRequest) {
  return [
    row(["Period", "Action", "Output", "Decision gate"]),
    row(["---", "---", "---", "---"]),
    row([
      "Days 0-7",
      `Interview 5-10 ${answer(input, "targetCustomer")} about "${answer(input, "problem")}".`,
      "Pain-pattern notes, current alternatives, objection list.",
      "Continue only if at least 3 people describe the same urgent pain.",
    ]),
    row([
      "Days 8-30",
      `Deliver the smallest useful version of "${answer(input, "solution")}".`,
      "Manual MVP, demo, landing page, or first delivered service.",
      "Continue only if users ask for the next step or agree to a pilot.",
    ]),
    row([
      "Days 31-60",
      answer(input, "goToMarket", "Run founder-led sales through the most direct channel."),
      "Weekly outreach/content cadence and conversion tracker.",
      "Double down on the channel with the highest qualified conversation rate.",
    ]),
    row([
      "Days 61-90",
      answer(input, "goal90Days", "Close paid pilots and measure repeat use."),
      "Revenue, retention signal, testimonial, or clear rejection reasons.",
      "Scale only after willingness to pay and delivery quality are visible.",
    ]),
  ].join("\n");
}

export function buildBusinessAgentFilledFile(
  input: BusinessAgentRequest,
  reportMarkdown: string
): BusinessAgentResponse["filledFile"] {
  const title = projectTitle(input);
  const sections = [
    "Source templates",
    "Filled Project Vault brief",
    "Product description",
    "Mission",
    "Target audience",
    "CJM",
    "Roadmap",
    "Content plan",
    "Market opportunity",
    "90-day action plan",
    "Original consultation report",
  ];
  const filename = `${sanitizeFilenamePart(title) || "business-agent"}-strategy-file.md`;

  const content = [
    `# ${title} - Strategy File`,
    "",
    "## Source templates",
    "This file is generated from the founder interview and mirrors two source structures:",
    "",
    "- Project Vault CSV brief fields: " + projectVaultBriefFields.join(", ") + ".",
    "- Product-description Google Sheet pattern: " + productDescriptionPattern.join(", ") + ".",
    "",
    "## Filled Project Vault brief",
    buildFilledBrief(input),
    "",
    "## Product description",
    buildProductDescriptionPattern(input),
    "",
    "## Mission",
    buildMission(input),
    "",
    "## Target audience",
    [
      row(["Dimension", "Value"]),
      row(["---", "---"]),
      row(["Primary ICP", answer(input, "targetCustomer")]),
      row(["Pain", answer(input, "problem")]),
      row(["Current alternative", answer(input, "currentAlternatives")]),
      row(["Buying context", answer(input, "priceSegment", answer(input, "price"))]),
      row([
        "Trust proof needed",
        answer(input, "traction", "Interviews, pilots, testimonials, or public demos."),
      ]),
    ].join("\n"),
    "",
    "## CJM",
    buildCjm(input),
    "",
    "## Roadmap",
    buildRoadmap(input),
    "",
    "## Content plan",
    buildContentPlan(input),
    "",
    "## Market opportunity",
    buildMarketOpportunity(input),
    "",
    "## 90-day action plan",
    buildNinetyDayActionPlan(input),
    "",
    "## Original consultation report",
    reportMarkdown,
  ].join("\n");

  return {
    filename,
    mimeType: "text/markdown",
    content,
    sections,
  };
}
