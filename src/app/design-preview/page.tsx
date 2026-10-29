import Link from "next/link";
import { notFound } from "next/navigation";
import { DiscoveryDeck } from "@/components/discover/deck";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { CompatibilityPanel } from "@/components/matching/compatibility-panel";
import { ProblemStatementPrompt } from "@/components/problem-statements/selection-prompt";
import { ProfileDetail } from "@/components/profile/profile-detail";
import { DeadlineTicker } from "@/components/shell/deadline-ticker";
import { StudentNav } from "@/components/shell/student-nav";
import { SectionCard } from "@/components/ui/misc";
import { pairInsights } from "@/lib/matching/insights";
import { rankCandidates, scoreCompatibility } from "@/lib/matching/scoring";
import { LAST_STEP } from "@/lib/profile/schema";
import { SAMPLE_CANDIDATES, SAMPLE_ME } from "./sample";

export const metadata = { title: "Design preview" };

/**
 * Visual QA of student screens without a backend. Disabled unless
 * ENABLE_DESIGN_PREVIEW=true, and never available in production builds.
 * Uses clearly fictional sample data that is never persisted.
 */
export default async function DesignPreview({ searchParams }: PageProps<"/design-preview">) {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DESIGN_PREVIEW !== "true") notFound();
  const sp = await searchParams;
  const view = typeof sp.view === "string" ? sp.view : "discover";
  const step = Number(typeof sp.step === "string" ? sp.step : "1");

  const candidates = rankCandidates(
    SAMPLE_CANDIDATES.map((p) => ({ ...p, photo_url: null, compatibility: scoreCompatibility(SAMPLE_ME, p), insights: pairInsights(SAMPLE_ME, p) })),
  );

  return (
    <div className="min-h-dvh">
      <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-amber-soft px-4 py-1.5 text-xs font-medium text-amber">
        Design preview — fictional sample data, not real students. Actions are not connected.
        {["discover", "profile", "onboarding", "selection"].map((v) => (
          <Link key={v} href={`/design-preview?view=${v}`} className="underline">
            {v}
          </Link>
        ))}
      </div>
      {view === "onboarding" ? (
        <OnboardingWizard initialProfile={{ ...SAMPLE_ME, status: "draft", onboarding_step: LAST_STEP }} initialPhotoUrl={null} initialStep={Math.min(LAST_STEP, Math.max(1, step))} aiAvailable={sp.ai !== "off"} showDeadline />
      ) : (
        <>
          <StudentNav openMatches={1} partnered={false} />
          <main className="mx-auto max-w-6xl px-4 pt-5 pb-nav sm:px-6 md:pt-8 md:pb-[calc(4rem+var(--ticker-height))]">
            {view === "selection" ? <ProblemStatementPrompt initial={[]} published /> : null}
            {view === "profile" ? (
              <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
                <div className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-8">
                  <ProfileDetail profile={candidates[0]!} photoUrl={null} />
                </div>
                <SectionCard title="Compatibility insights">
                  <CompatibilityPanel compatibility={candidates[0]!.compatibility} insights={candidates[0]!.insights} candidateId={candidates[0]!.id} candidateName={candidates[0]!.full_name ?? ""} aiAvailable={false} />
                </SectionCard>
              </div>
            ) : (
              <DiscoveryDeck initialCandidates={candidates} myPhotoUrl={null} myName={SAMPLE_ME.full_name} myStatements={SAMPLE_ME.problem_statements} aiAvailable={false} />
            )}
          </main>
          <DeadlineTicker className="fixed inset-x-0 bottom-[calc(var(--nav-height)+var(--safe-bottom))] z-30 md:bottom-0" />
        </>
      )}
    </div>
  );
}
