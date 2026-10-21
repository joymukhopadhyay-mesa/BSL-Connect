import { describe, expect, it } from "vitest";
import { pairInsights } from "@/lib/matching/insights";
import { rankCandidates, scoreCompatibility } from "@/lib/matching/scoring";
import { DEFAULT_WEIGHTS } from "@/lib/matching/weights";
import { makeProfile } from "./fixtures";

const you = makeProfile();

describe("deterministic compatibility scoring", () => {
  it("gives identical results for identical inputs", () => {
    const they = makeProfile({ strengths: ["Finance", "Data analytics"] });
    const a = scoreCompatibility(you, they);
    const b = scoreCompatibility(structuredClone(you), structuredClone(they));
    expect(a).toEqual(b);
  });

  it("weights sum to 1 and invalid weights are rejected", () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((s, w) => s + w, 0)).toBeCloseTo(1);
    expect(() => scoreCompatibility(you, you, { ...DEFAULT_WEIGHTS, complementarity: 0.9 })).toThrow(/sum to 1/);
  });

  it("rewards complementary strengths over identical ones", () => {
    const complementary = makeProfile({ strengths: ["Finance", "Data analytics"], partner_skills: ["Research", "Marketing"], development_areas: ["Marketing"] });
    const identical = makeProfile({ strengths: ["Research", "Marketing"], partner_skills: ["Finance"], development_areas: ["Finance"] });
    const c = scoreCompatibility(you, complementary).factors.find((f) => f.key === "complementarity")!;
    const i = scoreCompatibility(you, identical).factors.find((f) => f.key === "complementarity")!;
    expect(c.score!).toBeGreaterThan(i.score!);
    expect(c.evidence.join(" ")).toMatch(/Finance/);
  });

  it("keeps experience and interest distinct", () => {
    // Same interests, but only one candidate has *worked* in what you want to explore.
    const experienced = makeProfile({ industries_experience: ["Fintech and financial services"] });
    const curious = makeProfile({ industries_experience: [] });
    const e = scoreCompatibility(you, experienced).factors.find((f) => f.key === "experience")!;
    const c = scoreCompatibility(you, curious).factors.find((f) => f.key === "experience")!;
    const ie = scoreCompatibility(you, experienced).factors.find((f) => f.key === "industry")!;
    const ic = scoreCompatibility(you, curious).factors.find((f) => f.key === "industry")!;
    expect(e.score!).toBeGreaterThan(c.score!);
    expect(ie.score).toBe(ic.score); // interest alignment unaffected by experience
  });

  it("does not treat any working style as better: swapping styles gives the same score", () => {
    const structured = makeProfile({ questionnaire: { answers: { ...you.questionnaire.answers, working_style: "structured", execution: "plan_ahead" } } });
    const exploratory = makeProfile({ questionnaire: { answers: { ...you.questionnaire.answers, working_style: "exploratory", execution: "iterate_quickly" } } });
    const a = scoreCompatibility(structured, exploratory).factors.find((f) => f.key === "workingStyle")!.score;
    const b = scoreCompatibility(exploratory, structured).factors.find((f) => f.key === "workingStyle")!.score;
    expect(a).toBe(b);
    // A difference is a moderate score, never zero.
    expect(a!).toBeGreaterThan(0.6);
  });

  it("reports insufficient data instead of a misleading low score", () => {
    const sparse = makeProfile({
      strengths: [], development_areas: [], partner_skills: [], industries_interest: [], industries_experience: [],
      career_objective: null, questionnaire: {},
    });
    const r = scoreCompatibility(you, sparse);
    expect(r.score).toBeNull();
    expect(r.band).toBe("insufficient");
    expect(r.factors.some((f) => f.score === null)).toBe(true);
  });

  it("rounds to the nearest 5 to avoid false precision", () => {
    const r = scoreCompatibility(you, makeProfile({ strengths: ["Finance"] }));
    expect(r.score! % 5).toBe(0);
  });

  it("explanations reference only submitted data", () => {
    const they = makeProfile({ strengths: ["Finance"], industries_interest: ["Consumer technology"] });
    const evidence = scoreCompatibility(you, they).factors.flatMap((f) => f.evidence).join(" ");
    expect(evidence).toMatch(/Finance/);
    expect(evidence).toMatch(/Consumer technology/);
    expect(evidence).not.toMatch(/Healthcare|Manufacturing/);
  });

  it("ranks deterministically and never drops low scorers", () => {
    const a = { ...makeProfile({ id: "b" }), compatibility: scoreCompatibility(you, makeProfile({ strengths: ["Finance", "Data analytics"] })) };
    const b = { ...makeProfile({ id: "a" }), compatibility: scoreCompatibility(you, makeProfile({ strengths: ["Research"] })) };
    const c = { ...makeProfile({ id: "c" }), compatibility: { ...b.compatibility, score: null, band: "insufficient" as const } };
    const ranked = rankCandidates([c, b, a]);
    expect(ranked).toHaveLength(3);
    expect(ranked[0]!.id).toBe("b");
    expect(ranked[2]!.id).toBe("c");
    expect(rankCandidates([a, b, c]).map((x) => x.id)).toEqual(ranked.map((x) => x.id));
  });
});

describe("pair insights", () => {
  it("identifies complements, overlaps, shared interests, gaps and discussion prompts", () => {
    const they = makeProfile({
      strengths: ["Finance", "Research"],
      development_areas: ["Marketing"],
      partner_skills: ["Marketing"],
      industries_experience: ["Fintech and financial services"],
      questionnaire: { answers: { ...you.questionnaire.answers, ownership: "collaborative" } },
    });
    const i = pairInsights(you, they);
    expect(i.complementaryForYou).toEqual(["Finance"]);
    expect(i.complementaryForThem).toEqual(["Marketing"]);
    expect(i.overlapping).toEqual(["Research"]);
    expect(i.sharedInterests).toContain("Consumer technology");
    expect(i.theyHaveWorkedIn).toEqual(["Fintech and financial services"]);
    expect(i.combinedGaps).toEqual(expect.arrayContaining(["Strategy", "Data analytics", "Communication"]));
    expect(i.styleDifferences.map((d) => d.key)).toContain("ownership");
    expect(i.discussionQuestions.length).toBeGreaterThan(0);
    expect(i.discussionQuestions.length).toBeLessThanOrEqual(5);
  });
});
