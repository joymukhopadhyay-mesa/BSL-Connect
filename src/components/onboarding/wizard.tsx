"use client";

import { ArrowLeft, ArrowRight, Check, PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { publishProfile, saveProfileStep } from "@/app/onboarding/actions";
import { ProfileDetail } from "@/components/profile/profile-detail";
import { DeadlineTicker } from "@/components/shell/deadline-ticker";
import { PhotoUploader } from "@/components/profile/photo-uploader";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Checkbox } from "@/components/ui/field";
import { Notice, Progress, Wordmark } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { completionPercent, fieldLabel, missingFields, stepForField } from "@/lib/profile/completion";
import { LAST_STEP, ONBOARDING_STEPS, PHOTO_STEP } from "@/lib/profile/schema";
import type { Profile } from "@/lib/profile/types";
import {
  BasicsStep, DevelopmentStep, IndustriesStep, PartnerStep, ProblemStatementsStep, QuestionnaireStep, StrengthsStep, type Draft, type StepProps,
} from "./step-forms";

const STEP_FIELDS: Record<number, Array<keyof Profile>> = {
  1: ["full_name", "cohort", "role_title", "background", "years_experience", "career_objectives", "intro"],
  2: ["strengths", "strengths_good_at", "strengths_problems", "strengths_example"],
  3: ["development_areas", "development_current", "development_complement", "development_help"],
  4: ["industries_experience", "industries_experience_detail", "industries_interest"],
  5: ["questionnaire"],
  6: ["partner_skills", "partner_industries", "partner_qualities", "partner_success"],
  7: ["problem_statements"],
};

const INTROS: Record<number, string> = {
  1: "Let's start with the basics — who you are and where you're heading.",
  2: "What do you bring to a team? Specific beats impressive.",
  3: "Every strong partnership covers each other's gaps. Where would a partner help most?",
  4: "Where you've been, and where you'd like to go. These are kept separate.",
  5: "Ten quick questions about how you like to work.",
  6: "Describe the partner who would complement you.",
  7: "Rank the company problem statements you'd most like to work on, 1 being your top choice.",
  8: "One clear photo, so classmates recognise you.",
  9: "Here's how your profile will appear to your cohort.",
};

export function OnboardingWizard({
  initialProfile,
  initialPhotoUrl,
  initialStep,
  aiAvailable,
  showDeadline = false,
}: {
  initialProfile: Profile;
  initialPhotoUrl: string | null;
  initialStep: number;
  aiAvailable: boolean;
  showDeadline?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const editing = initialProfile.status === "published";
  const [draft, setDraft] = useState<Draft>(initialProfile);
  const [saved, setSaved] = useState<Draft>(initialProfile);
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [step, setStep] = useState(initialStep);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [published, setPublished] = useState(false);
  const [confirm, setConfirm] = useState({ details: initialProfile.details_confirmed, photo: initialProfile.photo_confirmed, visibility: initialProfile.visibility_acknowledged });
  const headingRef = useRef<HTMLHeadingElement>(null);

  const furthest = Math.max(saved.onboarding_step, step);
  const missing = missingFields({ ...draft, details_confirmed: true, visibility_acknowledged: true });
  const stepMissing = missing.filter((f) => stepForField(f) === step && f !== "photo_confirmed");
  const dirty = (STEP_FIELDS[step] ?? []).some((k) => JSON.stringify(draft[k]) !== JSON.stringify(saved[k]));

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
    const url = new URL(window.location.href);
    url.searchParams.set("step", String(step));
    window.history.replaceState(null, "", url);
  }, [step]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set: StepProps["set"] = (key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  };

  function payloadFor(n: number) {
    return Object.fromEntries((STEP_FIELDS[n] ?? []).map((k) => [k, draft[k]]));
  }

  function save(target: number | "exit" | "done") {
    setFormError(null);
    const advancing = typeof target === "number" && target > step;
    if (advancing && stepMissing.length && !editing) {
      setErrors(Object.fromEntries(stepMissing.map((f) => [f.replace("questionnaire.", "questionnaire.answers."), "Required"])));
      setFormError(`Please complete: ${Array.from(new Set(stepMissing.map(fieldLabel))).join(", ")}.`);
      return;
    }
    startTransition(async () => {
      if (STEP_FIELDS[step] && (dirty || advancing)) {
        const res = await saveProfileStep(step, payloadFor(step), advancing);
        if (!res.ok) {
          setErrors(res.fieldErrors ?? {});
          setFormError(res.error);
          return;
        }
        setSaved(res.profile);
        setDraft((d) => ({ ...d, ...Object.fromEntries((STEP_FIELDS[step] ?? []).map((k) => [k, res.profile[k]])), onboarding_step: res.profile.onboarding_step, version: res.profile.version }));
      }
      if (target === "exit") {
        toast.show("Progress saved. You can continue any time.", { tone: "success" });
        router.push("/me");
        return;
      }
      if (target === "done") {
        toast.show("Profile updated.", { tone: "success" });
        router.push("/me");
        router.refresh();
        return;
      }
      setStep(target);
    });
  }

  function publish() {
    setFormError(null);
    startTransition(async () => {
      const res = await publishProfile({ details_confirmed: confirm.details, photo_confirmed: confirm.photo, visibility_acknowledged: confirm.visibility });
      if (!res.ok) {
        setFormError(res.missing?.length ? `${res.error} Missing: ${Array.from(new Set(res.missing.map(fieldLabel))).join(", ")}.` : res.error);
        return;
      }
      setSaved(res.profile);
      setDraft(res.profile);
      setPublished(true);
      router.refresh();
    });
  }

  if (published) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-6 text-center">
        <div className="animate-pop flex size-16 items-center justify-center rounded-3xl bg-forest-800 text-sage-300 shadow-lift">
          <PartyPopper className="size-7" />
        </div>
        <h1 className="mt-6 font-display text-[2.6rem] leading-tight text-forest-900">Your profile is live</h1>
        <p className="mt-3 leading-relaxed text-ink-muted">
          Verified classmates can now discover you. Your next great collaborator might be one profile away.
        </p>
        <ButtonLink href="/discover" size="lg" className="mt-8" icon={<ArrowRight className="size-4" />}>
          Start discovering partners
        </ButtonLink>
      </main>
    );
  }

  const stepProps: StepProps = { draft, set, errors, aiAvailable };
  const meta = ONBOARDING_STEPS[step - 1]!;

  return (
    <div className="min-h-dvh pb-[calc(6.5rem+var(--safe-bottom)+var(--ticker-height))]">
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 border-b-line pt-[var(--safe-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4">
          <Wordmark />
          <button
            type="button"
            onClick={() => (editing ? router.push("/me") : save("exit"))}
            disabled={pending}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-forest-700 hover:bg-forest-800/5"
          >
            {editing ? "Cancel" : "Save & exit"}
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <Progress value={editing ? 100 : completionPercent({ ...draft })} label="Profile completion" />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 pt-6">
        <nav aria-label="Profile steps" className="-mx-4 mb-8 overflow-x-auto px-4 [scrollbar-width:none]">
          <ol className="flex min-w-max gap-1.5">
            {ONBOARDING_STEPS.map((s) => {
              const reachable = editing || s.step <= furthest;
              const current = s.step === step;
              return (
                <li key={s.step}>
                  <button
                    type="button"
                    disabled={!reachable || pending}
                    onClick={() => save(s.step)}
                    aria-current={current ? "step" : undefined}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition",
                      current ? "bg-forest-800 text-ivory-50" : reachable ? "bg-white/70 text-ink hover:bg-white" : "text-ink-subtle",
                    )}
                  >
                    {s.step < furthest && !current && !missing.some((f) => stepForField(f) === s.step) ? <Check className="size-3" /> : <span className="tabular-nums">{s.step}</span>}
                    {s.short}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div key={step} className="animate-rise">
          <p className="text-sm font-medium text-forest-600">
            {editing ? "Editing your profile" : `Step ${step} of ${LAST_STEP}`}
          </p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-1 font-display text-[2.5rem] leading-[1.02] text-forest-900 outline-none sm:text-[3rem]">
            {meta.title}
          </h1>
          <p className="mt-3 max-w-xl text-[1.02rem] leading-relaxed text-ink-muted">{INTROS[step]}</p>

          <div className="mt-8">
            {step === 1 && <BasicsStep {...stepProps} />}
            {step === 2 && <StrengthsStep {...stepProps} />}
            {step === 3 && <DevelopmentStep {...stepProps} />}
            {step === 4 && <IndustriesStep {...stepProps} />}
            {step === 5 && <QuestionnaireStep {...stepProps} />}
            {step === 6 && <PartnerStep {...stepProps} />}
            {step === 7 && <ProblemStatementsStep {...stepProps} />}
            {step === PHOTO_STEP && (
              <PhotoUploader
                currentUrl={photoUrl}
                name={draft.full_name}
                onUploaded={(r) => {
                  setPhotoUrl(r.photo_url);
                  setDraft((d) => ({ ...d, photo_path: r.photo_path, photo_confirmed: true, photo_updated_at: r.photo_updated_at }));
                  setSaved((d) => ({ ...d, photo_path: r.photo_path, photo_confirmed: true }));
                  setConfirm((c) => ({ ...c, photo: true }));
                  toast.show("Photo saved.", { tone: "success" });
                }}
              />
            )}
            {step === LAST_STEP && (
              <ReviewStep
                draft={draft}
                photoUrl={photoUrl}
                missing={missing}
                confirm={confirm}
                setConfirm={setConfirm}
                goTo={(n) => save(n)}
                editing={editing}
              />
            )}
          </div>

          {formError ? (
            <Notice tone="danger" className="mt-8">
              {formError}
            </Notice>
          ) : null}
        </div>
      </div>

      <footer className="glass fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 border-t-line pb-[var(--safe-bottom)]">
        {showDeadline ? <DeadlineTicker /> : null}
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Button type="button" variant="ghost" onClick={() => save(Math.max(1, step - 1))} disabled={step === 1 || pending} icon={<ArrowLeft className="size-4" />}>
            Back
          </Button>
          {editing ? (
            <div className="flex gap-2">
              {step < LAST_STEP ? (
                <Button type="button" variant="secondary" onClick={() => save(step + 1)} disabled={pending}>
                  Next
                </Button>
              ) : null}
              <Button type="button" onClick={() => save("done")} loading={pending}>
                Save changes
              </Button>
            </div>
          ) : step < LAST_STEP ? (
            <Button type="button" onClick={() => save(step + 1)} loading={pending} disabled={step === PHOTO_STEP && !draft.photo_path}>
              {step === PHOTO_STEP ? "Review profile" : (
                <>
                  <span className="sm:hidden">Continue</span>
                  <span className="hidden sm:inline">Save and continue</span>
                </>
              )}
              {!pending ? <ArrowRight className="size-4" /> : null}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={publish}
              loading={pending}
              disabled={!confirm.details || !confirm.photo || !confirm.visibility || missing.some((f) => !["details_confirmed", "visibility_acknowledged", "photo_confirmed"].includes(f))}
            >
              Publish profile
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function ReviewStep({
  draft,
  photoUrl,
  missing,
  confirm,
  setConfirm,
  goTo,
  editing,
}: {
  draft: Draft;
  photoUrl: string | null;
  missing: string[];
  confirm: { details: boolean; photo: boolean; visibility: boolean };
  setConfirm: (c: { details: boolean; photo: boolean; visibility: boolean }) => void;
  goTo: (step: number) => void;
  editing: boolean;
}) {
  const outstanding = missing.filter((f) => !["details_confirmed", "visibility_acknowledged", "photo_confirmed"].includes(f));
  const byStep = new Map<number, string[]>();
  for (const f of outstanding) {
    const s = stepForField(f);
    byStep.set(s, Array.from(new Set([...(byStep.get(s) ?? []), fieldLabel(f)])));
  }
  return (
    <div className="flex flex-col gap-8">
      {outstanding.length ? (
        <Notice tone="warning" title="Your profile is almost ready">
          <ul className="mt-1 flex flex-col gap-1">
            {Array.from(byStep.entries()).map(([s, labels]) => (
              <li key={s}>
                <button type="button" onClick={() => goTo(s)} className="text-left underline underline-offset-2">
                  {ONBOARDING_STEPS[s - 1]!.title}
                </button>
                : {labels.join(", ")}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="surface rounded-[var(--radius-card)] p-5 shadow-soft sm:p-8">
        <ProfileDetail profile={draft} photoUrl={photoUrl} editHref={(s) => `/onboarding?step=${s}`} />
      </div>

      {!editing ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-[1.05rem] font-semibold text-ink">Before you publish</h2>
          <Checkbox checked={confirm.details} onChange={(e) => setConfirm({ ...confirm, details: e.target.checked })} label="My details are accurate." />
          <Checkbox
            checked={confirm.photo}
            onChange={(e) => setConfirm({ ...confirm, photo: e.target.checked })}
            label="My photograph depicts me."
            description="A self-declaration. Classmates can report concerns to the programme team."
          />
          <Checkbox
            checked={confirm.visibility}
            onChange={(e) => setConfirm({ ...confirm, visibility: e.target.checked })}
            label="I understand who can see my profile."
            description="Everything above — including development areas and working-style answers — is visible to verified students in my BSL cohort and to the programme team. It is not public on the internet. Likes I give stay private unless they become mutual."
          />
        </div>
      ) : null}
    </div>
  );
}
