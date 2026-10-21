"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chips";
import { Sheet } from "@/components/ui/sheet";
import { careerObjectiveLabel, optionLabel } from "@/lib/profile/options";
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
}: {
  open: boolean;
  onClose: () => void;
  candidates: Candidate[];
  value: Filters;
  onChange: (f: Filters) => void;
}) {
  const options = useMemo(
    () => ({
      interest: uniqueSorted(candidates.flatMap((c) => c.industries_interest)),
      experience: uniqueSorted(candidates.flatMap((c) => c.industries_experience)),
      skills: uniqueSorted(candidates.flatMap((c) => c.strengths)),
      objective: uniqueSorted(candidates.flatMap((c) => c.career_objectives)),
      workingStyle: uniqueSorted(
        candidates.map((c) => (typeof c.questionnaire?.answers?.working_style === "string" ? c.questionnaire.answers.working_style : "")).filter(Boolean),
      ),
    }),
    [candidates],
  );
  const resultCount = candidates.filter((c) => matchesFilters(c, value)).length;

  const groups: Array<{ key: keyof Filters; title: string; label: (v: string) => string }> = [
    { key: "interest", title: "Wants to explore", label: (v) => v },
    { key: "experience", title: "Has worked in", label: (v) => v },
    { key: "skills", title: "Strengths", label: (v) => v },
    { key: "objective", title: "Career objective", label: careerObjectiveLabel },
    { key: "workingStyle", title: "Approach to new problems", label: (v) => optionLabel("working_style", v) },
  ];

  function toggle(key: keyof Filters, v: string) {
    const current = value[key];
    onChange({ ...value, [key]: current.includes(v) ? current.filter((x) => x !== v) : [...current, v] });
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
              <legend className="mb-3 text-sm font-semibold text-ink">{g.title}</legend>
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
