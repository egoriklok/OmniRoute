"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { Badge, Button, Card, SegmentedControl } from "@/shared/components";
import {
  businessAgentQuestions,
  freeBusinessAgentModels,
  type BusinessAgentQuestionId,
  type BusinessAgentResponse,
} from "@/lib/businessAgent";

type Answers = Partial<Record<BusinessAgentQuestionId, string>>;

const DRAFT_KEY = "omniroute-business-agent-draft-v1";

function emptyAnswers(): Answers {
  return Object.fromEntries(businessAgentQuestions.map((question) => [question.id, ""])) as Answers;
}

export default function BusinessAgentPageClient() {
  const [answers, setAnswers] = useState<Answers>(() => emptyAnswers());
  const [language, setLanguage] = useState<"ru" | "en">("ru");
  const [model, setModel] =
    useState<(typeof freeBusinessAgentModels)[number]>("kr/claude-sonnet-4.5");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BusinessAgentResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        setAnswers({ ...emptyAnswers(), ...(parsed.answers || {}) });
        if (parsed.language === "ru" || parsed.language === "en") setLanguage(parsed.language);
        if (typeof parsed.model === "string") setModel(parsed.model);
      }
    } catch {
      // Ignore invalid drafts.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ answers, language, model }));
  }, [answers, language, model]);

  const completed = useMemo(
    () => businessAgentQuestions.filter((question) => answers[question.id]?.trim()).length,
    [answers]
  );
  const requiredMissing = useMemo(
    () =>
      businessAgentQuestions.filter(
        (question) => question.required && !answers[question.id]?.trim()
      ),
    [answers]
  );

  const updateAnswer = (id: BusinessAgentQuestionId, value: string) => {
    setAnswers((current) => ({ ...current, [id]: value }));
  };

  const reset = () => {
    setAnswers(emptyAnswers());
    setResult(null);
    setError("");
  };

  const downloadFilledFile = () => {
    if (!result?.filledFile) return;
    const blob = new Blob([result.filledFile.content], { type: result.filledFile.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filledFile.filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/business-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, language, model }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data?.error?.message || data?.error || "Business Agent failed");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Business Agent failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="success" dot>
              Free-only
            </Badge>
            <Badge variant="info">Kiro-ready</Badge>
            <Badge variant="primary">Market opportunity</Badge>
            <Badge variant="default">Telegram voice blueprint</Badge>
          </div>
          <h1 className="text-2xl font-bold text-text-main">Business Agent</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            A free startup consultation workflow that turns founder answers into a practical
            business diagnosis, filled Project Vault-style strategy file, CJM, roadmap, content
            plan, market opportunity analysis, and 90-day action plan. It prefers free OmniRoute
            models and falls back to a local report if a provider is not connected.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/providers"
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-medium text-text-main transition-colors hover:bg-black/5 dark:bg-white/10 dark:hover:bg-white/5"
          >
            <span className="material-symbols-outlined text-[18px]">dns</span>
            Connect Kiro
          </Link>
          <Button variant="secondary" icon="refresh" onClick={reset}>
            Reset
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <Card className="min-w-0">
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-main">Founder interview</h2>
              <p className="text-sm text-text-muted">
                Completed {completed}/{businessAgentQuestions.length}. Required missing:{" "}
                {requiredMissing.length}.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl
                aria-label="Report language"
                size="sm"
                value={language}
                onChange={(value) => setLanguage(value === "en" ? "en" : "ru")}
                options={[
                  { value: "ru", label: "RU", icon: "translate" },
                  { value: "en", label: "EN", icon: "language" },
                ]}
              />
              <select
                value={model}
                onChange={(event) =>
                  setModel(event.target.value as (typeof freeBusinessAgentModels)[number])
                }
                className="h-8 rounded-lg border border-border bg-bg px-3 text-xs text-text-main"
                aria-label="Free model"
              >
                {freeBusinessAgentModels.map((freeModel) => (
                  <option key={freeModel} value={freeModel}>
                    {freeModel}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {businessAgentQuestions.map((question) => (
              <label key={question.id} className="flex min-w-0 flex-col gap-1.5">
                <span className="text-sm font-medium text-text-main">
                  {question.label}
                  {question.required && (
                    <span className="ml-1 text-red-500" aria-hidden="true">
                      *
                    </span>
                  )}
                </span>
                <span className="text-xs leading-5 text-text-muted">{question.prompt}</span>
                <textarea
                  value={answers[question.id] || ""}
                  onChange={(event) => updateAnswer(question.id, event.target.value)}
                  placeholder={question.placeholder}
                  rows={4}
                  className="min-h-[104px] w-full resize-y rounded-lg border border-black/10 bg-white px-3 py-2 text-sm leading-5 text-text-main shadow-inner outline-none transition-all placeholder:text-text-muted/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/30 dark:border-white/10 dark:bg-white/5"
                />
              </label>
            ))}
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-text-muted">
              The route rejects paid model ids. Kiro can be connected from Providers without adding
              a paid API key.
            </p>
            <Button
              icon="psychology_alt"
              onClick={submit}
              loading={loading}
              disabled={requiredMissing.length > 0}
            >
              Generate consultation
            </Button>
          </div>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-main">Consultation output</h2>
                <p className="mt-1 text-sm text-text-muted">
                  The report uses a YC-style pressure test, GStack-style role review, bottom-up
                  market sizing, and a downloadable filled strategy file.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {result?.filledFile && (
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="download"
                    onClick={downloadFilledFile}
                  >
                    Strategy file
                  </Button>
                )}
                {result && (
                  <Badge variant={result.mode === "ai" ? "success" : "warning"}>
                    {result.mode === "ai" ? "AI" : "Local fallback"}
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {result?.warnings?.length ? (
            <Card className="border-yellow-500/20 bg-yellow-500/5">
              <div className="flex gap-3 text-sm text-yellow-700 dark:text-yellow-300">
                <span className="material-symbols-outlined text-[18px]">warning</span>
                <div className="flex flex-col gap-1">
                  {result.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              </div>
            </Card>
          ) : null}

          <Card className="min-h-[560px] overflow-hidden">
            {result ? (
              <article className="max-w-none text-sm leading-6 text-text-main">
                <ReactMarkdown>{result.reportMarkdown}</ReactMarkdown>
              </article>
            ) : (
              <div className="flex min-h-[520px] flex-col items-center justify-center gap-3 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-[28px]">insights</span>
                </div>
                <div>
                  <p className="font-semibold text-text-main">No report yet</p>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-text-muted">
                    Fill the required fields and generate a free consultation. The local fallback
                    still works when Kiro is not connected.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
