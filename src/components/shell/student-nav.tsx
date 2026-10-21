"use client";

import { Compass, Handshake, ListOrdered, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { Wordmark } from "@/components/ui/misc";

const ITEMS = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/shortlist", label: "Shortlist", icon: ListOrdered },
  { href: "/matches", label: "Matches", icon: Handshake },
  { href: "/me", label: "Profile", icon: UserRound },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/matches") return pathname.startsWith("/matches") || pathname.startsWith("/partnership");
  if (href === "/me") return pathname.startsWith("/me") || pathname.startsWith("/settings");
  return pathname.startsWith(href);
}

export function StudentNav({ openMatches, partnered, isAdmin = false }: { openMatches: number; partnered: boolean; isAdmin?: boolean }) {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop / tablet: top bar */}
      <header className="glass sticky top-0 z-40 hidden border-x-0 border-t-0 border-b-line md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/discover" aria-label="BSL Connect home">
            <Wordmark />
          </Link>
          <nav aria-label="Main">
            <ul className="flex items-center gap-1">
              {ITEMS.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                const target = href === "/matches" && partnered ? "/partnership" : href;
                return (
                  <li key={href}>
                    <Link
                      href={target}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition",
                        active ? "bg-forest-800 text-ivory-50" : "text-ink hover:bg-forest-800/6",
                      )}
                    >
                      <Icon className="size-4" aria-hidden />
                      {href === "/matches" && partnered ? "Partnership" : label}
                      {href === "/matches" && openMatches > 0 ? (
                        <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-sage-300 px-1.5 text-[0.7rem] font-semibold text-forest-900">
                          {openMatches}
                          <span className="sr-only"> open matches</span>
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
              {isAdmin ? (
                <li className="ml-2 border-l border-line pl-3">
                  <Link href="/admin" className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-forest-700 hover:bg-forest-800/6">
                    <ShieldCheck className="size-4" aria-hidden />
                    Admin
                  </Link>
                </li>
              ) : null}
            </ul>
          </nav>
        </div>
      </header>

      {/* Mobile: thumb-reachable bottom bar */}
      <nav
        aria-label="Main"
        className="glass fixed inset-x-0 bottom-0 z-40 border-x-0 border-b-0 border-t-line pb-[var(--safe-bottom)] md:hidden"
      >
        <ul className={cn("mx-auto grid h-[var(--nav-height)] max-w-md", isAdmin ? "grid-cols-5" : "grid-cols-4")}>
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            const target = href === "/matches" && partnered ? "/partnership" : href;
            return (
              <li key={href}>
                <Link
                  href={target}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex h-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium transition-colors",
                    active ? "text-forest-900" : "text-ink-subtle",
                  )}
                >
                  <span className={cn("relative flex h-8 w-14 items-center justify-center rounded-full transition-colors", active && "bg-sage-200/80")}>
                    <Icon className="size-[1.3rem]" strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                    {href === "/matches" && openMatches > 0 ? (
                      <span className="absolute top-0.5 right-2.5 size-2 rounded-full bg-forest-700 ring-2 ring-ivory-50">
                        <span className="sr-only">{openMatches} open matches</span>
                      </span>
                    ) : null}
                  </span>
                  {href === "/matches" && partnered ? "Partner" : label}
                </Link>
              </li>
            );
          })}
          {isAdmin ? (
            <li>
              <Link href="/admin" className="flex h-full flex-col items-center justify-center gap-1 text-[0.7rem] font-medium text-ink-subtle">
                <span className="flex h-8 w-14 items-center justify-center rounded-full">
                  <ShieldCheck className="size-[1.3rem]" strokeWidth={1.8} aria-hidden />
                </span>
                Admin
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>
    </>
  );
}
