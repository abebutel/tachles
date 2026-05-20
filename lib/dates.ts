// Deadline helpers for the results UI. Pure logic kept out of the React
// component so it's unit-testable without a DOM.

export type DeadlineUrgency = "overdue" | "today" | "soon" | "later";

export interface DeadlineInfo {
  date: string; // the input string, returned for convenience
  daysAway: number | null; // null if the date couldn't be parsed
  urgency: DeadlineUrgency;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

// Parse an ISO YYYY-MM-DD string (possibly with time suffix) into a Date at
// local midnight. Returns null if the format doesn't match — the specialist
// prompts prefer ISO when unambiguous but may pass through Hebrew month
// names verbatim, which we can't reliably countdown.
export function parseIsoDate(input: string): Date | null {
  if (typeof input !== "string") return null;
  const m = input.match(ISO_DATE_RE);
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = parseInt(y, 10);
  const month = parseInt(mo, 10);
  const day = parseInt(d, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Reject overflows like 2026-02-31 -> 2026-03-03.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function daysBetween(now: Date, target: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  // Compare at local midnight to ignore the time-of-day component.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.round((end - start) / msPerDay);
}

export function classifyUrgency(daysAway: number): DeadlineUrgency {
  if (daysAway < 0) return "overdue";
  if (daysAway === 0) return "today";
  if (daysAway <= 7) return "soon";
  return "later";
}

export function getDeadlineInfo(date: string, now: Date = new Date()): DeadlineInfo {
  const parsed = parseIsoDate(date);
  if (!parsed) {
    return { date, daysAway: null, urgency: "later" };
  }
  const daysAway = daysBetween(now, parsed);
  return { date, daysAway, urgency: classifyUrgency(daysAway) };
}

// Given a translation's `dates[]`, pick the soonest unmissed deadline within
// `horizonDays` days. Returns null if there's no parseable deadline in
// range, including past-due ones (those are shown as "overdue" callouts
// separately).
export interface TranslationDate {
  label: string;
  date: string;
  is_deadline: boolean;
}

export interface SoonestDeadline extends DeadlineInfo {
  label: string;
}

export function pickSoonestDeadline(
  dates: TranslationDate[],
  options: { horizonDays?: number; now?: Date } = {},
): SoonestDeadline | null {
  const { horizonDays = 30, now = new Date() } = options;

  let best: SoonestDeadline | null = null;
  for (const d of dates) {
    if (!d.is_deadline) continue;
    const info = getDeadlineInfo(d.date, now);
    if (info.daysAway === null) continue;
    // Include overdue (negative days) and within-horizon future deadlines.
    if (info.daysAway > horizonDays) continue;

    const candidate: SoonestDeadline = { ...info, label: d.label };
    if (best === null) {
      best = candidate;
      continue;
    }
    // Prefer the most urgent: overdue beats today beats soon beats later.
    // Within the same urgency band, prefer earliest absolute date.
    if (candidate.daysAway! < best.daysAway!) {
      best = candidate;
    }
  }
  return best;
}
