"use client";

import { scoreTone } from "@/lib/score";
import { CRITERIA, type CriterionKey, type Ratings } from "@/lib/types";

export function RatingEditor({
  value,
  onChange,
}: {
  value: Ratings;
  onChange(key: CriterionKey, rating: number): void;
}) {
  return (
    <div className="space-y-3">
      {CRITERIA.map((c) => (
        <div key={c.key} className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm font-medium">{c.label}</div>
            {"hint" in c && <div className="truncate text-xs text-muted">{c.hint}</div>}
          </div>
          <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={c.label}>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = value[c.key] === n;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(c.key, n)}
                  className={`size-9 rounded-lg text-sm font-semibold tabular-nums transition ${
                    active ? `${scoreTone(n)} scale-105` : "bg-surface-2 text-muted hover:text-foreground hover:bg-border"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
