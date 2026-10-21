"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function StudentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="surface rounded-[var(--radius-card)] shadow-soft">
      <EmptyState
        icon={<TriangleAlert className="size-6" />}
        title="We couldn't load this page"
        action={
          <Button onClick={reset} icon={<RotateCcw className="size-4" />}>
            Try again
          </Button>
        }
      >
        Check your connection and try again. If it keeps happening, let the programme team know.
      </EmptyState>
    </div>
  );
}
