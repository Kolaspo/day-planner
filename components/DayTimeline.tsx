"use client";

import type { Quadrant } from "@/lib/types";
import { at, fmtTime, pad } from "@/lib/time";
import { Q_BG, Q_BORDER, Q_SOFT, Q_TEXT } from "./ui";

export interface Block {
  id: string;
  title: string;
  start: number;
  end: number;
  kind: "event" | "task" | "suggestion" | "done";
  quadrant?: Quadrant | null;
  color?: string;
  sub?: string;
}

const PX = 1.1; // pixels per minute

/** Assign side-by-side columns to overlapping blocks. */
function layout(blocks: Block[]) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: { b: Block; col: number; cols: number }[] = [];
  let cluster: { b: Block; col: number }[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    cluster.forEach((c) => out.push({ ...c, cols }));
    cluster = [];
  };
  for (const b of sorted) {
    if (b.start >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    const used = new Set(cluster.filter((c) => c.b.end > b.start).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ b, col });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

export default function DayTimeline({
  day,
  fromHour,
  toHour,
  blocks,
  actual,
  now,
  windowStart,
  windowEnd,
  onBlockClick,
}: {
  day: string;
  fromHour: number;
  toHour: number;
  blocks: Block[];
  actual: { start: number; end: number; quadrant: Quadrant | null; title: string }[];
  now: number;
  windowStart: number;
  windowEnd: number;
  onBlockClick?: (b: Block) => void;
}) {
  const origin = at(day, `${fromHour}:00`);
  const totalMin = (toHour - fromHour) * 60;
  const y = (t: number) => Math.max(0, Math.min(totalMin, (t - origin) / 60_000)) * PX;
  const hours = Array.from({ length: toHour - fromHour + 1 }, (_, i) => fromHour + i);
  const showNow = now >= origin && now <= origin + totalMin * 60_000;

  return (
    <div className="relative select-none" style={{ height: totalMin * PX + 12 }}>
      {/* Off-hours shading (outside your planning window) */}
      <div className="absolute left-12 right-0 bg-ink/[0.035]" style={{ top: 0, height: y(windowStart) }} />
      <div className="absolute left-12 right-0 bg-ink/[0.035]" style={{ top: y(windowEnd), height: Math.max(0, totalMin * PX - y(windowEnd)) }} />

      {hours.map((h) => (
        <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: (h - fromHour) * 60 * PX }}>
          <span className="w-12 -translate-y-2 pr-2 text-right font-mono text-[11px] text-muted">{pad(h % 24)}:00</span>
          <span className="mt-0 h-px flex-1 bg-line" />
        </div>
      ))}

      {/* Planned / event column */}
      <div className="absolute bottom-0 left-12 right-5 top-0">
        {layout(blocks).map(({ b, col, cols }) => {
          const top = y(b.start);
          const h = Math.max(14, y(b.end) - top - 2);
          const compact = h < 34;
          const style: React.CSSProperties = { top: top + 1, height: h, left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` };
          const q = b.quadrant ?? null;
          let cls = "";
          if (b.kind === "event") cls = "border-l-4 bg-card border border-line text-ink";
          else if (b.kind === "suggestion") cls = `border-2 border-dashed ${q ? `${Q_BORDER[q]} ${Q_SOFT[q]} ${Q_TEXT[q]}` : "border-muted"} cursor-pointer hover:brightness-95`;
          else if (b.kind === "done") cls = `${q ? Q_SOFT[q] : "bg-ink/5"} text-muted line-through`;
          else cls = `${q ? Q_BG[q] : "bg-ink"} text-white shadow-sm`;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onBlockClick?.(b)}
              className={`absolute overflow-hidden rounded-lg px-2 text-left ${compact ? "py-0" : "py-1"} ${cls}`}
              style={{ ...style, ...(b.kind === "event" ? { borderLeftColor: b.color } : {}) }}
              title={`${b.title} · ${fmtTime(b.start)}–${fmtTime(b.end)}`}
            >
              <p className={`truncate font-medium ${compact ? "text-[11px] leading-[14px]" : "text-xs"}`}>
                {compact && <span className="mr-1 font-mono opacity-70">{fmtTime(b.start)}</span>}
                {b.kind === "suggestion" && "Suggest: "}
                {b.title}
              </p>
              {!compact && (
                <p className="truncate font-mono text-[10px] opacity-75">
                  {fmtTime(b.start)}–{fmtTime(b.end)}
                  {b.sub && <span className="font-sans"> · {b.sub}</span>}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Actual tracked time */}
      <div className="absolute bottom-0 right-0 top-0 w-3.5">
        {actual.map((a, i) => (
          <div key={i} title={`${a.title}: ${fmtTime(a.start)}–${fmtTime(a.end)}`} className={`absolute left-0.5 right-0.5 rounded-sm ${a.quadrant ? Q_BG[a.quadrant] : "bg-ink"}`} style={{ top: y(a.start), height: Math.max(2, y(a.end) - y(a.start)) }} />
        ))}
      </div>

      {showNow && (
        <div className="pointer-events-none absolute left-10 right-0 z-10 flex items-center" style={{ top: y(now) }}>
          <span className="h-2.5 w-2.5 -translate-x-1 rounded-full bg-q1" />
          <span className="h-[2px] flex-1 bg-q1" />
        </div>
      )}
    </div>
  );
}
