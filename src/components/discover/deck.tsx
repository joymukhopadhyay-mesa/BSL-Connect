"use client";

import { Compass, Handshake, Info, ListOrdered, SlidersHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { decide, reconsiderPass, withdrawLike } from "@/app/(student)/actions";
import { CompatibilityPanel } from "@/components/matching/compatibility-panel";
import { ProfileDetail } from "@/components/profile/profile-detail";
import { ReportButton } from "@/components/profile/report-button";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { EmptyState, ProfilePhoto } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { FiltersSheet } from "./filters-sheet";
import { ProfileCard } from "./profile-card";
import { activeFilterCount, EMPTY_FILTERS, matchesFilters, type Candidate, type Filters } from "./types";

const SWIPE_THRESHOLD = 110;

export function DiscoveryDeck({
  initialCandidates,
  myPhotoUrl,
  myName,
  myStatements,
  aiAvailable,
}: {
  initialCandidates: Candidate[];
  myPhotoUrl: string | null;
  myName: string | null;
  myStatements: string[];
  aiAvailable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [queue, setQueue] = useState(initialCandidates);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [match, setMatch] = useState<{ candidate: Candidate; matchId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState({ dx: 0, active: false });
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => queue.filter((c) => matchesFilters(c, filters)), [queue, filters]);
  const current = visible[0] ?? null;
  const next = visible[1] ?? null;
  const filterCount = activeFilterCount(filters);

  const act = useCallback(
    async (candidate: Candidate, decision: "like" | "pass") => {
      if (busy) return;
      setBusy(true);
      setExiting(decision === "like" ? "right" : "left");
      await new Promise((r) => setTimeout(r, 220));
      // Optimistically remove; restore on failure.
      setQueue((q) => q.filter((c) => c.id !== candidate.id));
      setExiting(null);
      setDrag({ dx: 0, active: false });
      const res = await decide(candidate.id, decision);
      setBusy(false);
      if (!res.ok) {
        setQueue((q) => [candidate, ...q.filter((c) => c.id !== candidate.id)]);
        toast.show(res.error, { tone: "error" });
        return;
      }
      const first = candidate.full_name?.split(" ")[0] ?? "this student";
      if (decision === "like" && res.data.matched && res.data.match_id) {
        setMatch({ candidate, matchId: res.data.match_id });
        router.refresh();
        return;
      }
      const undo = async () => {
        const r = decision === "like" ? await withdrawLike(candidate.id) : await reconsiderPass(candidate.id);
        if (r.ok) setQueue((q) => [candidate, ...q.filter((c) => c.id !== candidate.id)]);
        else toast.show(r.error, { tone: "error" });
      };
      toast.show(decision === "like" ? `${first} added to your shortlist` : `Passed on ${first}`, {
        tone: "success",
        action: { label: "Undo", onClick: undo },
      });
    },
    [busy, router, toast],
  );

  // Keyboard: ← pass, → interested, Enter / i view profile (when the deck has focus).
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (!current || detail || match || filtersOpen) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        void act(current, "pass");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        void act(current, "like");
      } else if (e.key === "Enter" || e.key.toLowerCase() === "i") {
        e.preventDefault();
        setDetail(current);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [current, detail, match, filtersOpen, act]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (busy || e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ dx: 0, active: true });
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    setDrag({ dx: e.clientX - start.current.x, active: true });
  }
  function onPointerUp() {
    if (!start.current || !current) return;
    const dx = drag.dx;
    start.current = null;
    if (dx > SWIPE_THRESHOLD) void act(current, "like");
    else if (dx < -SWIPE_THRESHOLD) void act(current, "pass");
    else if (Math.abs(dx) < 6) {
      setDrag({ dx: 0, active: false });
      setDetail(current);
    } else setDrag({ dx: 0, active: false });
  }

  const dx = exiting === "right" ? 640 : exiting === "left" ? -640 : drag.dx;
  const intent = dx > 40 ? "like" : dx < -40 ? "pass" : null;
  const intentOpacity = Math.min(Math.abs(dx) / SWIPE_THRESHOLD, 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[2.2rem] leading-none text-forest-900 md:text-[2.6rem]">Discover</h1>
          <p className="mt-1 text-sm text-ink-muted" aria-live="polite">
            {visible.length} potential {visible.length === 1 ? "partner" : "partners"}
            {filterCount ? " match your filters" : ""}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setFiltersOpen(true)} icon={<SlidersHorizontal className="size-4" />}>
          Filters
          {filterCount ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-forest-800 px-1.5 text-[0.7rem] text-ivory-50">{filterCount}</span>
          ) : null}
        </Button>
      </div>

      {current ? (
        <div className="grid items-start gap-8 md:grid-cols-[minmax(0,25rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-5">
            <div
              ref={deckRef}
              tabIndex={0}
              role="group"
              aria-roledescription="profile card"
              aria-label={`${current.full_name}. Press right arrow if interested, left arrow to pass, Enter to view the full profile.`}
              className="relative h-[clamp(21rem,calc(100dvh-var(--nav-height)-var(--ticker-height)-var(--safe-bottom)-var(--safe-top)-15rem),38rem)] w-full rounded-[var(--radius-card)] outline-none focus-visible:ring-4 focus-visible:ring-forest-600/30 md:h-[36rem]"
            >
              {next ? (
                <div className="absolute inset-0 scale-[0.95] translate-y-3 opacity-70 transition-transform duration-300" aria-hidden>
                  <ProfileCard candidate={next} />
                </div>
              ) : null}
              <div
                key={current.id}
                className={cn(
                  "absolute inset-0 animate-pop cursor-grab touch-pan-y active:cursor-grabbing",
                  !drag.active && "transition-transform duration-300 ease-[var(--ease-out-soft)]",
                )}
                style={{ transform: `translateX(${dx}px) rotate(${dx / 24}deg)` }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => {
                  start.current = null;
                  setDrag({ dx: 0, active: false });
                }}
              >
                <ProfileCard candidate={current} priority />
                {intent ? (
                  <div
                    className={cn(
                      "pointer-events-none absolute top-5 rounded-full px-4 py-2 text-sm font-semibold shadow-float",
                      intent === "like" ? "right-5 bg-sage-200 text-forest-900" : "left-5 bg-white text-ink",
                    )}
                    style={{ opacity: intentOpacity }}
                    aria-hidden
                  >
                    {intent === "like" ? "Interested" : "Pass"}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-center gap-5" role="group" aria-label="Decide on this profile">
              <div className="flex flex-col items-center gap-1.5">
                <IconButton label={`Pass on ${current.full_name}`} variant="secondary" size="lg" onClick={() => act(current, "pass")} disabled={busy} className="shadow-float">
                  <X className="size-6" />
                </IconButton>
                <span className="text-xs text-ink-muted [@media(max-height:700px)]:sr-only">Pass</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <IconButton label={`View ${current.full_name}'s full profile`} variant="glass" size="md" onClick={() => setDetail(current)}>
                  <Info className="size-5" />
                </IconButton>
                <span className="text-xs text-ink-muted [@media(max-height:700px)]:sr-only">Profile</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <IconButton label={`Interested in partnering with ${current.full_name}`} variant="primary" size="lg" onClick={() => act(current, "like")} disabled={busy} className="shadow-lift">
                  <Handshake className="size-6" />
                </IconButton>
                <span className="text-xs text-ink-muted [@media(max-height:700px)]:sr-only">Interested</span>
              </div>
            </div>
            <p className="max-w-xs text-center text-xs leading-relaxed text-ink-subtle">
              “Interested” is private. It only becomes a mutual match if {current.full_name?.split(" ")[0]} is interested in you too.
            </p>
          </div>

          {/* Desktop: use the extra space for the reasoning, not a bigger photo */}
          <aside className="surface hidden max-h-[calc(100dvh-8rem)] overflow-y-auto rounded-[var(--radius-card)] p-7 shadow-soft md:block" aria-label="Why this profile">
            <p className="text-xs font-semibold tracking-[0.08em] text-forest-700 uppercase">Why you might work well together</p>
            <div className="mt-4">
              <CompatibilityPanel
                key={current.id}
                compatibility={current.compatibility}
                insights={current.insights}
                candidateId={current.id}
                candidateName={current.full_name ?? ""}
                aiAvailable={aiAvailable}
              />
            </div>
            <Button variant="secondary" className="mt-6 w-full" onClick={() => setDetail(current)}>
              Read {current.full_name?.split(" ")[0]}&apos;s full profile
            </Button>
          </aside>
        </div>
      ) : (
        <div className="surface rounded-[var(--radius-card)] shadow-soft">
          {filterCount ? (
            <EmptyState
              icon={<SlidersHorizontal className="size-6" />}
              title="No profiles match these filters"
              action={<Button onClick={() => setFilters(EMPTY_FILTERS)}>Reset filters</Button>}
            >
              Try removing a filter or two — your next great collaborator might be one profile away.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<Compass className="size-6" />}
              title="You've reached the end of your discovery list"
              action={
                <>
                  <ButtonLink href="/shortlist" icon={<ListOrdered className="size-4" />}>
                    Review your shortlist
                  </ButtonLink>
                  <ButtonLink href="/matches" variant="secondary">
                    See matches
                  </ButtonLink>
                </>
              }
            >
              New classmates appear here as they publish their profiles. You can also revisit profiles you passed on from your shortlist page.
            </EmptyState>
          )}
        </div>
      )}

      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} candidates={queue} value={filters} onChange={setFilters} myStatements={myStatements} />

      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.full_name ?? "Profile"}
        hideTitle
        size="lg"
        footer={
          detail ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <ReportButton reportedId={detail.id} name={detail.full_name ?? ""} />
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const d = detail;
                    setDetail(null);
                    void act(d, "pass");
                  }}
                  disabled={busy}
                >
                  Pass
                </Button>
                <Button
                  onClick={() => {
                    const d = detail;
                    setDetail(null);
                    void act(d, "like");
                  }}
                  disabled={busy}
                  icon={<Handshake className="size-4" />}
                >
                  Interested
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {detail ? (
          <div className="flex flex-col gap-8">
            <div className="overflow-hidden rounded-[1.4rem]">
              <ProfilePhoto src={detail.photo_url} name={detail.full_name} className="aspect-[4/3] w-full text-5xl sm:aspect-[16/9]" rounded="rounded-[1.4rem]" />
            </div>
            <ProfileDetail profile={detail} showPhoto={false} />
            <div className="border-t border-line pt-6 md:hidden">
              <h3 className="mb-4 text-[0.8rem] font-semibold tracking-[0.08em] text-forest-700 uppercase">Compatibility insights</h3>
              <CompatibilityPanel
                compatibility={detail.compatibility}
                insights={detail.insights}
                candidateId={detail.id}
                candidateName={detail.full_name ?? ""}
                aiAvailable={aiAvailable}
              />
            </div>
          </div>
        ) : null}
      </Sheet>

      <Sheet open={Boolean(match)} onClose={() => setMatch(null)} title="Mutual match" hideTitle size="sm">
        {match ? (
          <div className="flex flex-col items-center pb-2 text-center">
            <div className="flex animate-pop items-center">
              <ProfilePhoto src={myPhotoUrl} name={myName} className="size-24 border-4 border-ivory-50 text-2xl shadow-float" />
              <ProfilePhoto src={match.candidate.photo_url} name={match.candidate.full_name} className="-ml-5 size-24 border-4 border-ivory-50 text-2xl shadow-float" />
            </div>
            <p className="mt-6 text-sm font-medium text-forest-600">Mutual match</p>
            <h2 className="mt-1 font-display text-[2.3rem] leading-tight text-forest-900">
              You and {match.candidate.full_name?.split(" ")[0]} are both interested
            </h2>
            <p className="mt-3 max-w-sm leading-relaxed text-ink-muted">
              Review your compatibility, talk it through, and decide whether to confirm your partnership. Nothing is final until you both confirm.
            </p>
            <div className="mt-7 flex w-full flex-col gap-2">
              <ButtonLink href={`/matches/${match.matchId}`} size="lg">
                Review compatibility
              </ButtonLink>
              <Button variant="ghost" onClick={() => setMatch(null)}>
                Keep discovering
              </Button>
            </div>
          </div>
        ) : null}
      </Sheet>
    </div>
  );
}

export function PartneredDiscoverState() {
  return (
    <div className="surface rounded-[var(--radius-card)] shadow-soft">
      <EmptyState
        icon={<Handshake className="size-6" />}
        title="You have a confirmed BSL partner"
        action={<ButtonLink href="/partnership">View your partnership</ButtonLink>}
      >
        Discovery is paused while your partnership is active. If something changes, you can ask the programme team to review it from your
        partnership page.
      </EmptyState>
    </div>
  );
}

