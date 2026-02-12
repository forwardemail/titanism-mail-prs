/**
 * Friendly date formatting for message timestamps.
 * - Today: "4:59 PM"
 * - Yesterday: "Yesterday 4:59 PM"
 * - Older: "12/4/2025 4:59 PM"
 */

type DateInput = Date | string | number | null | undefined;

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'numeric',
  day: 'numeric',
  year: 'numeric',
});

// Gmail-style compact date formatting
// - Current year: "Nov 29"
// - Other years: "Nov 29 2022"
const monthDayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
});

const monthDayYearFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const readerDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function toDate(value: DateInput): Date | null {
  if (value instanceof Date) return value;
  if (value === undefined || value === null) return null;

  const num = typeof value === 'number' ? value : Number(value);
  if (typeof value === 'number' || Number.isFinite(num)) {
    const ts = typeof value === 'number' ? value : num;
    return new Date(ts < 1e12 ? ts * 1000 : ts);
  }

  const parsed = new Date(value);
  if (Number.isFinite(parsed.getTime())) return parsed;

  return null;
}

export function formatFriendlyDate(value: DateInput, now: Date = new Date()): string {
  try {
    const date = toDate(value);
    if (!date || !Number.isFinite(date.getTime())) {
      return typeof value === 'string' ? value : '';
    }

    const target = new Date(date);
    const current = new Date(now);

    const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const targetDay = startOfDay(target);
    const currentDay = startOfDay(current);

    const msInDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((currentDay.getTime() - targetDay.getTime()) / msInDay);

    const timePart = timeFormatter.format(target);
    if (diffDays === 0) {
      return timePart;
    }
    if (diffDays === 1) {
      return `Yesterday ${timePart}`;
    }

    const datePart = dateFormatter.format(target);
    return `${datePart} ${timePart}`;
  } catch {
    return '';
  }
}

/**
 * Gmail-style compact date formatting for conversation lists
 * - Today: "4:59 PM"
 * - This year: "Nov 29"
 * - Other years: "Nov 29 2022"
 */
export function formatCompactDate(value: DateInput, now: Date = new Date()): string {
  try {
    const date = toDate(value);
    if (!date || !Number.isFinite(date.getTime())) {
      return typeof value === 'string' ? value : '';
    }

    const target = new Date(date);
    const current = new Date(now);

    const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const targetDay = startOfDay(target);
    const currentDay = startOfDay(current);

    const msInDay = 24 * 60 * 60 * 1000;
    const diffDays = Math.floor((currentDay.getTime() - targetDay.getTime()) / msInDay);

    // Today: show time
    if (diffDays === 0) {
      return timeFormatter.format(target);
    }

    // Same year: show "Nov 29"
    if (target.getFullYear() === current.getFullYear()) {
      return monthDayFormatter.format(target);
    }

    // Different year: show "Nov 29 2022"
    return monthDayYearFormatter.format(target);
  } catch {
    return '';
  }
}

/**
 * Reader date formatting with explicit date + time
 * - "Dec 16, 2024, 4:59 PM"
 */
export function formatReaderDate(value: DateInput): string {
  try {
    const date = toDate(value);
    if (!date || !Number.isFinite(date.getTime())) {
      return typeof value === 'string' ? value : '';
    }

    return readerDateTimeFormatter.format(date);
  } catch {
    return '';
  }
}
