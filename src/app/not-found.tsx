import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Wordmark } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center px-4">
      <Wordmark className="mb-6" />
      <div className="surface w-full rounded-[var(--radius-card)] shadow-soft">
        <EmptyState icon={<Compass className="size-6" />} title="This page isn't available" action={<ButtonLink href="/">Go to BSL Connect</ButtonLink>}>
          The page may have moved, or the profile may no longer be visible to you.
        </EmptyState>
      </div>
    </main>
  );
}
