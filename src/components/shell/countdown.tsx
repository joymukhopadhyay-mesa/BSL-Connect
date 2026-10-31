"use client";

import { useEffect, useState } from "react";
import { PROBLEM_STATEMENT_DEADLINE } from "@/lib/profile/problem-statements";

/** e.g. "1d 4h 05m" or "9h 12m 05s". */
export function formatTimeLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return d > 0 ? `${d}d ${h}h ${pad(m)}m` : `${h}h ${pad(m)}m ${pad(s % 60)}s`;
}

/**
 * Milliseconds until the problem statement deadline, ticking every second.
 * null until mounted, so server and client render the same markup.
 */
export function useTimeLeft(target: Date = PROBLEM_STATEMENT_DEADLINE): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setLeft(target.getTime() - Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  return left;
}

/** Inline "9h 12m 05s left" text; renders nothing before mount. */
export function DeadlineCountdown({ className }: { className?: string }) {
  const left = useTimeLeft();
  if (left === null) return null;
  return <span className={className}>{left > 0 ? `${formatTimeLeft(left)} left` : "Selections have closed"}</span>;
}
