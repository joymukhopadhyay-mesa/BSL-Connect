import { redirect } from "next/navigation";
import { Wordmark } from "@/components/ui/misc";
import { isDatabaseConfigured } from "@/lib/env";
import { getViewer, homeFor } from "@/lib/data/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in" };

const PRINCIPLES = [
  { title: "Discover", body: "Browse verified classmates and how they like to work." },
  { title: "Understand", body: "See complementary skills and shared interests, explained." },
  { title: "Partner", body: "Confirm a partnership only when you both agree." },
];

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  if (isDatabaseConfigured()) {
    const viewer = await getViewer();
    if (viewer) redirect(homeFor(viewer.status));
  }

  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative overflow-hidden bg-forest-800 px-6 pt-[calc(1.75rem+var(--safe-top))] pb-14 text-ivory-50 sm:px-10 lg:flex lg:min-h-dvh lg:flex-col lg:justify-between lg:px-14 lg:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              "radial-gradient(40rem 28rem at 85% 0%, rgba(185,203,180,0.28), transparent 60%), radial-gradient(36rem 30rem at 0% 100%, rgba(7,26,20,0.7), transparent 65%)",
          }}
        />
        <div className="relative">
          <Wordmark inverted />
          <p className="mt-1 pl-[2.375rem] text-xs tracking-wide text-sage-300/80">MESA School of Business</p>
        </div>
        <div className="relative mt-12 max-w-xl lg:mt-0">
          <p className="text-sm font-medium tracking-wide text-sage-300">Business Strategy Labs</p>
          <h1 className="mt-3 font-display text-[2.9rem] leading-[0.98] tracking-[-0.01em] text-balance sm:text-[3.6rem] lg:text-[4.4rem]">
            Find the partner who <em className="text-sage-300">completes</em> your thinking.
          </h1>
          <p className="mt-5 max-w-md text-[1.02rem] leading-relaxed text-ivory-100/80">
            Discover classmates, understand how they work, and build something meaningful together.
          </p>
        </div>
        <ol className="relative mt-10 hidden gap-6 lg:grid lg:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <li key={p.title} className="border-t border-white/15 pt-4">
              <span className="text-xs tabular-nums text-sage-300/80">0{i + 1}</span>
              <p className="mt-1 font-medium">{p.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ivory-100/65">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Form */}
      <section className="relative -mt-6 flex justify-center rounded-t-[1.75rem] bg-ivory-100 px-4 pt-8 pb-[calc(2rem+var(--safe-bottom))] sm:px-6 lg:mt-0 lg:items-center lg:rounded-none lg:py-14">
        <div className="w-full max-w-md">
          <SignInForm next={typeof next === "string" ? next : null} configured={isDatabaseConfigured()} />
        </div>
      </section>
    </main>
  );
}
