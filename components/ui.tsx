import type { Quadrant } from "@/lib/types";
import { QUADRANTS } from "@/lib/types";

export const Q_BG: Record<Quadrant, string> = { 1: "bg-q1", 2: "bg-q2", 3: "bg-q3", 4: "bg-q4" };
export const Q_TEXT: Record<Quadrant, string> = { 1: "text-q1", 2: "text-q2", 3: "text-q3", 4: "text-q4" };
export const Q_SOFT: Record<Quadrant, string> = { 1: "bg-q1/10", 2: "bg-q2/10", 3: "bg-q3/10", 4: "bg-q4/10" };
export const Q_BORDER: Record<Quadrant, string> = { 1: "border-q1", 2: "border-q2", 3: "border-q3", 4: "border-q4" };

export function QuadrantDot({ q, className = "" }: { q: Quadrant | null; className?: string }) {
  return <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${q ? Q_BG[q] : "border border-muted"} ${className}`} title={q ? QUADRANTS[q].label : "Not sorted"} />;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}
