import type {
  GeneratedOccurrence,
  RecurrenceInput,
} from "./types";

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const DEFAULT_MAX_OCCURRENCES = 366;

function parseDate(value: string): Date {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error(`Invalid calendar date: ${value}`);

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Invalid calendar date: ${value}`);
  }
  return date;
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

function validateTimes(times: NonNullable<RecurrenceInput["times"]>) {
  for (const window of times) {
    if (Boolean(window.startTime) !== Boolean(window.endTime)) {
      throw new Error("Each time window must include both a start and an end time.");
    }
    if (window.startTime && !TIME_PATTERN.test(window.startTime)) {
      throw new Error(`Invalid start time: ${window.startTime}`);
    }
    if (window.endTime && !TIME_PATTERN.test(window.endTime)) {
      throw new Error(`Invalid end time: ${window.endTime}`);
    }
    if (
      window.startTime &&
      window.endTime &&
      window.startTime > window.endTime
    ) {
      throw new Error("A time window's end time cannot be before its start time.");
    }
  }
}

export function generateOccurrences(
  input: RecurrenceInput,
): GeneratedOccurrence[] {
  const start = parseDate(input.startDate);
  const end = parseDate(input.endDate);
  const horizon = parseDate(input.horizonEnd || input.endDate);
  const limitDate = horizon.getTime() < end.getTime() ? horizon : end;
  const maxOccurrences = input.maxOccurrences ?? DEFAULT_MAX_OCCURRENCES;

  if (end.getTime() < start.getTime()) {
    throw new Error("End date cannot be before start date.");
  }
  if (limitDate.getTime() < start.getTime()) {
    return [];
  }
  if (!Number.isInteger(maxOccurrences) || maxOccurrences < 1 || maxOccurrences > 5000) {
    throw new Error("Maximum occurrences must be an integer between 1 and 5000.");
  }

  const times = input.times?.length ? input.times : [{}];
  validateTimes(times);
  const exclusions = new Set(input.excludedDates || []);
  const selectedWeekdays = new Set(input.weekdays || []);
  const intervalDays = input.intervalDays ?? 1;

  if (
    input.frequency === "EVERY_N_DAYS" &&
    (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365)
  ) {
    throw new Error("Recurrence interval must be between 1 and 365 days.");
  }
  if (
    input.frequency === "SELECTED_WEEKDAYS" &&
    (selectedWeekdays.size === 0 ||
      [...selectedWeekdays].some(
        (weekday) => !Number.isInteger(weekday) || weekday < 0 || weekday > 6,
      ))
  ) {
    throw new Error("Select at least one valid weekday (0=Sunday through 6=Saturday).");
  }

  for (const excludedDate of exclusions) parseDate(excludedDate);

  const output: GeneratedOccurrence[] = [];
  for (
    let current = new Date(start);
    current.getTime() <= limitDate.getTime();
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const date = toDateString(current);
    if (exclusions.has(date)) continue;

    const offsetDays = Math.floor(
      (current.getTime() - start.getTime()) / 86_400_000,
    );
    const shouldGenerate =
      input.frequency === "ONCE"
        ? offsetDays === 0
        : input.frequency === "DAILY"
          ? true
          : input.frequency === "WEEKLY"
            ? offsetDays % 7 === 0
            : input.frequency === "EVERY_N_DAYS"
              ? offsetDays % intervalDays === 0
              : selectedWeekdays.has(current.getUTCDay());

    if (!shouldGenerate) continue;

    for (const window of times) {
      output.push({
        occurrence_date: date,
        allowed_start_time: window.startTime || null,
        allowed_end_time: window.endTime || null,
      });

      if (output.length > maxOccurrences) {
        throw new Error(
          `The recurrence creates more than ${maxOccurrences} occurrences. Shorten the date range or use a bounded horizon.`,
        );
      }
    }
  }

  return output;
}
