"use client";

import { EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { unpublishProfile } from "@/app/onboarding/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Lets a student hide their published profile from discovery (back to draft). */
export function VisibilityToggle({ published, partnered }: { published: boolean; partnered: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  if (!published || partnered) return null;
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-line bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-ink-muted">Your profile is live in discovery. You can hide it at any time and republish later.</p>
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        icon={<EyeOff className="size-4" />}
        onClick={() =>
          startTransition(async () => {
            const res = await unpublishProfile();
            if (!res.ok) {
              toast.show(res.error, { tone: "error" });
              return;
            }
            toast.show("Your profile is hidden from discovery.", { tone: "success" });
            router.refresh();
          })
        }
      >
        Hide from discovery
      </Button>
    </div>
  );
}
