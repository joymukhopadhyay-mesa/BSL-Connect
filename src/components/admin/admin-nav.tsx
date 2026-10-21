"use client";

import { Compass, Flag, Handshake, LayoutGrid, LogOut, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/sign-in/actions";
import { cn } from "@/components/ui/cn";
import { Wordmark } from "@/components/ui/misc";

const ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/admin/students", label: "Students", icon: Users },
  { href: "/admin/partnerships", label: "Partnerships", icon: Handshake },
  { href: "/admin/reports", label: "Reports", icon: Flag },
] as const;

export function AdminNav({ email, openReports, isStudent = false }: { email: string; openReports: number; isStudent?: boolean }) {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 bg-forest-900 pt-[var(--safe-top)] text-ivory-50">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Wordmark inverted />
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-sage-300">Programme team</span>
        </div>
        <div className="flex items-center gap-3">
          {isStudent ? (
            <Link href="/discover" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-medium hover:bg-white/15">
              <Compass className="size-3.5" aria-hidden /> Student view
            </Link>
          ) : null}
          <span className="hidden text-xs text-ivory-100/60 sm:inline">{email}</span>
          <form action={signOut}>
            <button type="submit" className="inline-flex size-9 items-center justify-center rounded-full hover:bg-white/10" aria-label="Sign out" title="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
      <nav aria-label="Admin" className="mx-auto max-w-7xl overflow-x-auto px-2 sm:px-4 [scrollbar-width:none]">
        <ul className="flex min-w-max gap-1 pb-2">
          {ITEMS.map(({ href, label, icon: Icon, ...rest }) => {
            const active = "exact" in rest ? pathname === href : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition",
                    active ? "bg-ivory-50 text-forest-900" : "text-ivory-100/80 hover:bg-white/10",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {label}
                  {href === "/admin/reports" && openReports > 0 ? (
                    <span className="rounded-full bg-sage-300 px-1.5 text-[0.7rem] font-semibold text-forest-900">{openReports}</span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
