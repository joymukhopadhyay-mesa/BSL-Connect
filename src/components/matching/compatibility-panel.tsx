"use client";

import { Info, MessageCircleQuestion, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/chips";
import { cn } from "@/components/ui/cn";
import { Notice } from "@/components/ui/misc";
import type { PairResult } from "@/lib/ai/pair";
import type { PairInsights } from "@/lib/matching/insights";
import type { Band, CompatibilityResult } from "@/lib/matching/scoring";

export function BandBadge({ compatibility, tone = "light", className }: { compatibility: CompatibilityResult; tone?: "light" | "glass"; className?: string }) {
  const dot: Record<Band, string> = {
    strong: "bg-[#7fd1a4]",
    promising: "bg-sage-300",
    exploratory: "bg-[#e4cf9b]",
    insufficient: "bg-white/50",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold",
        tone === "glass" ? "glass-dark text-white" : "bg-sage-100 text-forest-800",
        className,
      )}
    >
      <span className={cn("size-2 rounded-full", dot[compatibility.band])} aria-hidden />
      {compatibility.bandLabel}
    </span>
  );
}

export function CompatibilityPanel({
  compatibility,
  insights,
  candidateId,
  candidateName,
  aiAvailable,
}: {
  compatibility: CompatibilityResult;
  insights: PairInsights;
  candidateId: string;
  candidateName: string;
  aiAvailable: boolean;
}) {
  const first = candidateName.split(" ")[0] || "They";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <BandBadge compatibility={compatibility} />
          {compatibility.score !== null ? (
            <span className="text-sm text-ink-muted">
              About <span className="font-semibold text-ink tabular-nums">{compatibility.score}</span> / 100 · indicative
            </span>
          ) : null}
        </div>
        <p className="mt-3 flex gap-2 text-sm leading-relaxed text-ink-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Calculated from the profile details you both submitted. It&apos;s a starting point for your own judgement — not a prediction, and a
          lower score never hides anyone.
        </p>
      </div>

      <ul className="flex flex-col gap-4" aria-label="Compatibility factors">
        {compatibility.factors.map((f) => (
          <li key={f.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{f.label}</span>
              <span className="text-xs text-ink-subtle">{Math.round(f.weight * 100)}% weight</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-forest-800/8" aria-hidden>
              {f.score !== null ? <div className="h-full rounded-full bg-forest-600" style={{ width: `${Math.max(6, f.score * 100)}%` }} /> : null}
            </div>
            {f.score === null ? (
              <p className="mt-1.5 text-sm text-ink-subtle">Not enough information to compare.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1">
                {f.evidence.map((e) => (
                  <li key={e} className="text-sm leading-snug text-ink-muted">
                    {e}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <TeamComposition insights={insights} first={first} showStyleDifferences={false} />

      <AIExplanation candidateId={candidateId} aiAvailable={aiAvailable} />
    </div>
  );
}

export function TeamComposition({
  insights,
  first,
  showStyleDifferences = true,
}: {
  insights: PairInsights;
  first: string;
  /** Off where the factor breakdown already lists style differences. */
  showStyleDifferences?: boolean;
}) {
  const rows: Array<{ label: string; items: string[]; tone: "forest" | "sage" | "neutral" | "amber" }> = [
    { label: `${first} brings what you asked for`, items: insights.complementaryForYou, tone: "forest" },
    { label: `You bring what ${first} asked for`, items: insights.complementaryForThem, tone: "forest" },
    { label: "Shared industry interests", items: insights.sharedInterests, tone: "sage" },
    { label: `${first} has worked in`, items: insights.theyHaveWorkedIn, tone: "sage" },
    { label: "Strengths you both have", items: insights.overlapping, tone: "neutral" },
    { label: "Neither of you lists", items: insights.combinedGaps, tone: "amber" },
  ].filter((r) => r.items.length) as Array<{ label: string; items: string[]; tone: "forest" | "sage" | "neutral" | "amber" }>;

  return (
    <section className="flex flex-col gap-4 rounded-2xl bg-ivory-200/50 p-4 sm:p-5">
      <div>
        <h3 className="text-sm font-semibold text-ink">Team composition</h3>
        <p className="text-xs text-ink-muted">Observations from your submitted profiles</p>
      </div>
      {rows.map((r) => (
        <div key={r.label}>
          <p className="mb-1.5 text-xs font-medium text-ink-subtle">{r.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {r.items.map((i) => (
              <Tag key={i} tone={r.tone}>
                {i}
              </Tag>
            ))}
          </div>
        </div>
      ))}
      {showStyleDifferences && insights.styleDifferences.length ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-ink-subtle">Working-style differences to agree on</p>
          <ul className="flex flex-col gap-1">
            {insights.styleDifferences.map((d) => (
              <li key={d.key} className="text-sm leading-snug text-ink">
                <span className="font-medium">{d.dimension}:</span> you — {d.you}; {first} — {d.they}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
          <MessageCircleQuestion className="size-3.5" aria-hidden /> Worth discussing before you confirm
        </p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {insights.discussionQuestions.map((q) => (
            <li key={q} className="text-sm leading-snug text-ink">
              {q}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function AIExplanation({ candidateId, aiAvailable }: { candidateId: string; aiAvailable: boolean }) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "done"; result: PairResult }>({ kind: "idle" });

  if (!aiAvailable) {
    return (
      <Notice tone="info" icon={<Sparkles className="size-4" />}>
        AI explanations are unavailable right now. The observations above come from your profiles and work without AI.
      </Notice>
    );
  }

  async function load() {
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/ai/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const json = (await res.json().catch(() => ({}))) as { result?: PairResult; error?: string };
      if (!res.ok || !json.result) {
        setState({ kind: "error", message: json.error ?? "AI explanations are unavailable right now." });
        return;
      }
      setState({ kind: "done", result: json.result });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the AI service. Check your connection and try again." });
    }
  }

  if (state.kind !== "done") {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button type="button" variant="sage" size="sm" loading={state.kind === "loading"} onClick={load} icon={<Sparkles className="size-4" />}>
          {state.kind === "loading" ? "Writing explanation…" : "Explain this fit with AI"}
        </Button>
        {state.kind === "error" ? (
          <p className="text-sm text-danger" role="alert">
            {state.message}
          </p>
        ) : (
          <p className="text-xs text-ink-subtle">Uses your profiles&apos; free-text answers. No names or emails are sent.</p>
        )}
      </div>
    );
  }

  const r = state.result;
  const lists: Array<[string, string[]]> = [
    ["Complementary strengths", r.complementary_strengths],
    ["Shared ground", r.shared_ground],
    ["Differences worth discussing", r.potential_differences],
    ["Questions to discuss", r.discussion_questions],
  ];
  return (
    <section className="animate-rise rounded-2xl border border-sage-300 bg-sage-100/60 p-4 sm:p-5" aria-label="AI-generated explanation">
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-forest-700 uppercase">
        <Sparkles className="size-3.5" aria-hidden /> AI-generated suggestion
      </p>
      <h3 className="mt-2 text-[1.05rem] font-semibold leading-snug text-ink">{r.headline}</h3>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{r.summary}</p>
      {lists
        .filter(([, items]) => items.length)
        .map(([label, items]) => (
          <div key={label} className="mt-4">
            <p className="text-xs font-medium text-ink-subtle">{label}</p>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
              {items.map((i) => (
                <li key={i} className="text-sm leading-snug text-ink">
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      <p className="mt-4 text-xs text-ink-muted">AI can be wrong. Treat this as a prompt for conversation, not a verdict.</p>
    </section>
  );
}
