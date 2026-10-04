"use client";

import { useState } from "react";
import { CRITERIA, type Ratings } from "@/lib/types";

const SIZE = 280;
const C = SIZE / 2;
const R = SIZE / 2 - 44;

function point(i: number, value: number) {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / CRITERIA.length;
  const r = (value / 5) * R;
  return [C + r * Math.cos(angle), C + r * Math.sin(angle)] as const;
}

/** Five-axis radar of the user's ratings, single series. */
export function RadarChart({ ratings }: { ratings: Ratings }) {
  const [hover, setHover] = useState<number | null>(null);
  const shape = CRITERIA.map((c, i) => point(i, ratings[c.key]).join(",")).join(" ");

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[300px]" role="img" aria-label="Ratings radar chart">
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon
          key={level}
          points={CRITERIA.map((_, i) => point(i, level).join(",")).join(" ")}
          fill="none"
          stroke="var(--border)"
          strokeWidth={1}
        />
      ))}
      {CRITERIA.map((c, i) => {
        const [x, y] = point(i, 5);
        const [lx, ly] = point(i, 6.3);
        return (
          <g key={c.key}>
            <line x1={C} y1={C} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[11px]"
              fill={hover === i ? "var(--foreground)" : "var(--muted)"}
            >
              {c.label}
            </text>
          </g>
        );
      })}
      <polygon points={shape} fill="var(--accent)" fillOpacity={0.18} stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
      {CRITERIA.map((c, i) => {
        const [x, y] = point(i, ratings[c.key]);
        return (
          <g key={c.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x} cy={y} r={14} fill="transparent" />
            <circle cx={x} cy={y} r={hover === i ? 6 : 4.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            {hover === i && (
              <text x={x} y={y - 14} textAnchor="middle" className="text-[12px] font-semibold" fill="var(--foreground)">
                {ratings[c.key]}/5
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
