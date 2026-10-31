"use client";

import { ArrowUp } from "lucide-react";
import { useId } from "react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Select } from "@/components/ui/field";
import {
  problemStatement, PROBLEM_STATEMENT_MAX_PICKS, PROBLEM_STATEMENT_PICKS, PROBLEM_STATEMENTS_BY_SECTOR, type ProblemStatement,
} from "@/lib/profile/problem-statements";
import { ProblemStatementPdfLink } from "./pdf-link";

const PRIORITY = ["1st priority", "2nd priority", "3rd priority", "4th priority", "5th priority"] as const;

/**
 * Five ranked dropdowns: three required, two optional to widen discovery.
 * Picks stay contiguous: a slot opens once the one
 * above it is filled, clearing a slot moves the later picks up, and a
 * statement chosen in one slot is unavailable in the others.
 */
export function ProblemStatementPicker({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const id = useId();

  function setSlot(i: number, statementId: string) {
    const next = [...value];
    if (statementId) next[i] = statementId;
    else next.splice(i, 1);
    onChange(next.filter(Boolean).slice(0, PROBLEM_STATEMENT_MAX_PICKS));
  }

  function moveUp(i: number) {
    const next = [...value];
    [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        {Array.from({ length: PROBLEM_STATEMENT_MAX_PICKS }, (_, i) => {
          const current = value[i] ?? "";
          const optional = i >= PROBLEM_STATEMENT_PICKS;
          const statement = current ? problemStatement(current) : undefined;
          const open = i <= value.length;
          const selectId = `${id}-slot-${i}`;
          return (
            <li key={i} className={cn("rounded-2xl border p-4", optional ? "border-dashed border-line-strong bg-white/40" : "border-line bg-white/70", !open && "opacity-60")}>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor={selectId} className="flex items-center gap-2.5 text-[0.95rem] font-medium text-ink">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                      optional ? "bg-sage-200 text-forest-900" : "bg-forest-800 text-ivory-50",
                    )}
                  >
                    {i + 1}
                  </span>
                  {PRIORITY[i]}
                  {optional ? <span className="text-sm font-normal text-ink-subtle">Optional</span> : null}
                </label>
                {i > 0 && current && !disabled ? (
                  <IconButton type="button" variant="ghost" size="sm" label={`Move to ${PRIORITY[i - 1]}`} onClick={() => moveUp(i)}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                ) : null}
              </div>
              <Select
                id={selectId}
                className="mt-3"
                value={current}
                disabled={disabled || !open}
                onChange={(e) => setSlot(i, e.target.value)}
                aria-invalid={(Boolean(error) && !current && !optional) || undefined}
              >
                <option value="">{open ? (optional ? "Add another (optional)" : "Choose a problem statement") : `Choose your ${PRIORITY[i - 1]} first`}</option>
                {PROBLEM_STATEMENTS_BY_SECTOR.map((g) => (
                  <optgroup key={g.sector} label={g.sector}>
                    {g.statements.map((s) => (
                      <option key={s.id} value={s.id} disabled={value.includes(s.id) && s.id !== current}>
                        {s.name} · {s.focus}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              {statement ? <StatementDetails statement={statement} className="mt-3" /> : null}
            </li>
          );
        })}
      </ol>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <AllStatements />
    </div>
  );
}

function StatementDetails({ statement: s, className }: { statement: ProblemStatement; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 text-sm", className)}>
      <p className="text-ink-muted">
        {[s.brief, s.sector, s.model, s.focus].filter(Boolean).join(" · ")}
      </p>
      {s.guidance ? (
        <p className="rounded-xl bg-sage-100/80 px-3 py-2 leading-relaxed text-forest-900">
          <span className="font-medium">The company is looking for: </span>
          {s.guidance}
        </p>
      ) : null}
      <ProblemStatementPdfLink statement={s} />
    </div>
  );
}

/** Every brief, so students can read before they rank. */
function AllStatements() {
  return (
    <details className="group rounded-2xl border border-line bg-white/50">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-forest-700 [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Browse all problem statements</span>
        <span className="hidden group-open:inline">Hide the list</span>
      </summary>
      <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
        {PROBLEM_STATEMENTS_BY_SECTOR.map((g) => (
          <section key={g.sector}>
            <h3 className="text-[0.75rem] font-semibold tracking-[0.08em] text-forest-700 uppercase">{g.sector}</h3>
            <ul className="mt-2 flex flex-col divide-y divide-line">
              {g.statements.map((s) => (
                <li key={s.id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0">
                    <p className="text-[0.95rem] font-medium text-ink">
                      {s.name}
                      {s.brief ? <span className="font-normal text-ink-muted"> · {s.brief}</span> : null}
                    </p>
                    <p className="text-sm text-ink-muted">{s.model} · {s.focus}</p>
                    {s.guidance ? <p className="mt-0.5 text-sm text-ink-subtle">{s.guidance}</p> : null}
                  </div>
                  <ProblemStatementPdfLink statement={s} className="shrink-0 text-sm" />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}
