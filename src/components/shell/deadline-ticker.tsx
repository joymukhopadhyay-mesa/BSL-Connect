"use client";

import { CalendarClock } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { PROBLEM_STATEMENT_DEADLINE_LABEL } from "@/lib/profile/problem-statements";
import { formatTimeLeft, useTimeLeft } from "./countdown";

const REPEAT = 4;

/**
 * Scrolling reminder of the problem statement deadline, with a live
 * countdown. Render it only while selections are open. It sets
 * --ticker-height so fixed chrome (toasts, the discovery deck, page padding)
 * can make room for it. Reduced-motion users get a static strip (see
 * globals.css).
 */
export function DeadlineTicker({ className }: { className?: string }) {
  const left = useTimeLeft();
  const countdown = left === null ? null : left > 0 ? `${formatTimeLeft(left)} left` : "Selections closed";
  const message = `Deadline ${PROBLEM_STATEMENT_DEADLINE_LABEL}: rank 3 problem statements, plus 2 optional, then fill the final form`;
  const group = (
    <ul className="flex shrink-0 items-center">
      {Array.from({ length: REPEAT }, (_, i) => (
        <li key={i} className="flex items-center gap-2 px-6 whitespace-nowrap">
          <CalendarClock className="size-3.5 text-sage-300" aria-hidden />
          <span className="font-semibold text-sage-200">Deadline {PROBLEM_STATEMENT_DEADLINE_LABEL}</span>
          {countdown ? <span className="rounded-full bg-ivory-50/12 px-2 py-0.5 font-semibold text-ivory-50 tabular-nums">{countdown}</span> : null}
          <span className="text-ivory-50/85">Rank 3 problem statements, plus 2 optional · then fill the final form</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className={cn("flex h-[var(--ticker-height)] items-center overflow-hidden bg-forest-800 text-[0.8rem]", className)}>
      <style>{":root{--ticker-height:2.25rem}"}</style>
      <p className="sr-only">{message}</p>
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]" aria-hidden>
        {group}
        {group}
      </div>
    </div>
  );
}
