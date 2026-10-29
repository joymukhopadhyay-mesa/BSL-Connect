import { Briefcase, Compass, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { ProblemStatementPdfLink } from "@/components/problem-statements/pdf-link";
import { Tag } from "@/components/ui/chips";
import { ProfilePhoto } from "@/components/ui/misc";
import { careerObjectiveLabels, optionLabel, QUESTIONS } from "@/lib/profile/options";
import { problemStatement } from "@/lib/profile/problem-statements";
import type { Profile } from "@/lib/profile/types";

/**
 * The complete profile as other verified students see it. Presentational
 * only (no hooks), so it renders on the server and inside client sheets.
 * Text is rendered as React text nodes — never as HTML.
 */
export function ProfileDetail({
  profile,
  photoUrl,
  showPhoto = true,
  editHref,
}: {
  profile: Profile;
  photoUrl?: string | null;
  showPhoto?: boolean;
  /** When provided, each section shows an edit link to that onboarding step. */
  editHref?: (step: number) => string;
}) {
  const p = profile;
  const answers = p.questionnaire?.answers ?? {};
  const notes = p.questionnaire?.notes ?? {};

  return (
    <article className="flex flex-col gap-8">
      <header className="flex items-center gap-4">
        {showPhoto ? (
          <ProfilePhoto src={photoUrl} name={p.full_name} className="size-20 shrink-0 text-xl sm:size-24" rounded="rounded-[1.4rem]" />
        ) : null}
        <div className="min-w-0">
          <h2 className="font-display text-[2rem] leading-[1.05] text-forest-900">{p.full_name || "Unnamed student"}</h2>
          <p className="mt-1 text-[0.95rem] text-ink-muted">
            {[p.role_title, p.years_experience != null ? `${formatYears(p.years_experience)} experience` : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {p.cohort ? <p className="mt-0.5 text-sm text-ink-subtle">{p.cohort}</p> : null}
        </div>
      </header>

      <Section title="Introduction" step={1} editHref={editHref}>
        <Prose>{p.intro}</Prose>
        {p.background ? (
          <Labelled label="Background">
            <Prose>{p.background}</Prose>
          </Labelled>
        ) : null}
        {p.career_objectives.length ? (
          <Labelled label={p.career_objectives.length > 1 ? "Career objectives" : "Career objective"} icon={<Compass className="size-3.5" aria-hidden />}>
            <Tags items={careerObjectiveLabels(p.career_objectives)} tone="sage" />
          </Labelled>
        ) : null}
      </Section>

      <Section title="Problem statements" step={7} editHref={editHref} description="Ranked by preference, 1 being the top choice.">
        {p.problem_statements.length ? (
          <ol className="flex flex-col gap-3">
            {p.problem_statements.map((id, i) => {
              const s = problemStatement(id);
              if (!s) return null;
              return (
                <li key={id} className="flex gap-3 rounded-2xl border border-line bg-white/60 p-3.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest-800 text-xs font-semibold text-ivory-50 tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-[0.98rem] font-medium leading-snug text-ink">
                      {s.name}
                      {s.brief ? <span className="font-normal text-ink-muted"> · {s.brief}</span> : null}
                    </p>
                    <p className="text-sm text-ink-muted">{[s.sector, s.model, s.focus].join(" · ")}</p>
                    <ProblemStatementPdfLink statement={s} className="text-sm" />
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <Muted>Not chosen yet</Muted>
        )}
      </Section>

      <Section title="Strengths" step={2} editHref={editHref}>
        <Tags items={p.strengths} tone="forest" />
        <QA q="What I'm particularly good at" a={p.strengths_good_at} />
        <QA q="Problems people bring to me" a={p.strengths_problems} />
        <QA q="An example" a={p.strengths_example} />
      </Section>

      <Section
        title="Where a partner would help"
        step={3}
        editHref={editHref}
        description="Skills this student is actively developing."
      >
        <Tags items={p.development_areas} tone="sage" />
        <QA q="Currently developing" a={p.development_current} />
        <QA q="Tasks I'd like to complement with a teammate" a={p.development_complement} />
        <QA q="Where another person's expertise would help most" a={p.development_help} />
      </Section>

      <Section title="Industries" step={4} editHref={editHref}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Labelled label="Has worked in" icon={<Briefcase className="size-3.5" aria-hidden />}>
            {p.industries_experience.length ? <Tags items={p.industries_experience} /> : <Muted>No prior industry experience listed</Muted>}
            {p.industries_experience_detail ? <Prose className="mt-2 text-sm">{p.industries_experience_detail}</Prose> : null}
          </Labelled>
          <Labelled label="Wants to explore" icon={<Sparkles className="size-3.5" aria-hidden />}>
            {p.industries_interest.length ? <Tags items={p.industries_interest} tone="sage" /> : <Muted>Not specified</Muted>}
          </Labelled>
        </div>
      </Section>

      <Section title="How they work" step={5} editHref={editHref}>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {QUESTIONS.map((q) => {
            const v = answers[q.key];
            if (!v || (Array.isArray(v) && !v.length)) return null;
            const values = Array.isArray(v) ? v : [v];
            return (
              <div key={q.key} className="min-w-0">
                <dt className="text-xs font-medium tracking-wide text-ink-subtle">{q.dimension}</dt>
                <dd className="mt-1 text-[0.95rem] leading-snug text-ink">
                  {values.map((x) => optionLabel(q.key, x)).join(", ")}
                  {notes[q.key] ? <span className="mt-1 block text-sm leading-relaxed text-ink-muted">“{notes[q.key]}”</span> : null}
                </dd>
              </div>
            );
          })}
        </dl>
      </Section>

      <Section title="Looking for in a partner" step={6} editHref={editHref}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Labelled label="Complementary skills">
            {p.partner_skills.length ? <Tags items={p.partner_skills} /> : <Muted>Not specified</Muted>}
          </Labelled>
          <Labelled label="Qualities">
            {p.partner_qualities.length ? <Tags items={p.partner_qualities} /> : <Muted>Not specified</Muted>}
          </Labelled>
        </div>
        {p.partner_industries.length ? (
          <Labelled label="Industries to explore together">
            <Tags items={p.partner_industries} tone="sage" />
          </Labelled>
        ) : null}
        <QA q="A successful partnership looks like" a={p.partner_success} />
      </Section>
    </article>
  );
}

function formatYears(y: number) {
  if (y === 0) return "No prior";
  return `${Number.isInteger(y) ? y : y.toFixed(1)} ${y === 1 ? "year" : "years"}`;
}

function Section({
  title,
  description,
  children,
  step,
  editHref,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  step: number;
  editHref?: (step: number) => string;
}) {
  return (
    <section className="flex flex-col gap-4 border-t border-line pt-6 first:border-none first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[0.8rem] font-semibold tracking-[0.08em] text-forest-700 uppercase">{title}</h3>
          {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
        </div>
        {editHref ? (
          <a href={editHref(step)} className="shrink-0 rounded-full px-3 py-1 text-sm font-medium text-forest-700 hover:bg-forest-800/5">
            Edit
          </a>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Labelled({ label, children, icon }: { label: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-ink-subtle">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}

function QA({ q, a }: { q: string; a: string | null }) {
  if (!a) return null;
  return (
    <Labelled label={q}>
      <Prose>{a}</Prose>
    </Labelled>
  );
}

function Prose({ children, className }: { children: string | null; className?: string }) {
  if (!children) return null;
  return <p className={`whitespace-pre-line text-[0.98rem] leading-relaxed text-ink ${className ?? ""}`}>{children}</p>;
}

function Muted({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-subtle">{children}</p>;
}

function Tags({ items, tone = "neutral" }: { items: string[]; tone?: "neutral" | "sage" | "forest" }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((t) => (
        <li key={t}>
          <Tag tone={tone}>{t}</Tag>
        </li>
      ))}
    </ul>
  );
}
