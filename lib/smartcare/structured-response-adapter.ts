import type { EvidenceEvent } from "./types";

export interface StructuredResponseCandidate {
  occurrenceId: string;
  answer: "COMPLETED" | "NOT_COMPLETED" | "UNKNOWN";
  capturedAt: string;
  confidence: number;
}

export interface PendingStructuredResponse {
  status: "PENDING_PATIENT_CONFIRMATION";
  candidate: StructuredResponseCandidate;
}

export function validateStructuredResponse(
  candidate: StructuredResponseCandidate,
): PendingStructuredResponse {
  if (!candidate.occurrenceId.trim()) {
    throw new Error("A task occurrence is required for a structured response.");
  }
  if (Number.isNaN(new Date(candidate.capturedAt).getTime())) {
    throw new Error("The structured response timestamp is invalid.");
  }
  if (
    !Number.isFinite(candidate.confidence) ||
    candidate.confidence < 0 ||
    candidate.confidence > 1
  ) {
    throw new Error("Response confidence must be between 0 and 1.");
  }

  return {
    status: "PENDING_PATIENT_CONFIRMATION",
    candidate: {
      ...candidate,
      capturedAt: new Date(candidate.capturedAt).toISOString(),
    },
  };
}

export function confirmStructuredResponse(
  response: PendingStructuredResponse,
  confirmedByPatient: boolean,
): EvidenceEvent {
  if (!confirmedByPatient) {
    throw new Error("The patient must confirm the structured response before recording it.");
  }

  return {
    occurrence_id: response.candidate.occurrenceId,
    event_time: response.candidate.capturedAt,
    source: "PATIENT_REPORT",
    value:
      response.candidate.answer === "COMPLETED"
        ? "completed"
        : response.candidate.answer === "NOT_COMPLETED"
          ? "not_completed"
          : "unknown",
    confidence: response.candidate.confidence,
    notes: "Patient-confirmed structured response.",
  };
}
