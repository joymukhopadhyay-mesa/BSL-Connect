"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Bottom sheet on mobile, centred panel on larger screens. Built on the
 * native <dialog> element: focus is trapped and restored by the browser,
 * Escape closes it, and the backdrop is inert.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  hideTitle,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  hideTitle?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  const widths = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl" };

  return (
    <dialog
      ref={ref}
      onClose={() => {
        document.documentElement.style.overflow = "";
        onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[1.75rem] bg-ivory-50 p-0 text-ink shadow-lift outline-none",
        "sm:m-auto sm:rounded-[1.75rem]",
        widths[size],
        open && "animate-sheet",
      )}
    >
      {open ? (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex items-start gap-4 px-5 pt-3 pb-3 sm:px-7 sm:pt-6">
            <div className="mx-auto mb-1 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
          </div>
          <div className="flex items-start justify-between gap-4 px-5 sm:px-7">
            <div className={cn("min-w-0", hideTitle && "sr-only")}>
              <h2 id={titleId} className="text-xl font-semibold tracking-[-0.02em] text-ink">
                {title}
              </h2>
              {description ? <div className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</div> : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ivory-200/70 text-ink transition hover:bg-ivory-200"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-4 pb-6 sm:px-7">{children}</div>
          {footer ? (
            <div className="border-t border-line bg-ivory-50/95 px-5 pt-4 pb-[calc(1rem+var(--safe-bottom))] sm:px-7">{footer}</div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}
