"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chips";
import { Sheet } from "@/components/ui/sheet";
import { careerObjectiveLabel, optionLabel } from "@/lib/profile/options";
import { PROBLEM_STATEMENTS, problemStatementName } from "@/lib/profile/problem-statements";
import { activeFilterCount, EMPTY_FILTERS, matchesFilters, type Candidate, type Filters } from "./types";

function uniqueSorted(values: string[]): string[] {
  const m = new Map<string, string>();
  for (const v of values) if (v && !m.has(v.toLowerCase())) m.set(v.toLowerCase(), v);
  return Array.from(m.values()).sort((a, b) => a.localeCompare(b));
}

/** Only offers filter values that actually occur in the current candidates. */
export function FiltersSheet({
  open,
  onClose,
  candidates,
  value,
  onChange,
  myStatements = [],
}: {
  open: boolean;
  onClose: () => void;
  candidates: Candidate[];
  value: Filters;
  onChange: (f: Filters) => void;
  /** The viewer's own ranked picks, offered as a one-tap filter. */
  myStatements?: string[];
}) {
  const options = useMemo(
    () => ({
      interest: uniqueSorted(candidates.flatMap((c) => c.industries_interest)),
      experience: uniqueSorted(candidates.flatMap((c) => c.industries_experience)),
      skills: uniqueSorted(candidates.flatMap((c) => c.strengths)),
      objective: uniqueSorted(candidates.flatMap((c) => c.career_objectives)),
      statement: PROBLEM_STATEMENTS.map((s) => s.id).filter((id) => candidates.some((c) => c.problem_statements.includes(id))),
      statementRank: value.statement.length ? ["1", "2", "3"] : [],
      workingStyle: uniqueSorted(
        candidates.map((c) => (typeof c.questionnaire?.answers?.working_style === "string" ? c.questionnaire.answers.working_style : "")).filter(Boolean),
      ),
    }),
    [candidates, value.statement.length],
  );
  const resultCount = candidates.filter((c) => matchesFilters(c, value)).length;

  const groups: Array<{ key: keyof Filters; title: string; label: (v: string) => string; description?: string }> = [
    { key: "statement", title: "Problem statement", label: (v) => (myStatements.includes(v) ? `${problemStatementName(v)} (your #${myStatements.indexOf(v) + 1})` : problemStatementName(v)) },
    { key: "statementRank", title: "Their priority for it", label: (v) => ["1st choice", "2nd choice", "3rd choice"][Number(v) - 1]!, description: "Any priority if none selected." },
    { key: "interest", title: "Wants to explore", label: (v) => v },
    { key: "experience", title: "Has worked in", label: (v) => v },
    { key: "skills", title: "Strengths", label: (v) => v },
    { key: "objective", title: "Career objective", label: careerObjectiveLabel },
    { key: "workingStyle", title: "Approach to new problems", label: (v) => optionLabel("working_style", v) },
  ];

  function toggle(key: keyof Filters, v: string) {
    const current = value[key];
    const next = { ...value, [key]: current.includes(v) ? current.filter((x) => x !== v) : [...current, v] };
    if (!next.statement.length) next.statementRank = [];
    onChange(next);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filter profiles"
      description="Optional. Narrow your list by what matters to you right now."
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)} disabled={activeFilterCount(value) === 0}>
            Reset filters
          </Button>
          <Button onClick={onClose}>Show {resultCount} {resultCount === 1 ? "profile" : "profiles"}</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-7">
        {groups
          .filter((g) => options[g.key].length > 0)
          .map((g) => (
            <fieldset key={g.key}>
              <legend className="mb-3 text-sm font-semibold text-ink">
                {g.title}
                {g.description ? <span className="ml-2 font-normal text-ink-subtle">{g.description}</span> : null}
              </legend>
              {g.key === "statement" && myStatements.some((id) => options.statement.includes(id)) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mb-3"
                  onClick={() => onChange({ ...value, statement: myStatements.filter((id) => options.statement.includes(id)) })}
                >
                  Same as my choices
                </Button>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {options[g.key].map((v) => (
                  <Chip key={v} selected={value[g.key].includes(v)} onToggle={() => toggle(g.key, v)}>
                    {g.label(v)}
                  </Chip>
                ))}
              </div>
            </fieldset>
          ))}
      </div>
    </Sheet>
  );
}
