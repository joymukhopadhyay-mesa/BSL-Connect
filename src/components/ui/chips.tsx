"use client";

import { Plus, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { cn } from "./cn";

export function Tag({ children, tone = "neutral", className }: {
  children: React.ReactNode;
  tone?: "neutral" | "sage" | "forest" | "outline" | "glass" | "amber" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ivory-200/80 text-ink",
    sage: "bg-sage-100 text-forest-800",
    forest: "bg-forest-800 text-ivory-50",
    outline: "border border-line-strong text-ink-muted",
    glass: "bg-white/18 text-white border border-white/20",
    amber: "bg-amber-soft text-amber",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full px-3 py-1 text-[0.8rem] font-medium leading-5", tones[tone], className)}>
      {children}
    </span>
  );
}

/** Toggleable chip used in pickers and filters. */
export function Chip({ selected, onToggle, children, disabled }: {
  selected: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-all duration-200 active:scale-[0.97]",
        selected
          ? "border-forest-800 bg-forest-800 text-ivory-50 shadow-soft"
          : "border-line-strong bg-white/80 text-ink hover:border-forest-800/40",
        disabled && !selected && "opacity-40",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Multi-select tag picker: suggested tags plus free-form custom tags.
 * Suggestions are a starting point, not a closed list.
 */
export function TagPicker({
  value,
  onChange,
  suggestions,
  max,
  allowCustom = true,
  customPlaceholder = "Add your own",
  ariaLabel,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: readonly string[];
  max: number;
  allowCustom?: boolean;
  customPlaceholder?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const lower = new Set(value.map((v) => v.toLowerCase()));
  const atMax = value.length >= max;
  const customs = value.filter((v) => !suggestions.some((s) => s.toLowerCase() === v.toLowerCase()));

  function toggle(tag: string) {
    if (lower.has(tag.toLowerCase())) onChange(value.filter((v) => v.toLowerCase() !== tag.toLowerCase()));
    else if (!atMax) onChange([...value, tag]);
  }

  function addCustom() {
    const t = draft.replace(/\s+/g, " ").trim().slice(0, 48);
    if (!t || lower.has(t.toLowerCase()) || atMax) return;
    onChange([...value, t]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCustom();
    }
  }

  return (
    <div className="flex flex-col gap-3" role="group" aria-label={ariaLabel}>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Chip key={s} selected={lower.has(s.toLowerCase())} onToggle={() => toggle(s)} disabled={atMax && !lower.has(s.toLowerCase())}>
            {s}
          </Chip>
        ))}
        {customs.map((c) => (
          <Chip key={c} selected onToggle={() => toggle(c)}>
            {c}
            <X className="size-3.5" aria-hidden />
            <span className="sr-only">Remove</span>
          </Chip>
        ))}
      </div>
      {allowCustom ? (
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={48}
            disabled={atMax}
            placeholder={atMax ? `Maximum of ${max} reached` : customPlaceholder}
            aria-label={`${ariaLabel}: add your own`}
            className="h-10 min-w-0 flex-1 rounded-full border border-dashed border-line-strong bg-transparent px-4 text-sm outline-none placeholder:text-ink-subtle focus:border-forest-600"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!draft.trim() || atMax}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-forest-800 transition hover:bg-white disabled:opacity-40"
            aria-label="Add tag"
          >
            <Plus className="size-4" />
          </button>
        </div>
      ) : null}
      <p className="text-xs text-ink-subtle">
        {value.length} of {max} selected
      </p>
    </div>
  );
}
