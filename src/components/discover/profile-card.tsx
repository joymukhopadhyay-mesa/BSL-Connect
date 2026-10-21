import { Briefcase, Sparkles } from "lucide-react";
import { BandBadge } from "@/components/matching/compatibility-panel";
import { Tag } from "@/components/ui/chips";
import { cn } from "@/components/ui/cn";
import { ProfilePhoto } from "@/components/ui/misc";
import { careerObjectiveLabels } from "@/lib/profile/options";
import type { Candidate } from "./types";

/**
 * Full-bleed discovery card: one large photo, with the essentials on a
 * dark glass panel. Deliberately shows a curated subset — the full profile
 * is one tap away.
 */
export function ProfileCard({ candidate, className, priority }: { candidate: Candidate; className?: string; priority?: boolean }) {
  const c = candidate;
  const years = c.years_experience != null && c.years_experience > 0 ? `${c.years_experience} yrs` : null;
  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-[var(--radius-card)] bg-forest-900 shadow-lift", className)}>
      <ProfilePhoto src={c.photo_url} name={c.full_name} className="absolute inset-0 h-full w-full text-6xl" rounded="rounded-none" priority={priority} />
      {/* Readability: a quiet gradient under the panel, not a decorative one */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-forest-950/90 via-forest-950/45 to-transparent" aria-hidden />

      <div className="absolute top-4 left-4">
        <BandBadge compatibility={c.compatibility} tone="glass" />
      </div>

      <div className="absolute inset-x-3 bottom-3 rounded-[1.4rem] glass-dark p-4 text-white sm:inset-x-4 sm:bottom-4 sm:p-5">
        <h2 className="font-display text-[2rem] leading-none tracking-[-0.01em] text-balance sm:text-[2.3rem]">{c.full_name}</h2>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/80">
          <Briefcase className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{[c.role_title, years].filter(Boolean).join(" · ")}</span>
        </p>
        {c.intro ? <p className="mt-3 line-clamp-2 text-[0.92rem] leading-snug text-white/90 sm:line-clamp-3">{c.intro}</p> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {c.strengths.slice(0, 3).map((s, i) => (
            <Tag key={s} tone="glass" className={i === 2 ? "[@media(max-height:700px)]:hidden" : undefined}>
              {s}
            </Tag>
          ))}
        </div>
        {c.industries_interest.length ? (
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-snug text-white/75 [@media(max-height:700px)]:hidden">
            <Sparkles className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="line-clamp-1">Exploring {c.industries_interest.slice(0, 2).join(" · ")}</span>
          </p>
        ) : null}
        {c.career_objectives.length ? <p className="sr-only">Career objectives: {careerObjectiveLabels(c.career_objectives).join(", ")}</p> : null}
      </div>
    </div>
  );
}
