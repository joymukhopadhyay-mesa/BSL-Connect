"use client";

import { ArrowLeft, ArrowRight, MailCheck, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { checkEmail, EMAIL_CHECK_MESSAGES, STUDENT_EMAIL_DOMAIN } from "@/lib/auth/domain";
import { requestSignInCode, verifySignInCode } from "./actions";

const RESEND_SECONDS = 60;

export function SignInForm({ next, configured }: { next: string | null; configured: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "success">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [pending, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  function sendCode() {
    setError(null);
    setExpired(false);
    const check = checkEmail(email);
    if (!check.ok) {
      setError(EMAIL_CHECK_MESSAGES[check.reason]);
      return;
    }
    startTransition(async () => {
      const res = await requestSignInCode(check.email);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmail(check.email);
      setCode("");
      setStep("code");
      setCooldown(RESEND_SECONDS);
    });
  }

  function verify(value = code) {
    setError(null);
    if (!/^\d{6}$/.test(value)) {
      setError("Enter the code from your email.");
      return;
    }
    startTransition(async () => {
      const res = await verifySignInCode(email, value, next);
      if (!res.ok) {
        setError(res.error);
        setExpired(res.reason === "expired");
        return;
      }
      setStep("success");
      router.replace(res.redirectTo ?? "/");
      router.refresh();
    });
  }

  if (!configured) {
    return (
      <Notice tone="warning" title="Sign-in isn't configured yet">
        This deployment is missing its server configuration. See <a className="underline" href="/setup">the setup page</a>.
      </Notice>
    );
  }

  if (step === "success") {
    return (
      <div className="flex flex-col items-center py-16 text-center animate-fade" role="status">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-sage-100 text-forest-700">
          <ShieldCheck className="size-6" />
        </div>
        <h2 className="mt-5 font-display text-3xl text-forest-900">You&apos;re verified</h2>
        <p className="mt-2 text-ink-muted">Taking you to BSL Connect…</p>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      {step === "email" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendCode();
          }}
          noValidate
          className="flex flex-col gap-6"
        >
          <div>
            <h2 className="font-display text-[2.2rem] leading-tight text-forest-900">Sign in</h2>
            <p className="mt-2 leading-relaxed text-ink-muted">
              For verified MESA students in Business Strategy Labs. We&apos;ll email you a one-time code — no password needed.
            </p>
          </div>
          <Field
            label="MESA email address"
            hint={
              <>
                Use your student address ending in <span className="font-medium text-forest-800">@{STUDENT_EMAIL_DOMAIN}</span>
              </>
            }
            error={error}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder={`firstname.lastname@${STUDENT_EMAIL_DOMAIN}`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                required
              />
            )}
          </Field>
          <Button type="submit" size="lg" loading={pending} className="w-full">
            {pending ? "Sending code…" : "Email me a sign-in code"}
            {!pending ? <ArrowRight className="size-4" /> : null}
          </Button>
          <p className="text-center text-xs leading-relaxed text-ink-subtle">
            Profiles are visible only to verified students in your BSL cohort and the programme team.
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
          noValidate
          className="flex flex-col gap-6"
        >
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
            }}
            className="-ml-2 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-sm text-ink-muted hover:text-forest-800"
          >
            <ArrowLeft className="size-4" /> Use a different email
          </button>
          <div>
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-sage-100 text-forest-700">
              <MailCheck className="size-5" />
            </div>
            <h2 className="font-display text-[2.2rem] leading-tight text-forest-900">Check your inbox</h2>
            <p className="mt-2 leading-relaxed text-ink-muted">
              We sent a 6-digit code to <span className="font-medium text-ink break-all">{email}</span>. It expires in 10
              minutes. Check your spam folder if it hasn&apos;t arrived.
            </p>
          </div>
          <Field label="One-time code" error={error}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d*"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                  if (v.length === 6 && !pending) verify(v);
                }}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
                className="text-center text-2xl tracking-[0.4em] tabular-nums"
              />
            )}
          </Field>
          <Button type="submit" size="lg" loading={pending} className="w-full">
            {pending ? "Verifying…" : "Verify and continue"}
          </Button>
          <div className="flex flex-col items-center gap-1 text-sm text-ink-muted">
            {expired ? <span>Codes expire after a short time and work once.</span> : null}
            <button
              type="button"
              disabled={cooldown > 0 || pending}
              onClick={sendCode}
              className="rounded-full px-3 py-1.5 font-medium text-forest-700 hover:bg-forest-800/5 disabled:text-ink-subtle"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
