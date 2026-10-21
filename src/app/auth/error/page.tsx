import { MailWarning } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Wordmark } from "@/components/ui/misc";

export const metadata = { title: "Sign-in link problem" };

const COPY: Record<string, { title: string; body: string }> = {
  expired: {
    title: "This sign-in link has expired",
    body: "Links and codes are valid for a short time and can only be used once. Request a new one to continue.",
  },
  invalid: {
    title: "This sign-in link isn't valid",
    body: "It may have been used already or copied incompletely. Request a new link or code from the sign-in page.",
  },
};

export default async function AuthErrorPage({ searchParams }: PageProps<"/auth/error">) {
  const { reason } = await searchParams;
  const copy = COPY[typeof reason === "string" ? reason : ""] ?? COPY.invalid!;
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4">
      <Wordmark className="mb-6" />
      <div className="surface w-full rounded-[var(--radius-card)] shadow-soft">
        <EmptyState icon={<MailWarning className="size-6" />} title={copy.title} action={<ButtonLink href="/sign-in">Back to sign in</ButtonLink>}>
          {copy.body}
        </EmptyState>
      </div>
    </main>
  );
}
