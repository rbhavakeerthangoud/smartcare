import type {
  EvidenceDocument,
  EvidenceEvent,
  EvidenceSummary,
  ExecutionOccurrence,
  ExecutionState,
  ExecutionTask,
} from "./types";

function getDateTimeParts(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);

  if (!dateMatch || !timeMatch) return null;

  const [, year, month, day] = dateMatch;
  const [, hour, minute, second = "0"] = timeMatch;
  const parts = [year, month, day, hour, minute, second].map(Number);
  const [numericYear, numericMonth, numericDay, numericHour, numericMinute, numericSecond] = parts;
  const check = new Date(Date.UTC(
    numericYear,
    numericMonth - 1,
    numericDay,
    numericHour,
    numericMinute,
    numericSecond,
  ));
  if (
    check.getUTCFullYear() !== numericYear ||
    check.getUTCMonth() !== numericMonth - 1 ||
    check.getUTCDate() !== numericDay ||
    check.getUTCHours() !== numericHour ||
    check.getUTCMinutes() !== numericMinute ||
    check.getUTCSeconds() !== numericSecond
  ) {
    return null;
  }
  return parts;
}

function parseDateTimeInZone(
  date: string,
  time: string,
  timeZone: string,
): Date | null {
  const parts = getDateTimeParts(date, time);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts;
  const expectedAsUtc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
  );
  let candidate = expectedAsUtc;
  let formatter: Intl.DateTimeFormat;

  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return null;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = Object.fromEntries(
      formatter.formatToParts(new Date(candidate))
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    );
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const adjustment = expectedAsUtc - actualAsUtc;
    if (adjustment === 0) break;
    candidate += adjustment;
  }

  const verified = Object.fromEntries(
    formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  if (
    verified.year !== year ||
    verified.month !== month ||
    verified.day !== day ||
    verified.hour !== hour ||
    verified.minute !== minute ||
    verified.second !== second
  ) {
    return null;
  }

  return new Date(candidate);
}

function occurrenceTimeZone(occurrence: ExecutionOccurrence) {
  return occurrence.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getOccurrenceDeadline(
  occurrence: ExecutionOccurrence,
): Date | null {
  const time = occurrence.allowed_end_time || "23:59:59";
  return parseDateTimeInZone(
    occurrence.occurrence_date,
    time,
    occurrenceTimeZone(occurrence),
  );
}

function getOccurrenceStart(occurrence: ExecutionOccurrence): Date | null {
  return parseDateTimeInZone(
    occurrence.occurrence_date,
    occurrence.allowed_start_time || "00:00:00",
    occurrenceTimeZone(occurrence),
  );
}

function normalizeCompletion(source: string, value?: string | null) {
  const normalized = value?.trim().toLowerCase();

  if (source === "PATIENT_REPORT" || source === "CAREGIVER_REPORT") {
    if (["completed", "complete", "done", "yes"].includes(normalized || "")) {
      return true;
    }
    if (["not_completed", "not done", "no", "incomplete"].includes(normalized || "")) {
      return false;
    }
  }

  if (source === "IOT" || source === "IOT_SIMULATION") {
    if (["detected", "completed", "complete", "done", "yes"].includes(normalized || "")) {
      return true;
    }
    if (["not_detected", "not_completed", "incomplete", "no"].includes(normalized || "")) {
      return false;
    }
  }

  if (source === "APPLICATION") {
    if (["completed", "complete", "done", "yes"].includes(normalized || "")) {
      return true;
    }
    if (["not_completed", "not done", "no", "incomplete"].includes(normalized || "")) {
      return false;
    }
  }

  if (source === "APPOINTMENT") {
    if (["attended", "completed", "complete", "done"].includes(normalized || "")) {
      return true;
    }
    if (["missed", "not_attended", "no_show"].includes(normalized || "")) {
      return false;
    }
  }

  return null;
}

function isAcceptedEvent(event: EvidenceEvent) {
  return event.source !== "AI_STRUCTURED";
}

function summarizeEvidence(
  events: EvidenceEvent[],
  documents: EvidenceDocument[],
): EvidenceSummary {
  const timestamps = [
    ...events.map((event) => event.event_time),
    ...documents.map((document) => document.uploaded_at),
  ]
    .map((timestamp) => new Date(timestamp))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime());

  return {
    eventCount: events.length,
    documentCount: documents.length,
    sources: [...new Set([
      ...events.map((event) => event.source),
      ...(documents.length > 0 ? ["DOCUMENT"] : []),
    ])],
    latestEvidenceAt: timestamps[0]?.toISOString() ?? null,
  };
}

function classifyEvidenceConflict(events: EvidenceEvent[]) {
  const latestBySource = new Map<string, EvidenceEvent>();
  const ordered = [...events].sort(
    (left, right) =>
      new Date(right.event_time).getTime() -
      new Date(left.event_time).getTime(),
  );

  for (const event of ordered) {
    if (!latestBySource.has(event.source)) {
      latestBySource.set(event.source, event);
    }
  }

  const patientEvent = latestBySource.get("PATIENT_REPORT");
  const caregiverEvent = latestBySource.get("CAREGIVER_REPORT");
  const iotEvent =
    latestBySource.get("IOT") || latestBySource.get("IOT_SIMULATION");

  const reportEvent = patientEvent || caregiverEvent;
  if (!reportEvent || !iotEvent) return false;

  const reportCompletion = normalizeCompletion(reportEvent.source, reportEvent.value);
  const iotCompletion = normalizeCompletion(iotEvent.source, iotEvent.value);

  return (
    reportCompletion !== null &&
    iotCompletion !== null &&
    reportCompletion !== iotCompletion
  );
}

export function reconcileEvidence(input: {
  task: ExecutionTask;
  occurrence: ExecutionOccurrence;
  events: EvidenceEvent[];
  documents: EvidenceDocument[];
  now?: Date;
}): {
  state: ExecutionState;
  reasons: string[];
  evidence: EvidenceSummary;
  deadline: Date | null;
} {
  const { task, occurrence, now = new Date() } = input;
  const events = input.events
    .filter((event) => event.occurrence_id === occurrence.id && isAcceptedEvent(event))
    .filter((event) => !Number.isNaN(new Date(event.event_time).getTime()));
  if (
    occurrence.status?.toUpperCase() === "COMPLETED" &&
    occurrence.completed_at &&
    !Number.isNaN(new Date(occurrence.completed_at).getTime()) &&
    !events.some(
      (event) =>
        event.source === "APPLICATION" &&
        event.event_time === occurrence.completed_at,
    )
  ) {
    events.push({
      occurrence_id: occurrence.id,
      event_time: occurrence.completed_at,
      source: occurrence.completion_source || "APPLICATION",
      value: "completed",
    });
  }
  const documents = input.documents
    .filter((document) => document.occurrence_id === occurrence.id)
    .filter((document) => !Number.isNaN(new Date(document.uploaded_at).getTime()));
  const evidence = summarizeEvidence(events, documents);
  const deadline = getOccurrenceDeadline(occurrence);
  const start = getOccurrenceStart(occurrence);
  const reasons: string[] = [];

  if (!deadline || !start || start.getTime() > deadline.getTime()) {
    return {
      state: "INSUFFICIENT_EVIDENCE",
      reasons: ["The occurrence date or execution time window is invalid."],
      evidence,
      deadline,
    };
  }

  const futureEvidence = [...events, ...documents].some((item) => {
    const timestamp =
      "event_time" in item ? item.event_time : item.uploaded_at;
    return new Date(timestamp).getTime() > now.getTime() + 60_000;
  });
  if (futureEvidence) {
    return {
      state: "INSUFFICIENT_EVIDENCE",
      reasons: ["Evidence timestamp is in the future and requires review."],
      evidence,
      deadline,
    };
  }

  if (classifyEvidenceConflict(events)) {
    return {
      state: "CONFLICTING",
      reasons: ["Patient-reported and IoT completion evidence disagree."],
      evidence,
      deadline,
    };
  }

  const verification = task.verification_method?.toLowerCase() || "";
  const requiresDocument = ["document", "multiple"].includes(verification);
  const requiresIot = ["iot", "multiple"].includes(verification);
  const patientReports = events.filter(
    (event) => event.source === "PATIENT_REPORT",
  );
  const caregiverReports = events.filter(
    (event) => event.source === "CAREGIVER_REPORT",
  );
  const iotEvents = events.filter(
    (event) => event.source === "IOT" || event.source === "IOT_SIMULATION",
  );
  const hasPositiveIot = iotEvents.some(
    (event) => normalizeCompletion(event.source, event.value) === true,
  );
  const hasPositiveAppointment = events.some(
    (event) =>
      event.source === "APPOINTMENT" &&
      normalizeCompletion(event.source, event.value) === true,
  );
  const hasPositiveReport = patientReports.some(
    (event) => normalizeCompletion(event.source, event.value) === true,
  );
  const hasPositiveCaregiverReport = caregiverReports.some(
    (event) => normalizeCompletion(event.source, event.value) === true,
  );
  const hasCompletionEvidence =
    hasPositiveReport ||
    hasPositiveCaregiverReport ||
    hasPositiveIot ||
    hasPositiveAppointment ||
    documents.length > 0;
  const missingRequiredEvidence =
    (requiresDocument && documents.length === 0) ||
    (requiresIot && !hasPositiveIot);

  if (missingRequiredEvidence && (hasPositiveReport || hasPositiveCaregiverReport)) {
    return {
      state: "UNCONFIRMED",
      reasons: ["The task was reported complete, but required supporting evidence is missing."],
      evidence,
      deadline,
    };
  }

  if (!hasCompletionEvidence) {
    if (now.getTime() > deadline.getTime()) {
      return {
        state: "MISSED",
        reasons: ["The allowed execution deadline has passed without completion evidence."],
        evidence,
        deadline,
      };
    }

    return {
      state: "PENDING",
      reasons: ["No completion evidence has been recorded yet."],
      evidence,
      deadline,
    };
  }

  if (missingRequiredEvidence) {
    return {
      state: "INSUFFICIENT_EVIDENCE",
      reasons: ["The task's configured verification requirements are not satisfied."],
      evidence,
      deadline,
    };
  }

  const completionTimestamps = [
    ...events
      .filter((event) => normalizeCompletion(event.source, event.value) === true)
      .map((event) => new Date(event.event_time)),
    ...documents.map((document) => new Date(document.uploaded_at)),
  ].sort((left, right) => left.getTime() - right.getTime());
  const completionTime = completionTimestamps[0];
  if (!completionTime) {
    return {
      state: "INSUFFICIENT_EVIDENCE",
      reasons: ["Completion evidence could not be assigned a valid time window."],
      evidence,
      deadline,
    };
  }

  if (completionTime.getTime() < start.getTime()) {
    return {
      state: "BEFORE_WINDOW",
      reasons: ["Completion evidence was recorded before the allowed time window."],
      evidence,
      deadline,
    };
  }

  if (completionTime.getTime() > deadline.getTime()) {
    return {
      state: "LATE",
      reasons: ["Completion evidence was recorded after the allowed deadline."],
      evidence,
      deadline,
    };
  }

  if (
    documents.length > 0 &&
    !hasPositiveReport &&
    !hasPositiveCaregiverReport &&
    !hasPositiveIot &&
    !hasPositiveAppointment
  ) {
    reasons.push("A document was recorded as evidence; its clinical content is not interpreted automatically.");
    return { state: "DOCUMENT_RECORDED", reasons, evidence, deadline };
  }

  if (hasPositiveReport || hasPositiveCaregiverReport || hasPositiveIot || hasPositiveAppointment) {
    reasons.push("Completion evidence was recorded within the allowed time window.");
    return { state: "ON_TIME", reasons, evidence, deadline };
  }

  return {
    state: "INSUFFICIENT_EVIDENCE",
    reasons: ["No recognized completion evidence was found."],
    evidence,
    deadline,
  };
}
