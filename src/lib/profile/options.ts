/**
 * Selectable profile vocabularies. These are suggestions, not closed lists:
 * students can add their own skills and development areas. Questionnaire
 * answers, career objectives and industries are closed lists so that the
 * deterministic compatibility engine can compare them.
 */

export const SKILL_SUGGESTIONS = [
  "Marketing",
  "Sales",
  "Finance",
  "Strategy",
  "Operations",
  "Product management",
  "Data analytics",
  "Research",
  "Design",
  "Technology",
  "Business development",
  "Communication",
  "Project management",
  "Problem solving",
] as const;

export const INDUSTRIES = [
  "Consumer brands and FMCG",
  "Fintech and financial services",
  "B2B SaaS",
  "Consumer technology",
  "Healthcare",
  "Education",
  "E-commerce",
  "Logistics and supply chain",
  "Climate and sustainability",
  "Manufacturing",
  "Media and entertainment",
  "Consulting",
  "Food and beverage",
  "Social impact",
  "Other",
] as const;

export const CAREER_OBJECTIVES = [
  { value: "consulting", label: "Consulting", group: "advisory" },
  { value: "strategy_bizops", label: "Strategy and business operations", group: "advisory" },
  { value: "product", label: "Product management", group: "build" },
  { value: "entrepreneurship", label: "Founding or joining an early-stage startup", group: "build" },
  { value: "marketing_brand", label: "Marketing and brand", group: "growth" },
  { value: "sales_bd", label: "Sales and business development", group: "growth" },
  { value: "finance_investing", label: "Finance and investing", group: "analytical" },
  { value: "analytics", label: "Analytics and data", group: "analytical" },
  { value: "operations", label: "Operations and supply chain", group: "operations" },
  { value: "undecided", label: "Still exploring", group: "open" },
] as const;

export type CareerObjective = (typeof CAREER_OBJECTIVES)[number]["value"];

/** A student may pick several preset outcomes and add their own. */
export const MAX_CAREER_OBJECTIVES = 6;
export const MAX_CAREER_OBJECTIVE_LENGTH = 80;

export const PARTNER_QUALITIES = [
  "Reliable",
  "Proactive communicator",
  "Detail-oriented",
  "Big-picture thinker",
  "Curious",
  "Calm under pressure",
  "Open to feedback",
  "Organised",
  "Creative",
  "Decisive",
] as const;

export type QuestionOption = { value: string; label: string; hint?: string };
export type Question = {
  key: QuestionKey;
  title: string;
  description?: string;
  type: "single" | "multi";
  maxSelections?: number;
  options: QuestionOption[];
  /** Short label used in insight copy, e.g. "Working style". */
  dimension: string;
};

export const QUESTION_KEYS = [
  "working_style",
  "decision_making",
  "communication",
  "ownership",
  "ambiguity",
  "conflict",
  "feedback",
  "execution",
  "pressure",
  "expectations",
] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];

/**
 * Neutral by design: no option is framed as better than another. The
 * answers describe how someone likes to work, not how good they are.
 */
export const QUESTIONS: Question[] = [
  {
    key: "working_style",
    dimension: "Working style",
    title: "How do you prefer to approach a new problem?",
    type: "single",
    options: [
      { value: "structured", label: "Structured planning", hint: "Map the problem and agree a plan before acting" },
      { value: "exploratory", label: "Exploratory experimentation", hint: "Learn by trying ideas early and adjusting" },
      { value: "balanced", label: "A mix of both", hint: "Plan the essentials, then explore" },
    ],
  },
  {
    key: "decision_making",
    dimension: "Decision-making",
    title: "How do you usually reach decisions?",
    description: "Choose all that apply.",
    type: "multi",
    options: [
      { value: "data", label: "Data-led analysis" },
      { value: "discussion", label: "Collaborative discussion" },
      { value: "intuition", label: "Experience and intuition" },
    ],
  },
  {
    key: "communication",
    dimension: "Communication",
    title: "How do you prefer to communicate on a project?",
    type: "single",
    options: [
      { value: "direct", label: "Direct and concise", hint: "Short updates, straight to the point" },
      { value: "detailed", label: "Detailed and contextual", hint: "Full reasoning and background" },
      { value: "adaptive", label: "Adaptive", hint: "Depends on the person and the moment" },
    ],
  },
  {
    key: "ownership",
    dimension: "Ownership",
    title: "How do you like to divide work with a partner?",
    type: "single",
    options: [
      { value: "independent", label: "Clear, separate ownership", hint: "Each person owns distinct workstreams" },
      { value: "collaborative", label: "Work through most tasks together", hint: "Frequent pairing and joint drafts" },
      { value: "mixed", label: "Split the work, sync often", hint: "Own pieces, review each other's" },
    ],
  },
  {
    key: "ambiguity",
    dimension: "Ambiguity",
    title: "When the problem is open-ended or the brief keeps changing…",
    type: "single",
    options: [
      { value: "energised", label: "I find it energising" },
      { value: "comfortable", label: "I'm comfortable working with it" },
      { value: "prefer_clarity", label: "I do my best work once the scope is clear" },
    ],
  },
  {
    key: "conflict",
    dimension: "Disagreements",
    title: "When you and a teammate disagree, you tend to…",
    type: "single",
    options: [
      { value: "address_directly", label: "Raise it early and talk it through" },
      { value: "reflect_first", label: "Take time to reflect, then discuss" },
      { value: "find_common_ground", label: "Look for a compromise you can both accept" },
    ],
  },
  {
    key: "feedback",
    dimension: "Feedback",
    title: "How do you prefer to give and receive feedback?",
    description: "Choose all that apply.",
    type: "multi",
    options: [
      { value: "direct_immediate", label: "Directly, in the moment" },
      { value: "scheduled_checkins", label: "At regular check-ins" },
      { value: "written", label: "In writing, with time to reflect" },
    ],
  },
  {
    key: "execution",
    dimension: "Execution",
    title: "When it comes to delivering the work…",
    type: "single",
    options: [
      { value: "plan_ahead", label: "I plan ahead and work to milestones" },
      { value: "iterate_quickly", label: "I iterate quickly and refine as I go" },
      { value: "depends", label: "It depends on the deadline and the task" },
    ],
  },
  {
    key: "pressure",
    dimension: "Working under pressure",
    title: "What helps you stay effective under pressure?",
    description: "Choose up to three.",
    type: "multi",
    maxSelections: 3,
    options: [
      { value: "clear_priorities", label: "Clear priorities" },
      { value: "structured_timeline", label: "A structured timeline" },
      { value: "frequent_syncs", label: "Frequent, short check-ins" },
      { value: "focused_time", label: "Uninterrupted focus time" },
      { value: "short_breaks", label: "Stepping away briefly to reset" },
    ],
  },
  {
    key: "expectations",
    dimension: "Partner expectations",
    title: "What do you expect most from a BSL partner?",
    description: "Choose up to three.",
    type: "multi",
    maxSelections: 3,
    options: [
      { value: "equal_effort", label: "Equal effort" },
      { value: "proactive_communication", label: "Proactive communication" },
      { value: "reliability", label: "Reliability on deadlines" },
      { value: "challenge_ideas", label: "Challenging each other's ideas" },
      { value: "learning_together", label: "Learning from each other" },
      { value: "high_standards", label: "High standards for the final output" },
    ],
  },
];

export const QUESTION_BY_KEY: Record<QuestionKey, Question> = Object.fromEntries(
  QUESTIONS.map((q) => [q.key, q]),
) as Record<QuestionKey, Question>;

export function optionLabel(key: QuestionKey, value: string): string {
  return QUESTION_BY_KEY[key].options.find((o) => o.value === value)?.label ?? value;
}

/** Preset keys map to their label; free-text entries are shown as typed. */
export function careerObjectiveLabel(value: string | null | undefined): string {
  return CAREER_OBJECTIVES.find((c) => c.value === value)?.label ?? value ?? "";
}

export function careerObjectiveLabels(values: readonly string[] | null | undefined): string[] {
  return (values ?? []).map(careerObjectiveLabel);
}

export const REPORT_CATEGORIES = [
  { value: "inaccurate_profile", label: "Profile information seems inaccurate" },
  { value: "photo_not_of_person", label: "Photo doesn't appear to show this student" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "harassment", label: "Harassment or unprofessional behaviour" },
  { value: "spam", label: "Spam or misuse" },
  { value: "other", label: "Something else" },
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number]["value"];
