import { describe, expect, it } from "vitest";
import {
  parseIsoDate,
  getDeadlineInfo,
  classifyUrgency,
  pickSoonestDeadline,
} from "@/lib/dates";

const NOW = new Date(2026, 4, 20); // 2026-05-20

describe("parseIsoDate", () => {
  it("parses YYYY-MM-DD", () => {
    const d = parseIsoDate("2026-06-15");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
  });

  it("accepts ISO with time suffix", () => {
    expect(parseIsoDate("2026-06-15T12:00:00Z")).not.toBeNull();
  });

  it("rejects Hebrew month names (translator pass-through)", () => {
    expect(parseIsoDate("15 ביוני 2026")).toBeNull();
  });

  it("rejects malformed strings", () => {
    expect(parseIsoDate("not a date")).toBeNull();
    expect(parseIsoDate("2026/06/15")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });

  it("rejects calendar overflow (Feb 31)", () => {
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-00-15")).toBeNull();
  });
});

describe("classifyUrgency", () => {
  it("classifies overdue", () => {
    expect(classifyUrgency(-1)).toBe("overdue");
    expect(classifyUrgency(-30)).toBe("overdue");
  });
  it("classifies today", () => {
    expect(classifyUrgency(0)).toBe("today");
  });
  it("classifies soon (1-7 days)", () => {
    expect(classifyUrgency(1)).toBe("soon");
    expect(classifyUrgency(7)).toBe("soon");
  });
  it("classifies later (8+ days)", () => {
    expect(classifyUrgency(8)).toBe("later");
    expect(classifyUrgency(60)).toBe("later");
  });
});

describe("getDeadlineInfo", () => {
  it("computes days-away for a future deadline", () => {
    const info = getDeadlineInfo("2026-05-27", NOW);
    expect(info.daysAway).toBe(7);
    expect(info.urgency).toBe("soon");
  });

  it("flags an overdue deadline", () => {
    const info = getDeadlineInfo("2026-05-10", NOW);
    expect(info.daysAway).toBe(-10);
    expect(info.urgency).toBe("overdue");
  });

  it("flags today as today", () => {
    const info = getDeadlineInfo("2026-05-20", NOW);
    expect(info.daysAway).toBe(0);
    expect(info.urgency).toBe("today");
  });

  it("returns null daysAway when the date isn't ISO", () => {
    const info = getDeadlineInfo("15 ביוני 2026", NOW);
    expect(info.daysAway).toBeNull();
  });
});

describe("pickSoonestDeadline", () => {
  it("picks the most urgent deadline within the horizon", () => {
    const result = pickSoonestDeadline(
      [
        { label: "Pay date", date: "2026-06-01", is_deadline: false }, // not a deadline
        { label: "Appeal deadline", date: "2026-06-15", is_deadline: true }, // 26 days
        { label: "Hearing", date: "2026-05-25", is_deadline: true }, // 5 days — soonest
      ],
      { now: NOW },
    );
    expect(result).not.toBeNull();
    expect(result!.label).toBe("Hearing");
    expect(result!.urgency).toBe("soon");
  });

  it("includes overdue deadlines in the result", () => {
    const result = pickSoonestDeadline(
      [{ label: "Missed payment", date: "2026-05-10", is_deadline: true }],
      { now: NOW },
    );
    expect(result).not.toBeNull();
    expect(result!.urgency).toBe("overdue");
  });

  it("skips deadlines beyond the horizon", () => {
    const result = pickSoonestDeadline(
      [{ label: "Distant", date: "2027-01-01", is_deadline: true }],
      { now: NOW, horizonDays: 30 },
    );
    expect(result).toBeNull();
  });

  it("ignores non-deadline dates entirely", () => {
    const result = pickSoonestDeadline(
      [{ label: "Letter date", date: "2026-05-22", is_deadline: false }],
      { now: NOW },
    );
    expect(result).toBeNull();
  });

  it("ignores unparseable dates", () => {
    const result = pickSoonestDeadline(
      [{ label: "Hebrew date", date: "ה' בסיוון תשפ\"ו", is_deadline: true }],
      { now: NOW },
    );
    expect(result).toBeNull();
  });

  it("returns null on empty input", () => {
    expect(pickSoonestDeadline([], { now: NOW })).toBeNull();
  });
});
