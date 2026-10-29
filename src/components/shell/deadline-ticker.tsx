import { CalendarClock } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { PROBLEM_STATEMENT_DEADLINE_LABEL } from "@/lib/profile/problem-statements";

const REPEAT = 6;

/**
 * Scrolling reminder of the problem statement deadline. Render it only while
 * selections are open. It sets --ticker-height so fixed chrome (toasts,
 * the discovery deck, page padding) can make room for it. Reduced-motion
 * users get a static strip (see globals.css).
 */
export function DeadlineTicker({ className }: { className?: string }) {
  const message = `Deadline ${PROBLEM_STATEMENT_DEADLINE_LABEL}: rank your top 3 problem statements`;
  const group = (
    <ul className="flex shrink-0 items-center">
      {Array.from({ length: REPEAT }, (_, i) => (
        <li key={i} className="flex items-center gap-2 px-6 whitespace-nowrap">
          <CalendarClock className="size-3.5 text-sage-300" aria-hidden />
          <span className="font-semibold text-sage-200">Deadline {PROBLEM_STATEMENT_DEADLINE_LABEL}</span>
          <span className="text-ivory-50/85">Rank your top 3 problem statements</span>
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
