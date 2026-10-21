/** Columns included in the administrator cohort export — permitted fields only. */
export const EXPORT_COLUMNS = [
  { key: "full_name", header: "Name" },
  { key: "email", header: "MESA email" },
  { key: "cohort", header: "Cohort" },
  { key: "role_title", header: "Current or most recent role" },
  { key: "profile_status", header: "Profile status" },
  { key: "career_objective", header: "Career objective" },
  { key: "strengths", header: "Strengths" },
  { key: "industries_experience", header: "Industries worked in" },
  { key: "industries_interest", header: "Industries of interest" },
  { key: "partnership_status", header: "Partnership" },
  { key: "partner_name", header: "Partner" },
  { key: "partner_email", header: "Partner email" },
  { key: "finalised_at", header: "Partnership finalised" },
] as const;
