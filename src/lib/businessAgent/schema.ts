import { z } from "zod";

export const businessAgentQuestionIds = [
  "founderContext",
  "idea",
  "problem",
  "targetCustomer",
  "geography",
  "currentAlternatives",
  "solution",
  "differentiation",
  "businessModel",
  "price",
  "marketSize",
  "goToMarket",
  "traction",
  "competition",
  "constraints",
  "goal90Days",
] as const;

export type BusinessAgentQuestionId = (typeof businessAgentQuestionIds)[number];

export type BusinessAgentQuestion = {
  id: BusinessAgentQuestionId;
  label: string;
  prompt: string;
  placeholder: string;
  required?: boolean;
};

export const businessAgentQuestions: BusinessAgentQuestion[] = [
  {
    id: "founderContext",
    label: "Founder context",
    prompt: "Who is building this and why are they credible?",
    placeholder: "Solo founder, domain background, unfair access, current team...",
  },
  {
    id: "idea",
    label: "Business idea",
    prompt: "Describe the idea in one sentence.",
    placeholder: "We help X achieve Y by doing Z.",
    required: true,
  },
  {
    id: "problem",
    label: "Problem",
    prompt: "What painful, frequent, expensive problem does this solve?",
    placeholder: "Users currently lose time/money because...",
    required: true,
  },
  {
    id: "targetCustomer",
    label: "Target customer",
    prompt: "Who is the first narrow customer segment?",
    placeholder: "Example: independent beauty salons with 3-20 employees...",
    required: true,
  },
  {
    id: "geography",
    label: "Geography",
    prompt: "Where will you start?",
    placeholder: "Russia, CIS, US SMBs, global English-speaking creators...",
  },
  {
    id: "currentAlternatives",
    label: "Current alternatives",
    prompt: "What do customers use today instead?",
    placeholder: "Manual spreadsheets, agencies, WhatsApp, Notion, competitors...",
  },
  {
    id: "solution",
    label: "Solution",
    prompt: "What exactly will the first product do?",
    placeholder: "Core workflow, inputs, output, automation, integrations...",
    required: true,
  },
  {
    id: "differentiation",
    label: "Differentiation",
    prompt: "Why can this win against alternatives?",
    placeholder: "Speed, price, data advantage, distribution, workflow fit...",
  },
  {
    id: "businessModel",
    label: "Business model",
    prompt: "How will the business make money?",
    placeholder: "Subscription, one-time setup, transaction fee, marketplace take rate...",
  },
  {
    id: "price",
    label: "Price",
    prompt: "What is the expected price or average revenue per customer?",
    placeholder: "Example: $49/month, 15,000 RUB/month, 10% take rate...",
  },
  {
    id: "marketSize",
    label: "Market size assumption",
    prompt: "How many reachable customers/users exist in the first market?",
    placeholder: "Example: 20,000 salons in Moscow and St. Petersburg...",
  },
  {
    id: "goToMarket",
    label: "Go-to-market",
    prompt: "How will you get the first 10 customers?",
    placeholder: "Founder-led sales, Telegram communities, partnerships, cold email...",
  },
  {
    id: "traction",
    label: "Traction",
    prompt: "What evidence do you already have?",
    placeholder: "Interviews, waitlist, pilots, revenue, LOIs, community response...",
  },
  {
    id: "competition",
    label: "Competition",
    prompt: "Name direct or indirect competitors.",
    placeholder: "Competitor names, substitutes, internal team, no-buy behavior...",
  },
  {
    id: "constraints",
    label: "Constraints",
    prompt: "What limits you right now?",
    placeholder: "Budget, time, tech, regulation, distribution, team gaps...",
  },
  {
    id: "goal90Days",
    label: "90-day goal",
    prompt: "What should be true in 90 days?",
    placeholder: "10 paying customers, MVP live, 30 interviews, $3k MRR...",
  },
];

export const freeBusinessAgentModels = [
  "kr/claude-sonnet-4.5",
  "kr/claude-haiku-4.5",
  "if/kimi-k2-thinking",
  "pol/gpt-5",
  "lc/longcat-flash-lite",
  "combo/free-stack",
  "combo/free-forever",
] as const;

const allowedFreePrefixes = ["kr/", "if/", "pol/", "lc/"] as const;

export function isFreeBusinessAgentModel(model: string): boolean {
  const normalized = model.trim();
  if (!normalized) return false;
  if ((freeBusinessAgentModels as readonly string[]).includes(normalized)) return true;
  if (normalized.startsWith("combo/free")) return true;
  if (normalized.includes(":free")) return true;
  return allowedFreePrefixes.some((prefix) => normalized.startsWith(prefix));
}

export const businessAgentRequestSchema = z.object({
  answers: z.partialRecord(z.enum(businessAgentQuestionIds), z.string().max(4000)).default({}),
  language: z.enum(["ru", "en"]).default("ru"),
  model: z.string().trim().min(1).max(160).default("kr/claude-sonnet-4.5"),
});

export type BusinessAgentRequest = z.infer<typeof businessAgentRequestSchema>;

export type BusinessAgentResponse = {
  success: true;
  mode: "ai" | "local-fallback";
  model: string;
  freeOnly: true;
  reportMarkdown: string;
  warnings: string[];
};
