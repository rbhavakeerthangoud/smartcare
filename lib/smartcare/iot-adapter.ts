import type { EvidenceEvent } from "./types";

export interface IncomingDeviceEvent {
  deviceId: string;
  taskId: string;
  occurrenceId: string;
  eventTime: string;
  value: string;
  confidence: number;
  notes?: string;
}

export interface NormalizedDeviceEvent extends EvidenceEvent {
  task_id: string;
  device_id: string;
}

export function normalizeDeviceEvent(
  input: IncomingDeviceEvent,
): NormalizedDeviceEvent {
  if (!input.deviceId.trim() || !input.taskId.trim() || !input.occurrenceId.trim()) {
    throw new Error("Device, task, and occurrence identifiers are required.");
  }
  if (Number.isNaN(new Date(input.eventTime).getTime())) {
    throw new Error("Device event time must be a valid timestamp.");
  }
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw new Error("Device event confidence must be between 0 and 1.");
  }
  if (!input.value.trim() || input.value.length > 128) {
    throw new Error("Device event value must contain 1 to 128 characters.");
  }
  if (input.notes && input.notes.length > 1000) {
    throw new Error("Device event notes cannot exceed 1000 characters.");
  }

  return {
    task_id: input.taskId,
    occurrence_id: input.occurrenceId,
    device_id: input.deviceId,
    event_time: new Date(input.eventTime).toISOString(),
    source: "IOT",
    value: input.value.trim(),
    confidence: input.confidence,
    notes: input.notes?.trim() || null,
  };
}
