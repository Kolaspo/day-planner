import { describe, expect, it } from "vitest";
import { suggestDuration, trackedMinutes, type HistoryItem } from "../learning";

const h = (title: string, category: string | null, est: number, actual: number, day: number): HistoryItem => ({
  title, category, estimateMinutes: est, actualMinutes: actual, completedAt: `2026-10-${String(day).padStart(2, "0")}T12:00:00Z`,
});

describe("suggestDuration", () => {
  it("returns null with no similar history", () => {
    expect(suggestDuration({ title: "Write essay", category: null, estimateMinutes: 60 }, [])).toBeNull();
  });

  it("learns that a category usually runs over", () => {
    const history = [
      h("Accounting HW 1", "Accounting", 60, 90, 1),
      h("Accounting HW 2", "Accounting", 60, 85, 5),
      h("Accounting HW 3", "Accounting", 45, 70, 9),
      h("Accounting HW 4", "Accounting", 60, 95, 12),
    ];
    const s = suggestDuration({ title: "Ledger exercises", category: "accounting", estimateMinutes: 60 }, history)!;
    expect(s.basis).toBe("category");
    expect(s.samples).toBe(4);
    expect(s.ratio).toBeGreaterThan(1.25);
    expect(s.minutes).toBeGreaterThanOrEqual(80);
    expect(s.minutes % 5).toBe(0);
  });

  it("falls back to similar titles", () => {
    const history = [h("Read law chapter 3", null, 30, 20, 2), h("Read law chapter 4", null, 30, 22, 6)];
    const s = suggestDuration({ title: "Read law chapter 5", category: null, estimateMinutes: 30 }, history)!;
    expect(s.basis).toBe("title");
    expect(s.ratio).toBeLessThan(1);
  });

  it("trusts a single sample only partly", () => {
    const s = suggestDuration({ title: "x", category: "Math", estimateMinutes: 60 }, [h("y", "Math", 60, 120, 1)])!;
    expect(s.ratio).toBeLessThan(2);
    expect(s.ratio).toBeGreaterThan(1);
  });

  it("ignores accidental 1-minute sessions", () => {
    expect(suggestDuration({ title: "x", category: "Math", estimateMinutes: 60 }, [h("y", "Math", 60, 1, 1)])).toBeNull();
  });
});

describe("trackedMinutes", () => {
  it("sums sessions and excludes pauses", () => {
    const entries = [
      { started_at: "2026-10-19T08:00:00Z", ended_at: "2026-10-19T08:25:00Z" },
      // 10 min pause
      { started_at: "2026-10-19T08:35:00Z", ended_at: "2026-10-19T09:00:00Z" },
    ];
    expect(trackedMinutes(entries)).toBe(50);
  });
  it("counts a running session up to now", () => {
    const now = Date.parse("2026-10-19T08:15:00Z");
    expect(trackedMinutes([{ started_at: "2026-10-19T08:00:00Z", ended_at: null }], now)).toBe(15);
  });
});
