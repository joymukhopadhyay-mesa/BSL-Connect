import type { QuestionKey } from "./options";

export type QuestionnaireAnswers = Partial<Record<QuestionKey, string | string[]>>;
export type Questionnaire = {
  answers?: QuestionnaireAnswers;
  notes?: Partial<Record<QuestionKey, string>>;
};

/** Row shape of public.profiles. */
export type Profile = {
  id: string;
  full_name: string | null;
  cohort: string | null;
  role_title: string | null;
  background: string | null;
  years_experience: number | null;
  /** Preset option keys and free-text entries. */
  career_objectives: string[];
  intro: string | null;
  strengths: string[];
  strengths_good_at: string | null;
  strengths_problems: string | null;
  strengths_example: string | null;
  development_areas: string[];
  development_current: string | null;
  development_complement: string | null;
  development_help: string | null;
  industries_experience: string[];
  industries_experience_detail: string | null;
  industries_interest: string[];
  questionnaire: Questionnaire;
  partner_skills: string[];
  partner_industries: string[];
  partner_qualities: string[];
  partner_success: string | null;
  photo_path: string | null;
  photo_confirmed: boolean;
  photo_updated_at: string | null;
  details_confirmed: boolean;
  visibility_acknowledged: boolean;
  onboarding_step: number;
  status: "draft" | "published";
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

/** A profile as shown to another student, with a short-lived photo URL. */
export type PublicProfile = Profile & { photo_url: string | null };

export type MatchStatus =
  | "mutual"
  | "pending_confirmation"
  | "finalised"
  | "declined"
  | "closed"
  | "cancelled";

export type MatchRow = {
  id: string;
  student_low: string;
  student_high: string;
  status: MatchStatus;
  finalised_at: string | null;
  closed_reason: string | null;
  ended_at: string | null;
  cancellation_requested_by: string | null;
  cancellation_reason: string | null;
  cancellation_requested_at: string | null;
  created_at: string;
  updated_at: string;
};
