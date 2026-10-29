import { notFound } from "next/navigation";
import { OnboardingWizard } from "@/components/onboarding/wizard";
import { getAIStatus } from "@/lib/ai/config";
import { getPublicProfile } from "@/lib/data/profiles";
import { requireStudent } from "@/lib/data/session";
import { problemStatementsClosed } from "@/lib/profile/problem-statements";
import { LAST_STEP } from "@/lib/profile/schema";

export const metadata = { title: "Your profile" };

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const viewer = await requireStudent("/onboarding");
  const profile = await getPublicProfile(viewer.db, viewer.id);
  if (!profile) notFound();

  const { step } = await searchParams;
  const requested = Number(typeof step === "string" ? step : NaN);
  const editing = profile.status === "published";
  const maxReachable = editing ? LAST_STEP : profile.onboarding_step;
  const initialStep = Number.isInteger(requested) && requested >= 1 && requested <= maxReachable ? requested : editing ? 1 : profile.onboarding_step;

  return (
    <OnboardingWizard
      initialProfile={profile}
      initialPhotoUrl={profile.photo_url}
      initialStep={initialStep}
      aiAvailable={getAIStatus().available}
      showDeadline={!problemStatementsClosed()}
    />
  );
}
