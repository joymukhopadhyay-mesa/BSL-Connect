"use client";

import { ChevronDown, Eye } from "lucide-react";
import { useState } from "react";
import { CoachAssist } from "@/components/ai/coach-assist";
import { VoiceInput } from "@/components/ai/voice-input";
import { Chip, TagPicker } from "@/components/ui/chips";
import { ChoiceGroup } from "@/components/ui/choice";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import type { CoachField } from "@/lib/ai/coach";
import {
  careerObjectiveLabel, careerObjectiveLabels, CAREER_OBJECTIVES, INDUSTRIES, MAX_CAREER_OBJECTIVES, MAX_CAREER_OBJECTIVE_LENGTH, PARTNER_QUALITIES, QUESTIONS, SKILL_SUGGESTIONS, type QuestionKey } from "@/lib/profile/options";
import type { Profile, Questionnaire } from "@/lib/profile/types";

export type Draft = Profile;
export type StepProps = {
  draft: Draft;
  set: <K extends keyof Draft>(key: K, value: Draft[K]) => void;
  errors: Record<string, string>;
  aiAvailable: boolean;
};

function coachContext(d: Draft) {
  return {
    role_title: d.role_title,
    strengths: d.strengths,
    development_areas: d.development_areas,
    career_objectives: careerObjectiveLabels(d.career_objectives),
  };
}

function TextBlock({
  draft,
  set,
  errors,
  aiAvailable,
  field,
  label,
  hint,
  max,
  optional,
  coach,
  rows = 4,
  placeholder,
}: StepProps & {
  field: keyof Draft & string;
  label: string;
  hint?: string;
  max: number;
  optional?: boolean;
  coach?: CoachField;
  rows?: number;
  placeholder?: string;
}) {
  const value = (draft[field] as string | null) ?? "";
  return (
    <div className="flex flex-col gap-3">
      <Field label={label} hint={hint} optional={optional} error={errors[field]} counter={{ value: value.length, max }}>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            rows={rows}
            value={value}
            maxLength={max + 50}
            placeholder={placeholder}
            onChange={(e) => set(field, e.target.value as never)}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
          />
        )}
      </Field>
      <VoiceInput label={label} value={value} max={max} onChange={(v) => set(field, v as never)} aiAvailable={aiAvailable} />
      {coach ? (
        <CoachAssist
          field={coach}
          text={value}
          context={coachContext(draft)}
          aiAvailable={aiAvailable}
          onAccept={(t) => set(field, t as never)}
          onAddTag={
            coach === "strengths_good_at" || coach === "strengths_example"
              ? (tag) => {
                  if (!draft.strengths.some((s) => s.toLowerCase() === tag.toLowerCase()) && draft.strengths.length < 12) {
                    set("strengths", [...draft.strengths, tag]);
                  }
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}

export function BasicsStep(props: StepProps) {
  const { draft, set, errors } = props;
  return (
    <div className="flex flex-col gap-7">
      <Field label="Full name" error={errors.full_name}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} autoComplete="name" value={draft.full_name ?? ""} maxLength={120} onChange={(e) => set("full_name", e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
        )}
      </Field>
      <div className="grid gap-7 sm:grid-cols-[1fr_10rem]">
        <Field label="Current or most recent role" hint="For example, “Marketing associate” or “Final-year engineering student”." error={errors.role_title}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} autoComplete="organization-title" value={draft.role_title ?? ""} maxLength={120} onChange={(e) => set("role_title", e.target.value)} aria-describedby={describedBy} aria-invalid={invalid || undefined} />
          )}
        </Field>
        <Field label="Years of work experience" optional error={errors.years_experience}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              min={0}
              max={50}
              step={0.5}
              value={draft.years_experience ?? ""}
              onChange={(e) => set("years_experience", e.target.value === "" ? null : Number(e.target.value))}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
            />
          )}
        </Field>
      </div>
      <Field label="Programme or cohort" optional hint="As it appears in your MESA programme, if applicable." error={errors.cohort}>
        {({ id, describedBy }) => (
          <Input id={id} value={draft.cohort ?? ""} maxLength={60} onChange={(e) => set("cohort", e.target.value)} aria-describedby={describedBy} />
        )}
      </Field>
      <TextBlock {...props} field="background" label="Professional background" hint="Where you've worked or studied, and what you did there." max={700} coach="background" rows={3} />

      <Field
        label="What career outcomes are you working towards?"
        hint="Choose all that apply, or type your own — for example a specific role or type of company."
        error={errors.career_objectives}
      >
        {() => (
          <TagPicker
            value={draft.career_objectives}
            onChange={(v) => set("career_objectives", v)}
            suggestions={CAREER_OBJECTIVES.map((c) => c.value)}
            labelFor={careerObjectiveLabel}
            max={MAX_CAREER_OBJECTIVES}
            maxLength={MAX_CAREER_OBJECTIVE_LENGTH}
            commaSeparates={false}
            customPlaceholder="Add your own, e.g. Founder's Office roles"
            ariaLabel="Career outcomes"
          />
        )}
      </Field>

      <TextBlock
        {...props}
        field="intro"
        label="A little about how I work and what I bring to a team"
        hint="Two or three sentences. This is the first thing classmates read."
        max={700}
        coach="intro"
        placeholder="I enjoy turning ambiguous problems into a clear plan…"
      />
    </div>
  );
}

export function StrengthsStep(props: StepProps) {
  const { draft, set, errors } = props;
  return (
    <div className="flex flex-col gap-7">
      <Field label="Your most relevant strengths" hint="Choose the ones you'd genuinely bring to a project, or add your own." error={errors.strengths}>
        {() => (
          <TagPicker value={draft.strengths} onChange={(v) => set("strengths", v)} suggestions={SKILL_SUGGESTIONS} max={12} ariaLabel="Strengths" />
        )}
      </Field>
      <TextBlock {...props} field="strengths_good_at" label="What are you particularly good at?" max={700} coach="strengths_good_at" />
      <TextBlock {...props} field="strengths_problems" label="What kinds of problems do people come to you for?" max={700} optional rows={3} />
      <TextBlock
        {...props}
        field="strengths_example"
        label="One concrete example of a strength in action"
        hint="What was the situation, what did you do, and what happened?"
        max={900}
        optional
        coach="strengths_example"
      />
    </div>
  );
}

export function DevelopmentStep(props: StepProps) {
  const { draft, set, errors } = props;
  return (
    <div className="flex flex-col gap-7">
      <Notice tone="info" icon={<Eye className="size-4" />} title="Visible to your cohort">
        Everything you write in your profile — including the areas you&apos;re developing and your working-style answers — is visible to
        verified students in your BSL cohort and the programme team. Development areas help a partner see where they can contribute; they
        aren&apos;t a judgement of ability.
      </Notice>
      <Field label="Skills you're currently developing" hint="Pick from the list or add your own." error={errors.development_areas}>
        {() => (
          <TagPicker value={draft.development_areas} onChange={(v) => set("development_areas", v)} suggestions={SKILL_SUGGESTIONS} max={10} ariaLabel="Development areas" />
        )}
      </Field>
      <TextBlock {...props} field="development_current" label="What are you working on building right now?" max={700} coach="development_current" rows={3} />
      <TextBlock {...props} field="development_complement" label="Which tasks would you like to complement with a teammate's strengths?" max={700} optional rows={3} />
      <TextBlock {...props} field="development_help" label="Where would another person's expertise help you most?" max={700} optional rows={3} />
    </div>
  );
}

function IndustryChips({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {INDUSTRIES.map((i) => {
        const on = value.includes(i);
        return (
          <Chip key={i} selected={on} onToggle={() => onChange(on ? value.filter((v) => v !== i) : [...value, i])}>
            {i}
          </Chip>
        );
      })}
    </div>
  );
}

export function IndustriesStep(props: StepProps) {
  const { draft, set, errors } = props;
  return (
    <div className="flex flex-col gap-9">
      <div className="flex flex-col gap-3">
        <h3 className="text-[1.05rem] font-semibold text-ink">Industries you&apos;ve worked in</h3>
        <p className="-mt-1 text-sm text-ink-muted">Select all that apply. Leave empty if you haven&apos;t worked in an industry yet — that&apos;s fine.</p>
        <IndustryChips value={draft.industries_experience} onChange={(v) => set("industries_experience", v)} label="Industries worked in" />
        <TextBlock {...props} field="industries_experience_detail" label="Anything to add about that experience?" max={700} optional rows={3} />
      </div>
      <div className="flex flex-col gap-3">
        <h3 className="text-[1.05rem] font-semibold text-ink">Industries you want to explore during BSL</h3>
        <p className="-mt-1 text-sm text-ink-muted">Even if you&apos;ve never worked in them. Curiosity and career pivots are welcome here.</p>
        <IndustryChips value={draft.industries_interest} onChange={(v) => set("industries_interest", v)} label="Industries of interest" />
        {errors.industries_interest ? <p className="text-sm text-danger">{errors.industries_interest}</p> : null}
      </div>
    </div>
  );
}

export function QuestionnaireStep({ draft, set, errors, aiAvailable }: StepProps) {
  const q: Questionnaire = draft.questionnaire ?? {};
  const answers = q.answers ?? {};
  const notes = q.notes ?? {};
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(Object.keys(notes).map((k) => [k, true])),
  );

  function setAnswer(key: QuestionKey, v: string | string[]) {
    set("questionnaire", { ...q, answers: { ...answers, [key]: v }, notes });
  }
  function setNote(key: QuestionKey, v: string) {
    set("questionnaire", { ...q, answers, notes: { ...notes, [key]: v } });
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm leading-relaxed text-ink-muted">
        There are no right answers. These describe how you like to work so you and a potential partner can see where you align and where
        you&apos;d want to agree an approach.
      </p>
      {QUESTIONS.map((question, i) => (
        <div key={question.key} className="flex flex-col gap-3">
          <span className="text-xs tabular-nums text-ink-subtle">
            {i + 1} / {QUESTIONS.length}
          </span>
          <ChoiceGroup
            legend={question.title}
            description={question.description}
            options={question.options}
            type={question.type}
            value={answers[question.key]}
            maxSelections={question.maxSelections}
            onChange={(v) => setAnswer(question.key, v)}
          />
          {errors[`questionnaire.answers.${question.key}`] ? (
            <p className="text-sm text-danger">{errors[`questionnaire.answers.${question.key}`]}</p>
          ) : null}
          {openNotes[question.key] ? (
            <>
              <Textarea
                rows={2}
                maxLength={300}
                aria-label={`Note on ${question.dimension.toLowerCase()} (optional)`}
                placeholder="Add context in your own words (optional)"
                value={notes[question.key] ?? ""}
                onChange={(e) => setNote(question.key, e.target.value)}
              />
              <VoiceInput
                label={`Note on ${question.dimension.toLowerCase()}`}
                value={notes[question.key] ?? ""}
                max={300}
                onChange={(v) => setNote(question.key, v)}
                aiAvailable={aiAvailable}
              />
            </>
          ) : (
            <button
              type="button"
              onClick={() => setOpenNotes((o) => ({ ...o, [question.key]: true }))}
              className="inline-flex w-fit items-center gap-1 text-sm font-medium text-forest-700 hover:text-forest-900"
            >
              <ChevronDown className="size-4" /> Add a note
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function PartnerStep(props: StepProps) {
  const { draft, set, errors } = props;
  return (
    <div className="flex flex-col gap-8">
      <Field label="Which skills would complement yours?" hint="These are matched against other students' strengths." error={errors.partner_skills}>
        {() => <TagPicker value={draft.partner_skills} onChange={(v) => set("partner_skills", v)} suggestions={SKILL_SUGGESTIONS} max={10} ariaLabel="Complementary skills" />}
      </Field>
      <Field label="Which professional qualities matter most to you?" hint="Choose up to five." error={errors.partner_qualities}>
        {() => (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Partner qualities">
            {PARTNER_QUALITIES.map((q) => {
              const on = draft.partner_qualities.includes(q);
              return (
                <Chip
                  key={q}
                  selected={on}
                  disabled={!on && draft.partner_qualities.length >= 5}
                  onToggle={() => set("partner_qualities", on ? draft.partner_qualities.filter((x) => x !== q) : [...draft.partner_qualities, q])}
                >
                  {q}
                </Chip>
              );
            })}
          </div>
        )}
      </Field>
      <div className="flex flex-col gap-3">
        <p className="text-[0.95rem] font-medium text-ink">
          Industries you&apos;d like to explore with a partner <span className="ml-1 text-sm font-normal text-ink-subtle">Optional</span>
        </p>
        <IndustryChips value={draft.partner_industries} onChange={(v) => set("partner_industries", v)} label="Industries to explore with a partner" />
      </div>
      <TextBlock {...props} field="partner_success" label="What would make a BSL partnership successful for you?" max={700} optional coach="partner_success" rows={3} />
    </div>
  );
}
