"use client";

import { ArrowDown, ArrowUp, Check, ChevronsUp, ListOrdered, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { reconsiderPass, saveShortlistOrder, withdrawLike } from "@/app/(student)/actions";
import { BandBadge } from "@/components/matching/compatibility-panel";
import { ButtonLink, IconButton } from "@/components/ui/button";
import { Tag } from "@/components/ui/chips";
import { EmptyState, ProfilePhoto } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import type { CompatibilityResult } from "@/lib/matching/scoring";
import type { MatchStatus } from "@/lib/profile/types";

export type ShortlistEntry = {
  id: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
  compatibility: CompatibilityResult | null;
  rank: number | null;
  match: { id: string; status: MatchStatus } | null;
};

const MATCH_LABEL: Partial<Record<MatchStatus, string>> = {
  mutual: "Mutual match",
  pending_confirmation: "Confirmation in progress",
  finalised: "Partner",
  declined: "Match closed",
  closed: "No longer available",
  cancelled: "Partnership cancelled",
};

export function ShortlistManager({ initialLiked, passed }: { initialLiked: ShortlistEntry[]; passed: ShortlistEntry[] }) {
  const toast = useToast();
  const [items, setItems] = useState(initialLiked);
  const [passedItems, setPassedItems] = useState(passed);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [, startTransition] = useTransition();
  const timer = useRef<number | null>(null);
  const live = useRef<HTMLParagraphElement>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  function persist(next: ShortlistEntry[]) {
    setSaveState("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      startTransition(async () => {
        const res = await saveShortlistOrder(next.map((i) => i.id));
        setSaveState(res.ok ? "saved" : "error");
        if (!res.ok) toast.show(res.error, { tone: "error" });
      });
    }, 500);
  }

  function move(index: number, to: number) {
    if (to < 0 || to >= items.length || index === to) return;
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item!);
    setItems(next);
    if (live.current) live.current.textContent = `${item!.name} moved to position ${to + 1} of ${next.length}.`;
    persist(next);
  }

  async function remove(entry: ShortlistEntry) {
    const res = await withdrawLike(entry.id);
    if (!res.ok) {
      toast.show(res.error, { tone: "error" });
      return;
    }
    setItems((all) => all.filter((i) => i.id !== entry.id));
    toast.show(`${entry.name.split(" ")[0]} removed from your shortlist`, { tone: "success" });
  }

  async function reconsider(entry: ShortlistEntry) {
    const res = await reconsiderPass(entry.id);
    if (!res.ok) {
      toast.show(res.error, { tone: "error" });
      return;
    }
    setPassedItems((all) => all.filter((i) => i.id !== entry.id));
    toast.show(`${entry.name.split(" ")[0]} is back in your discovery list`, { tone: "success" });
  }

  return (
    <div className="flex flex-col gap-10">
      <p ref={live} className="sr-only" aria-live="polite" />
      {items.length === 0 ? (
        <div className="surface rounded-[var(--radius-card)] shadow-soft">
          <EmptyState icon={<ListOrdered className="size-6" />} title="Your shortlist is empty" action={<ButtonLink href="/discover">Discover partners</ButtonLink>}>
            When you mark someone as “Interested”, they appear here so you can compare and rank them.
          </EmptyState>
        </div>
      ) : (
        <section aria-labelledby="ranked-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="ranked-heading" className="text-sm font-semibold text-ink">
              Your ranking
            </h2>
            <span className="flex items-center gap-1.5 text-xs text-ink-muted" aria-live="polite">
              {saveState === "saving" ? (
                <>
                  <Spinner className="size-3.5" /> Saving…
                </>
              ) : saveState === "saved" ? (
                <>
                  <Check className="size-3.5" /> Saved
                </>
              ) : saveState === "error" ? (
                "Not saved"
              ) : null}
            </span>
          </div>
          <ol className="flex flex-col gap-2.5">
            {items.map((item, index) => (
              <li key={item.id} className="surface flex items-center gap-3 rounded-2xl p-3 shadow-soft transition-all sm:gap-4 sm:p-4">
                <span className="w-6 shrink-0 text-center font-display text-2xl text-forest-700 tabular-nums" aria-label={`Rank ${index + 1}`}>
                  {index + 1}
                </span>
                <ProfilePhoto src={item.photoUrl} name={item.name} className="size-14 shrink-0 text-lg" rounded="rounded-2xl" />
                <div className="min-w-0 flex-1">
                  <Link href={`/students/${item.id}`} className="block truncate font-medium text-ink hover:underline">
                    {item.name}
                  </Link>
                  <p className="truncate text-sm text-ink-muted">{item.role}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {item.match && MATCH_LABEL[item.match.status] ? (
                      <Link href={item.match.status === "finalised" ? "/partnership" : `/matches/${item.match.id}`}>
                        <Tag tone={["mutual", "pending_confirmation", "finalised"].includes(item.match.status) ? "forest" : "outline"}>
                          {MATCH_LABEL[item.match.status]}
                        </Tag>
                      </Link>
                    ) : null}
                    {item.compatibility ? <BandBadge compatibility={item.compatibility} className="!py-1" /> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <IconButton label={`Move ${item.name} up`} variant="ghost" size="sm" onClick={() => move(index, index - 1)} disabled={index === 0}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton label={`Move ${item.name} down`} variant="ghost" size="sm" onClick={() => move(index, index + 1)} disabled={index === items.length - 1}>
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton label={`Move ${item.name} to the top`} variant="ghost" size="sm" onClick={() => move(index, 0)} disabled={index === 0} className="hidden sm:inline-flex">
                    <ChevronsUp className="size-4" />
                  </IconButton>
                  {!item.match || ["declined", "closed", "cancelled"].includes(item.match.status) ? (
                    <IconButton label={`Remove ${item.name} from shortlist`} variant="ghost" size="sm" onClick={() => remove(item)}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
            If you have more than one mutual match, your ranking helps you decide who to confirm first. Only a mutual “Interested” creates a
            match, and only both of you confirming creates a partnership.
          </p>
        </section>
      )}

      {passedItems.length ? (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2 rounded-full px-1 py-1 hover:text-forest-700">
              Profiles you passed on ({passedItems.length})
              <span className="text-xs font-normal text-ink-muted group-open:hidden">Show</span>
            </span>
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {passedItems.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white/60 p-3">
                <ProfilePhoto src={p.photoUrl} name={p.name} className="size-11 shrink-0 text-base" rounded="rounded-xl" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{p.name}</p>
                  <p className="truncate text-xs text-ink-muted">{p.role}</p>
                </div>
                <button
                  type="button"
                  onClick={() => reconsider(p)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 text-sm font-medium text-forest-800 hover:bg-white"
                >
                  <RotateCcw className="size-3.5" /> Reconsider
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
