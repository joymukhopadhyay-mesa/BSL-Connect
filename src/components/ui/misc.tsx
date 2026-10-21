import type { ReactNode } from "react";
import { cn } from "./cn";

/** Profile photo with an initials fallback. Signed URLs are short-lived and private,
 *  so they are rendered directly rather than through the image optimiser cache. */
export function ProfilePhoto({
  src,
  name,
  className,
  rounded = "rounded-full",
  priority,
}: {
  src: string | null | undefined;
  name: string | null | undefined;
  className?: string;
  rounded?: string;
  priority?: boolean;
}) {
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  if (!src) {
    return (
      <div
        className={cn("flex items-center justify-center bg-gradient-to-br from-forest-700 to-forest-900 font-display text-sage-200", rounded, className)}
        aria-label={name ? `${name} (no photo)` : "No photo"}
        role="img"
      >
        <span className="text-[1.6em] leading-none">{initials || "·"}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name ? `Photo of ${name}` : "Profile photo"}
      className={cn("object-cover", rounded, className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
    />
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-sage-100 text-forest-700">{icon}</div>
      ) : null}
      <h2 className="max-w-sm font-display text-[1.9rem] leading-[1.1] text-forest-900 text-balance">{title}</h2>
      {children ? <div className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-ink-muted">{children}</div> : null}
      {action ? <div className="mt-7 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-[0.8rem] font-medium tracking-wide text-forest-600">{eyebrow}</p> : null}
        <h1 className="font-display text-[2.4rem] leading-[1.02] tracking-[-0.01em] text-forest-900 sm:text-[2.9rem]">{title}</h1>
        {description ? <div className="mt-3 max-w-xl text-[0.97rem] leading-relaxed text-ink-muted">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
  className,
  icon,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const tones = {
    info: "bg-sage-100/80 text-forest-900 border-sage-300/60",
    success: "bg-sage-100 text-forest-900 border-sage-300",
    warning: "bg-amber-soft text-[#5b3c06] border-[#e8d7ad]",
    danger: "bg-danger-soft text-[#6d2419] border-[#ecc8c0]",
  };
  return (
    <div className={cn("flex gap-3 rounded-2xl border p-4 text-sm leading-relaxed", tones[tone], className)} role={tone === "danger" ? "alert" : undefined}>
      {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && "mt-1")}>{children}</div> : null}
      </div>
    </div>
  );
}

export function Progress({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-forest-800/10"
    >
      <div className="h-full rounded-full bg-forest-700 transition-[width] duration-500 ease-[var(--ease-out-soft)]" style={{ width: `${v}%` }} />
    </div>
  );
}

export function SectionCard({ title, description, children, className, action }: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={cn("surface rounded-[var(--radius-panel)] p-5 shadow-soft sm:p-6", className)}>
      {title ? (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[1.05rem] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {description ? <div className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</div> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Wordmark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="9" fill={inverted ? "#F6F4ED" : "#12372D"} />
        <circle cx="12.5" cy="16" r="5.5" fill="none" stroke={inverted ? "#12372D" : "#B9CBB4"} strokeWidth="2" />
        <circle cx="19.5" cy="16" r="5.5" fill="none" stroke={inverted ? "#204A3B" : "#F6F4ED"} strokeWidth="2" />
      </svg>
      <span className={cn("text-[0.95rem] font-semibold tracking-[-0.02em]", inverted ? "text-ivory-50" : "text-forest-900")}>
        BSL Connect
      </span>
    </span>
  );
}
