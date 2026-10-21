import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "sage" | "glass";
type Size = "sm" | "md" | "lg";

const base =
  "relative inline-flex select-none items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] " +
  "transition-[transform,background-color,box-shadow,color,opacity] duration-200 ease-[var(--ease-out-soft)] " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary: "bg-forest-800 text-ivory-50 shadow-soft hover:bg-forest-700",
  secondary: "bg-ivory-50 text-forest-800 border border-line-strong hover:bg-white hover:border-forest-800/30",
  ghost: "text-forest-800 hover:bg-forest-800/6",
  danger: "bg-danger text-white hover:bg-danger/90",
  sage: "bg-sage-200 text-forest-900 hover:bg-sage-300",
  glass: "glass text-forest-900 shadow-float hover:bg-white/85",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-4 text-sm",
  md: "h-11 px-5 text-[0.95rem]",
  lg: "h-13 px-7 text-base",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode }) {
  return (
    <Link className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {icon}
      {children}
    </Link>
  );
}

/** Round icon button with an accessible label (required). */
export function IconButton({
  label,
  variant = "glass",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; variant?: Variant; size?: "sm" | "md" | "lg" | "xl" }) {
  const dims = { sm: "size-9", md: "size-11", lg: "size-14", xl: "size-16" }[size];
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(base, variants[variant], dims, "px-0", className)}
      {...props}
    >
      {children}
    </button>
  );
}
