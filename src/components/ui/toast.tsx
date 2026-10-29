"use client";

import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";
type ToastAction = { label: string; onClick: () => void };
type ToastItem = { id: number; message: string; tone: ToastTone; action?: ToastAction };

type ToastApi = {
  show: (message: string, opts?: { tone?: ToastTone; action?: ToastAction; durationMs?: number }) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback<ToastApi["show"]>(
    (message, opts) => {
      const id = nextId.current++;
      setItems((all) => [...all.slice(-2), { id, message, tone: opts?.tone ?? "info", action: opts?.action }]);
      window.setTimeout(() => dismiss(id), opts?.durationMs ?? (opts?.action ? 6000 : 3800));
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

  return (
    <ToastContext value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--nav-height)+var(--safe-bottom)+var(--ticker-height)+0.75rem)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-[calc(var(--ticker-height)+1.5rem)]"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-md animate-rise items-center gap-3 rounded-2xl px-4 py-3 text-sm shadow-lift",
                t.tone === "error" ? "bg-danger text-white" : "bg-forest-900 text-ivory-50",
              )}
            >
              <Icon className="size-4.5 shrink-0 opacity-90" aria-hidden />
              <span className="flex-1 leading-snug">{t.message}</span>
              {t.action ? (
                <button
                  type="button"
                  className="rounded-full px-3 py-1 font-semibold text-sage-300 hover:bg-white/10"
                  onClick={() => {
                    t.action!.onClick();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </ToastContext>
  );
}
