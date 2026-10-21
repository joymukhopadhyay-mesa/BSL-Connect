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
 * Multi-select picker: suggested options plus free-text entries of the
 * student's own. Suggestions are a starting point, not a closed list.
 *
 * Typed text becomes a selection: it is added on Enter, on the add button,
 * and automatically when the field loses focus (for example when the student
 * taps Continue). While being typed it is previewed as a pending selected chip.
 * Values are stored as-is; `labelFor` only changes how a value is displayed.
 */
export function TagPicker({
  value,
  onChange,
  suggestions,
  max,
  allowCustom = true,
  customPlaceholder = "Add your own",
  ariaLabel,
  labelFor,
  maxLength = 48,
  commaSeparates = true,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: readonly string[];
  max: number;
  allowCustom?: boolean;
  customPlaceholder?: string;
  ariaLabel: string;
  /** Display label for a stored value (e.g. preset key → name). */
  labelFor?: (value: string) => string;
  maxLength?: number;
  /** When false, commas are part of the text (needed for free-text sentences). */
  commaSeparates?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const label = labelFor ?? ((v: string) => v);
  const lower = new Set(value.map((v) => v.toLowerCase()));
  const atMax = value.length >= max;
  const customs = value.filter((v) => !suggestions.some((s) => s.toLowerCase() === v.toLowerCase()));
  const pending = draft.replace(/\s+/g, " ").trim().slice(0, maxLength);
  // Typing the name of a preset means that preset (never a duplicate entry).
  const resolved =
    suggestions.find((s) => s.toLowerCase() === pending.toLowerCase() || label(s).toLowerCase() === pending.toLowerCase()) ?? pending;
  const pendingIsNew = Boolean(resolved) && !lower.has(resolved.toLowerCase()) && !atMax;

  function toggle(tag: string) {
    if (lower.has(tag.toLowerCase())) onChange(value.filter((v) => v.toLowerCase() !== tag.toLowerCase()));
    else if (!atMax) onChange([...value, tag]);
  }

  function commit() {
    if (pendingIsNew) onChange([...value, resolved]);
    setDraft("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || (commaSeparates && e.key === ",")) {
      e.preventDefault();
      commit();
    }
  }

  return (
    <div className="flex flex-col gap-3" role="group" aria-label={ariaLabel}>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <Chip key={s} selected={lower.has(s.toLowerCase())} onToggle={() => toggle(s)} disabled={atMax && !lower.has(s.toLowerCase())}>
            {label(s)}
          </Chip>
        ))}
        {customs.map((c) => (
          <Chip key={c} selected onToggle={() => toggle(c)}>
            {label(c)}
            <X className="size-3.5" aria-hidden />
            <span className="sr-only">Remove</span>
          </Chip>
        ))}
        {pendingIsNew ? (
          <span
            className="inline-flex min-h-10 max-w-full items-center rounded-full border border-forest-800 bg-forest-800 px-4 text-sm font-medium text-ivory-50 opacity-80"
            data-testid="pending-selection"
          >
            <span className="truncate">{label(resolved)}</span>
            <span className="sr-only"> (will be added)</span>
          </span>
        ) : null}
      </div>
      {allowCustom ? (
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            maxLength={maxLength}
            disabled={atMax && !draft}
            placeholder={atMax ? `Maximum of ${max} reached` : customPlaceholder}
            aria-label={`${ariaLabel}: add your own`}
            className="h-10 min-w-0 flex-1 rounded-full border border-dashed border-line-strong bg-transparent px-4 text-sm outline-none placeholder:text-ink-subtle focus:border-forest-600"
          />
          <button
            type="button"
            // Keep focus in the field so blur doesn't commit twice.
            onMouseDown={(e) => e.preventDefault()}
            onClick={commit}
            disabled={!pendingIsNew}
            className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-forest-800 transition hover:bg-white disabled:opacity-40"
            aria-label="Add"
          >
            <Plus className="size-4" />
          </button>
        </div>
      ) : null}
      <p className="text-xs text-ink-subtle">
        {value.length} of {max} selected
        {allowCustom ? " · type your own and press Enter" : ""}
      </p>
    </div>
  );
}
