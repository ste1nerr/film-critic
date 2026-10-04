"use client";

import { useEffect, useRef } from "react";
import { formatScore, scoreTone, tmdbImage } from "@/lib/score";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger";
};

export function Button({ variant = "ghost", className = "", ...props }: ButtonProps) {
  const styles = {
    primary: "bg-accent text-black hover:brightness-110 font-semibold",
    ghost: "border border-border bg-surface-2/60 hover:bg-surface-2 text-foreground",
    danger: "border border-rose-500/40 text-rose-300 hover:bg-rose-500/10",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm transition disabled:opacity-50 disabled:pointer-events-none ${styles} ${className}`}
    />
  );
}

export function ScoreBadge({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "h-6 min-w-9 text-xs px-1.5 rounded-md",
    md: "h-8 min-w-11 text-sm px-2 rounded-lg",
    lg: "h-16 min-w-20 text-3xl px-3 rounded-2xl",
  }[size];
  return (
    <span className={`inline-flex items-center justify-center font-bold tabular-nums shadow-lg shadow-black/30 ${sizes} ${scoreTone(value)}`}>
      {formatScore(value)}
    </span>
  );
}

export function Poster({
  path,
  alt,
  size = "w342",
  className = "",
}: {
  path: string | null;
  alt: string;
  size?: Parameters<typeof tmdbImage>[1];
  className?: string;
}) {
  const src = tmdbImage(path, size);
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-surface-2 to-surface p-3 text-center ${className}`}>
        <span className="font-display text-xl leading-tight tracking-wide text-muted">{alt}</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- TMDB serves pre-sized images; no optimizer needed
  return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-xl"} rounded-2xl border border-border bg-surface p-0 text-foreground shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-display text-2xl tracking-wide">{title}</h2>
            <button onClick={onClose} className="rounded-md p-1 text-muted hover:text-foreground" aria-label="Close">
              ✕
            </button>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-label="Loading"
    />
  );
}
