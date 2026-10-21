"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "./cn";

const control =
  "w-full rounded-2xl border border-line-strong bg-white/90 px-4 text-[1rem] text-ink placeholder:text-ink-subtle " +
  "transition-[border-color,box-shadow] duration-200 outline-none " +
  "focus:border-forest-600 focus:ring-4 focus:ring-forest-600/12 aria-invalid:border-danger aria-invalid:ring-danger/10";

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  counter?: { value: number; max: number };
};

export function Field({ label, hint, error, optional, className, children, counter }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[0.95rem] font-medium text-ink">
          {label}
          {optional ? <span className="ml-2 text-sm font-normal text-ink-subtle">Optional</span> : null}
        </label>
        {counter ? (
          <span
            className={cn("text-xs tabular-nums", counter.value > counter.max ? "text-danger" : "text-ink-subtle")}
            aria-live="polite"
          >
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="-mt-1 text-sm leading-relaxed text-ink-muted">
          {hint}
        </p>
      ) : null}
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-12", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(control, "min-h-28 resize-y py-3 leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-12 appearance-none bg-[length:1rem] pr-10", className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer gap-3 rounded-2xl border border-line bg-white/70 p-4 transition-colors hover:border-line-strong has-[:checked]:border-forest-700/40 has-[:checked]:bg-sage-100/70",
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-md accent-forest-800"
        {...props}
      />
      <span className="flex flex-col gap-1">
        <span className="text-[0.95rem] font-medium leading-snug text-ink">{label}</span>
        {description ? <span className="text-sm leading-relaxed text-ink-muted">{description}</span> : null}
      </span>
    </label>
  );
}
