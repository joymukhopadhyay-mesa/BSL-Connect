"use client";

import { Check } from "lucide-react";
import { useId } from "react";
import { cn } from "./cn";

type Option = { value: string; label: string; hint?: string };

/** Card-style radio or checkbox group with full keyboard support (native inputs). */
export function ChoiceGroup({
  legend,
  description,
  options,
  type,
  value,
  onChange,
  maxSelections,
}: {
  legend: string;
  description?: string;
  options: Option[];
  type: "single" | "multi";
  value: string | string[] | undefined;
  onChange: (v: string | string[]) => void;
  maxSelections?: number;
}) {
  const name = useId();
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  const atMax = type === "multi" && maxSelections !== undefined && selected.size >= maxSelections;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-[1.05rem] font-semibold leading-snug tracking-[-0.01em] text-ink text-balance">
        {legend}
      </legend>
      {description ? <p className="-mt-1 text-sm text-ink-muted">{description}</p> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => {
          const checked = selected.has(o.value);
          const disabled = !checked && atMax;
          return (
            <label
              key={o.value}
              className={cn(
                "group relative flex cursor-pointer items-start gap-3 rounded-2xl border bg-white/80 p-4 transition-all duration-200",
                checked ? "border-forest-800 bg-sage-100/60 shadow-soft" : "border-line hover:border-line-strong",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type={type === "single" ? "radio" : "checkbox"}
                name={name}
                value={o.value}
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  if (type === "single") onChange(o.value);
                  else {
                    const next = new Set(selected);
                    if (next.has(o.value)) next.delete(o.value);
                    else next.add(o.value);
                    onChange(options.map((x) => x.value).filter((v) => next.has(v)));
                  }
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-forest-600 peer-focus-visible:ring-offset-2",
                  type === "single" ? "rounded-full" : "rounded-md",
                  checked ? "border-forest-800 bg-forest-800 text-ivory-50" : "border-line-strong bg-white",
                )}
              >
                {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[0.95rem] font-medium leading-snug text-ink">{o.label}</span>
                {o.hint ? <span className="text-sm leading-snug text-ink-muted">{o.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
