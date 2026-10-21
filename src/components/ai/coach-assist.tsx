"use client";

import { Check, Plus, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { CoachField, CoachResult } from "@/lib/ai/coach";

type Context = {
  role_title?: string | null;
  strengths?: string[];
  development_areas?: string[];
  career_objective?: string | null;
};

/**
 * "Improve with AI" for a single profile field. The suggestion is shown
 * for review; nothing changes until the student explicitly accepts it.
 */
export function CoachAssist({
  field,
  text,
  context,
  aiAvailable,
  onAccept,
  onAddTag,
}: {
  field: CoachField;
  text: string;
  context: Context;
  aiAvailable: boolean;
  onAccept: (text: string) => void;
  onAddTag?: (tag: string) => void;
}) {
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "result"; result: CoachResult }
  >({ kind: "idle" });
  const [addedTags, setAddedTags] = useState<string[]>([]);

  if (!aiAvailable) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
        <Sparkles className="size-3.5" aria-hidden /> AI writing suggestions are unavailable right now.
      </p>
    );
  }

  const tooShort = text.trim().length < 12;

  async function run() {
    setState({ kind: "loading" });
    setAddedTags([]);
    try {
      const res = await fetch("/api/ai/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ field, text, context }),
      });
      const json = (await res.json().catch(() => ({}))) as { result?: CoachResult; error?: string };
      if (!res.ok || !json.result) {
        setState({ kind: "error", message: json.error ?? "AI suggestions are unavailable right now." });
        return;
      }
      setState({ kind: "result", result: json.result });
    } catch {
      setState({ kind: "error", message: "Couldn't reach the AI service. Check your connection and try again." });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {state.kind !== "result" ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={tooShort || state.kind === "loading"}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-forest-800/15 bg-sage-100/80 px-4 text-sm font-medium text-forest-800 transition hover:bg-sage-200 disabled:opacity-50"
          >
            {state.kind === "loading" ? <Spinner className="size-4" /> : <Sparkles className="size-4" aria-hidden />}
            {state.kind === "loading" ? "Thinking…" : "Improve with AI"}
          </button>
          {tooShort ? <span className="text-xs text-ink-subtle">Write a sentence or two first.</span> : null}
          {state.kind === "error" ? (
            <span className="text-sm text-danger" role="alert">
              {state.message}
            </span>
          ) : null}
        </div>
      ) : (
        <div className="animate-rise rounded-2xl border border-sage-300 bg-sage-100/70 p-4" role="region" aria-label="AI suggestion">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-forest-700 uppercase">
              <Sparkles className="size-3.5" aria-hidden /> AI suggestion
            </p>
            <span className="text-xs text-ink-muted">Review before using · based only on what you wrote</span>
          </div>
          <p className="whitespace-pre-line text-[0.97rem] leading-relaxed text-ink">{state.result.suggestion}</p>
          {state.result.rationale ? <p className="mt-2 text-sm text-ink-muted">{state.result.rationale}</p> : null}

          {state.result.needs_more_detail || state.result.missing_information.length ? (
            <div className="mt-3 rounded-xl bg-white/70 p-3">
              <p className="text-sm font-medium text-ink">To make this stronger, consider adding:</p>
              <ul className="mt-1 list-disc pl-5 text-sm leading-relaxed text-ink-muted">
                {state.result.missing_information.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {onAddTag && state.result.suggested_tags.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-muted">Suggested tags:</span>
              {state.result.suggested_tags.map((t) => {
                const added = addedTags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={added}
                    onClick={() => {
                      onAddTag(t);
                      setAddedTags((a) => [...a, t]);
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-forest-800/20 bg-white px-3 text-xs font-medium text-forest-800 disabled:opacity-60"
                  >
                    {added ? <Check className="size-3" /> : <Plus className="size-3" />} {t}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onAccept(state.result.suggestion);
                setState({ kind: "idle" });
              }}
              icon={<Check className="size-4" />}
            >
              Use this version
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setState({ kind: "idle" })} icon={<X className="size-4" />}>
              Keep mine
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
