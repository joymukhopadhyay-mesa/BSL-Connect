/**
 * BSL problem statements, from the programme team's "List of Problem
 * Statements" sheet. Mirrored in public.problem_statements (migration
 * 20261029000000_problem_statements.sql); tests/db keeps the two in step.
 * `guidance` is the team's note on who each company is looking for.
 */

export type ProblemStatement = {
  id: string;
  /** As the programme team names it, e.g. "Technosport 2". */
  name: string;
  company: string;
  /** Short title of the brief, where the company has more than one or the PDF names it. */
  brief: string | null;
  sector: string;
  /** B2B, B2C, B2B/B2C, C2C or VC. */
  model: string;
  focus: string;
  pdfUrl: string;
  guidance: string | null;
};

export const PROBLEM_STATEMENTS: readonly ProblemStatement[] = [
  { id: "pocketfm", name: "PocketFM", company: "PocketFM", brief: null, sector: "Media & Entertainment", model: "B2C", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1VZTA1XNUqmS7kmDHV3ZK5O869JOcQx-F/view?usp=drive_link", guidance: "Growth Exp. preferred" },
  { id: "technosport-1", name: "Technosport 1", company: "Technosport", brief: "Supply Planning", sector: "Consumer Brand", model: "B2C", focus: "Operations & Planning", pdfUrl: "https://drive.google.com/file/d/1_lmU8NdkWN4A9SROFRWmhoYKkhZFK-qG/view?usp=drive_link", guidance: "No freshers; family Business could work, 3-4 years of Experience" },
  { id: "technosport-2", name: "Technosport 2", company: "Technosport", brief: "New Categories", sector: "Consumer Brand", model: "B2C", focus: "Market & Category Expansion", pdfUrl: "https://drive.google.com/file/d/1ah6gPkFtnyevgi93S6NE6rUyCuIzmnxV/view?usp=drive_link", guidance: null },
  { id: "sortment", name: "Sortment", company: "Sortment", brief: null, sector: "AI", model: "B2B", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1erBoDvVdCyakiU1N9y74Qg767o5XYZ1l/view?usp=drive_link", guidance: null },
  { id: "modveon", name: "Modveon", company: "Modveon", brief: "Agentic Payments", sector: "Fintech", model: "B2B", focus: "Product Strategy & Prototype", pdfUrl: "https://drive.google.com/file/d/1wU7PmBHK1eN9-ShHQVwE7nLKO8_5eMbg/view?usp=drive_link", guidance: "Good tech focused students should select this Problem Statement, plus NDA will be signed and students have regular touch points with him; top 1% AI talent" },
  { id: "bounce-1", name: "Bounce 1", company: "Bounce", brief: "Scale", sector: "Mobility & EV", model: "B2B", focus: "Operations & Planning", pdfUrl: "https://drive.google.com/file/d/1zTKemVG9Wh2ikFYanhJJFFQtVElCpQic/view?usp=drive_link", guidance: null },
  { id: "bounce-2", name: "Bounce 2", company: "Bounce", brief: "Growth", sector: "Mobility & EV", model: "B2B", focus: "Market & Category Expansion", pdfUrl: "https://drive.google.com/file/d/1RgvesIWaIHfdtvtqkSgMf-7tWMa6byCd/view?usp=drive_link", guidance: null },
  { id: "ringgai", name: "RinggAI", company: "RinggAI", brief: null, sector: "AI", model: "B2B", focus: "Product Strategy & Prototype", pdfUrl: "https://drive.google.com/file/d/1OoBI6wiQex40pCXIO4CHlEM5qC5qhC1g/view?usp=drive_link", guidance: "VoiceAI - prev product folks/ techies - Years of Experience is not mandatory" },
  { id: "keemakr", name: "KeeMakr", company: "KeeMakr", brief: null, sector: "HealthTech", model: "B2B", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1gN8xgzQZZRNNCE1ebmTuMIF_JI9_NN46/view?usp=drive_link", guidance: null },
  { id: "vobiz-ai", name: "Vobiz AI", company: "Vobiz AI", brief: null, sector: "AI", model: "B2B", focus: "Market & Category Expansion", pdfUrl: "https://drive.google.com/file/d/1sbl-FZ0jwBvzkidKPzny-geM_1sW8Jko/view?usp=drive_link", guidance: "Techies preferred" },
  { id: "powerup-money", name: "PowerUp Money", company: "PowerUp Money", brief: null, sector: "Fintech", model: "B2C", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1ag-TdDeJ1EWv1UuiYyTVmgdgwS4c5mxj/view?usp=drive_link", guidance: "No freshers - preferred fintech" },
  { id: "kuku-1", name: "Kuku 1", company: "Kuku", brief: "AI Tool", sector: "Media & Entertainment", model: "B2C", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1oi_YhjzX1SvvebFMJpHIhXiZdaJBGy8I/view?usp=drive_link", guidance: null },
  { id: "kuku-2", name: "Kuku 2", company: "Kuku", brief: "MENA", sector: "Media & Entertainment", model: "B2C", focus: "Market & Category Expansion", pdfUrl: "https://drive.google.com/file/d/1mZLEiGg4AzsiUJxAP-WAbtIi5Zo-9XTL/view?usp=drive_link", guidance: null },
  { id: "even", name: "Even", company: "Even", brief: "Healthcare Broker Program", sector: "HealthTech", model: "B2C", focus: "New Segments & Channels", pdfUrl: "https://drive.google.com/file/d/1QWIGJIH-cYa9h7Cnc3kvcc9AHrdnL3eG/view?usp=drive_link", guidance: "3+ Years of Experience; prefer healthcare/insurance folks" },
  { id: "superliving-1", name: "Superliving 1", company: "Superliving", brief: "Hardware", sector: "HealthTech", model: "B2C", focus: "Product Strategy & Prototype", pdfUrl: "https://drive.google.com/file/d/1-rxeClhFxDsWzmxEMrDTyFF-nyz65nfz/view?usp=drive_link", guidance: null },
  { id: "superliving-2", name: "Superliving 2", company: "Superliving", brief: "GENESIS", sector: "HealthTech", model: "B2C", focus: "Customer Growth & Retention", pdfUrl: "https://drive.google.com/file/d/1t9pULAplkbu2iXJaih0ZWx5hZzifAg14/view?usp=drive_link", guidance: null },
  { id: "sirona", name: "Sirona", company: "Sirona", brief: null, sector: "Consumer Brand", model: "B2C", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1ihWYoWo2JiKEhfcHlLYlN25_kvj9xtWx/view?usp=drive_link", guidance: null },
  { id: "altm", name: "AltM", company: "AltM", brief: null, sector: "CleanTech and Renewable Energy", model: "B2B", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/10RHiVCy4HLhUYEc_8jv8LXLlziimPAnE/view?usp=drive_link", guidance: "They have a hiring bias for engineers or relevant exp - good way for students to break into this, they want a good business lens" },
  { id: "scispace", name: "SciSpace", company: "SciSpace", brief: null, sector: "AI", model: "B2B/B2C", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1-Xiy17eXUN4qa_GYzb5Rk2ey8NP9b7oK/view?usp=drive_link", guidance: null },
  { id: "allhome", name: "AllHome", company: "AllHome", brief: null, sector: "Real Estate/Home", model: "B2B/B2C", focus: "Customer Growth & Retention", pdfUrl: "https://drive.google.com/file/d/18EJPbpJWz5eIOUkWHMrcVPJH41vPj_eG/view?usp=drive_link", guidance: "People with influencer marketing/brand background - or someone who is a creator" },
  { id: "dashverse", name: "Dashverse", company: "Dashverse", brief: "Frameo Gaming", sector: "Media & Entertainment", model: "B2B/B2C", focus: "New Segments & Channels", pdfUrl: "https://drive.google.com/file/d/1joca60dwpDjbLs_75Z3r24Z4qEXqPZPQ/view?usp=drive_link", guidance: null },
  { id: "shopos-1", name: "ShopOS 1", company: "ShopOS", brief: "Sloosh", sector: "AI", model: "B2B", focus: "Customer Growth & Retention", pdfUrl: "https://drive.google.com/file/d/1d70Mluv49BGH8R90-sAvjdyorZq6bRW_/view?usp=drive_link", guidance: "They prefer someone who can work in a fast pace environment, hustle worthy people - they have a young team" },
  { id: "shopos-2", name: "ShopOS 2", company: "ShopOS", brief: "Jammie", sector: "AI", model: "B2B", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1tGttdrjRkedmXQ2U-jT-qMg_04oj1k3n/view?usp=drive_link", guidance: "They prefer someone who can work in a fast pace environment, hustle worthy people - they have a young team" },
  { id: "tata-1mg-1", name: "Tata 1mg 1", company: "Tata 1mg", brief: null, sector: "HealthTech", model: "B2C", focus: "Operations & Planning", pdfUrl: "https://drive.google.com/file/d/1kfvl2WCAj7ED-Unbqz5WN7GWsiNcppNq/view?usp=drive_link", guidance: "No freshers; 3-4 Years of Experience" },
  { id: "tata-1mg-2", name: "Tata 1mg 2", company: "Tata 1mg", brief: "Site Selection", sector: "HealthTech", model: "B2C", focus: "Operations & Planning", pdfUrl: "https://drive.google.com/file/d/1W4MNscUDWqfT7PjIRuNK5dkKpRCUmkdy/view?usp=drive_link", guidance: "No freshers; 3-4 Years of Experience" },
  { id: "salaryse", name: "SalarySe", company: "SalarySe", brief: null, sector: "Fintech", model: "B2B/B2C", focus: "Product Strategy & Prototype", pdfUrl: "https://drive.google.com/file/d/1yLAjVUfYEx3-5GYvYqxlsV-PxgKW3-gF/view?usp=drive_link", guidance: "Students interested in product." },
  { id: "rio-health", name: "Rio Health", company: "Rio Health", brief: "Retention", sector: "HealthTech", model: "B2C", focus: "Customer Growth & Retention", pdfUrl: "https://drive.google.com/file/d/11lfC0gwLXEfXtYNs8CGsgsDV7L-6wXa8/view?usp=drive_link", guidance: null },
  { id: "comet-1", name: "Comet 1", company: "Comet", brief: "Buying Journey", sector: "Consumer Brand", model: "B2C", focus: "Customer Growth & Retention", pdfUrl: "https://drive.google.com/file/d/1GsjV9q3rE8r60YeF50mO7NQWrYJL9lkW/view?usp=drive_link", guidance: null },
  { id: "comet-2", name: "Comet 2", company: "Comet", brief: "North India", sector: "Consumer Brand", model: "B2C", focus: "Market & Category Expansion", pdfUrl: "https://drive.google.com/file/d/1_fzgUoGGNSPpYJsiQoAV0Rb9QcHcDMS9/view?usp=drive_link", guidance: null },
  { id: "the-medical-travel-company", name: "The Medical Travel Company", company: "The Medical Travel Company", brief: null, sector: "HealthTech", model: "B2C", focus: "New Segments & Channels", pdfUrl: "https://drive.google.com/file/d/1iplcCMajHTmMiinqE8xaTB6b9JH5qi4V/view?usp=drive_link", guidance: null },
  { id: "toddle", name: "Toddle", company: "Toddle", brief: null, sector: "EdTech", model: "B2B", focus: "Marketing & Content", pdfUrl: "https://drive.google.com/file/d/1f8l4ut8VD_UmyPL7Hf05uD_kI4n0X8Nf/view?usp=drive_link", guidance: "They are looking for people who are good at execution" },
  { id: "padcare-labs", name: "PadCare Labs", company: "PadCare Labs", brief: "Orbit", sector: "CleanTech and Renewable Energy", model: "B2B/B2C", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1-nDiVzn5cGvacnl-MQiUelDCykkD0qPD/view?usp=drive_link", guidance: null },
  { id: "eleven-labs", name: "Eleven Labs", company: "Eleven Labs", brief: null, sector: "AI", model: "B2B", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1yVwG_5bCBU9dQvIzAQNsTKR0clMHE_jH/view?usp=drive_link", guidance: null },
  { id: "peakxv", name: "PeakXV", company: "PeakXV", brief: null, sector: "Venture Capital", model: "VC", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1annddagC-zTGcWrqSXrMU5Hlb_KxAQSk/view?usp=drive_link", guidance: "They need solid team with a vested interest in the venture capital world. Tech students preferred." },
  { id: "reo-dev", name: "Reo.Dev", company: "Reo.Dev", brief: null, sector: "AI", model: "B2B", focus: "Customer Growth & Retention", pdfUrl: "https://drive.google.com/file/d/1-5iPRiHqA6sXR4DD-MXWDtmNihV-mcEX/view?usp=drive_link", guidance: "AI fluency is imp and people with previous CX exp" },
  { id: "holiday-tribe-1", name: "Holiday Tribe 1", company: "Holiday Tribe", brief: "Referral", sector: "Travel", model: "B2C", focus: "Customer Growth & Retention", pdfUrl: "https://drive.google.com/file/d/1dHlvVjPf52sRj6RmomuIqhTy8ZIdbfSo/view?usp=drive_link", guidance: "Sales people preferred" },
  { id: "holiday-tribe-2", name: "Holiday Tribe 2", company: "Holiday Tribe", brief: null, sector: "Travel", model: "B2C", focus: "Product Strategy & Prototype", pdfUrl: "https://drive.google.com/file/d/1QhEF4ghX7u5cWeoaGVJqgd7Lyy4AWI45/view?usp=drive_link", guidance: "Techies wanting to go to PM roles preferred" },
  { id: "korrai", name: "KorrAI", company: "KorrAI", brief: "TRAIL", sector: "AI", model: "B2B", focus: "Market & Category Expansion", pdfUrl: "https://drive.google.com/file/d/1HE33pzbt3tYUwJ4eLSgbbjYVwWYBS_D_/view?usp=drive_link", guidance: null },
  { id: "circle", name: "Circle", company: "Circle", brief: null, sector: "E-commerce", model: "C2C", focus: "Marketing & Content", pdfUrl: "https://drive.google.com/file/d/1zsd7xeDG7bBYLgZdRKDnHBf8AbVbgTLr/view?usp=drive_link", guidance: null },
  { id: "zylabs-ai", name: "Zylabs AI", company: "Zylabs AI", brief: null, sector: "AI", model: "B2B", focus: "Product Strategy & Prototype", pdfUrl: "https://drive.google.com/file/d/11pi8lauNdf43SMYqNhyn5nXCztXcHo3K/view?usp=drive_link", guidance: "No freshers and can put sales people; combination of product + sales" },
  { id: "sauce-1", name: "Sauce 1", company: "Sauce", brief: null, sector: "Venture Capital", model: "VC", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/19u-hlRV9D2pfjpXG4JxAg4czCWeI5M56/view?usp=drive_link", guidance: null },
  { id: "sauce-2", name: "Sauce 2", company: "Sauce", brief: "Toys", sector: "Venture Capital", model: "VC", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1u5sPdGEQ1GxssMc2286Ybh9yXnTFp37f/view?usp=drive_link", guidance: null },
  { id: "square-yards-1", name: "Square Yards 1", company: "Square Yards", brief: "Brokers", sector: "Real Estate/Home", model: "B2B/B2C", focus: "Product Strategy & Prototype", pdfUrl: "https://drive.google.com/file/d/1ygOJYECBqb-6tM9X1oglVQsnbj6uhNP0/view?usp=drive_link", guidance: null },
  { id: "square-yards-2", name: "Square Yards 2", company: "Square Yards", brief: "Tier 2", sector: "Real Estate/Home", model: "B2B/B2C", focus: "Market & Category Expansion", pdfUrl: "https://drive.google.com/file/d/1PgbRDFn-vkzzQSOnLQ1DN5KiA12wmYzS/view?usp=drive_link", guidance: null },
  { id: "apna", name: "Apna", company: "Apna", brief: null, sector: "HR Tech", model: "B2B/B2C", focus: "Market Research & GTM", pdfUrl: "https://drive.google.com/file/d/1OQ7Lg_Cv5aj6F8VP6WfGAvhorqBeOFRs/view?usp=drive_link", guidance: null },
];

export const PROBLEM_STATEMENT_PICKS = 3;

/** Selections close at the end of 31 October 2026 (IST); matches private.problem_statement_deadline(). */
export const PROBLEM_STATEMENT_DEADLINE = new Date("2026-11-01T00:00:00+05:30");
export const PROBLEM_STATEMENT_DEADLINE_LABEL = "31 October";

const BY_ID = new Map(PROBLEM_STATEMENTS.map((s) => [s.id, s]));

export function problemStatement(id: string): ProblemStatement | undefined {
  return BY_ID.get(id);
}

export function problemStatementName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}

/** Sectors in catalogue order, each with its statements — for grouped dropdowns. */
export const PROBLEM_STATEMENTS_BY_SECTOR: ReadonlyArray<{ sector: string; statements: ProblemStatement[] }> = Array.from(
  PROBLEM_STATEMENTS.reduce((m, s) => m.set(s.sector, [...(m.get(s.sector) ?? []), s]), new Map<string, ProblemStatement[]>()),
  ([sector, statements]) => ({ sector, statements }),
).sort((a, b) => a.sector.localeCompare(b.sector));

export function problemStatementsClosed(now: Date = new Date()): boolean {
  return now.getTime() >= PROBLEM_STATEMENT_DEADLINE.getTime();
}

/** A full ranking can no longer change once the deadline has passed. */
export function problemStatementsLocked(picks: readonly string[], now: Date = new Date()): boolean {
  return picks.length >= PROBLEM_STATEMENT_PICKS && problemStatementsClosed(now);
}
