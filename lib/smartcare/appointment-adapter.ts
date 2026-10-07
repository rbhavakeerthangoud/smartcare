import type { AppointmentStatus, EvidenceEvent } from "./types";

export interface AppointmentIntegrationAdapter {
  source: string;
  fetchEvents(since: string): Promise<EvidenceEvent[]>;
}

export interface AppointmentRecord {
  id: string;
  patientId?: string;
  carePlanId?: string;
  taskId?: string;
  occurrenceId: string;
  status: AppointmentStatus;
  appointmentDate: string;
  startTime?: string | null;
  endTime?: string | null;
  appointmentType?: string | null;
  location?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  rescheduledFrom?: string | null;
}

export function createAppointmentEvent(input: {
  occurrenceId: string;
  eventTime: string;
  value:
    | "scheduled"
    | "confirmed"
    | "attended"
    | "completed"
    | "missed"
    | "cancelled"
    | "rescheduled";
  notes?: string;
}): EvidenceEvent {
  if (!input.occurrenceId.trim()) {
    throw new Error("An appointment occurrence is required.");
  }
  const eventTime = new Date(input.eventTime);
  if (Number.isNaN(eventTime.getTime())) {
    throw new Error("Appointment event time must be valid.");
  }

  return {
    occurrence_id: input.occurrenceId,
    event_time: eventTime.toISOString(),
    source: "APPOINTMENT",
    value: input.value,
    confidence: 1,
    notes: input.notes?.trim() || null,
  };
}

export function createAppointmentRecord(input: {
  id: string;
  occurrenceId: string;
  patientId?: string;
  carePlanId?: string;
  taskId?: string;
  appointmentDate: string;
  startTime?: string | null;
  endTime?: string | null;
  appointmentType?: string | null;
  location?: string | null;
  notes?: string | null;
  status?: AppointmentStatus;
  now?: Date;
}): AppointmentRecord {
  if (!input.id.trim()) throw new Error("An appointment ID is required.");
  if (!input.occurrenceId.trim()) throw new Error("An appointment occurrence is required.");
  if (Number.isNaN(new Date(input.appointmentDate).getTime())) {
    throw new Error("Appointment date must be valid.");
  }

  const createdAt = (input.now || new Date()).toISOString();
  return {
    id: input.id,
    patientId: input.patientId,
    carePlanId: input.carePlanId,
    taskId: input.taskId,
    occurrenceId: input.occurrenceId,
    status: input.status || "SCHEDULED",
    appointmentDate: new Date(input.appointmentDate).toISOString(),
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    appointmentType: input.appointmentType || null,
    location: input.location || null,
    notes: input.notes?.trim() || null,
    createdAt,
    updatedAt: createdAt,
    rescheduledFrom: null,
  };
}

export function markAppointmentStatus(
  appointment: AppointmentRecord,
  nextStatus: AppointmentStatus,
  now = new Date(),
): AppointmentRecord {
  if (appointment.status === "CANCELLED" && nextStatus !== "CANCELLED") {
    throw new Error("Cancelled appointments cannot be reopened by normal task status transitions.");
  }
  if (nextStatus === "MISSED" && appointment.status === "CANCELLED") {
    throw new Error("Cancelled appointments must not be marked as missed.");
  }

  return {
    ...appointment,
    status: nextStatus,
    updatedAt: now.toISOString(),
  };
}

export function cancelAppointment(
  appointment: AppointmentRecord,
  reason?: string,
  now = new Date(),
): AppointmentRecord {
  return {
    ...appointment,
    status: "CANCELLED",
    notes: reason ? `${appointment.notes ?? ""} ${reason}`.trim() : appointment.notes,
    updatedAt: now.toISOString(),
  };
}

export function rescheduleAppointment(
  appointment: AppointmentRecord,
  nextDate: string,
  now = new Date(),
): AppointmentRecord {
  if (Number.isNaN(new Date(nextDate).getTime())) {
    throw new Error("Rescheduled date must be valid.");
  }

  return {
    ...appointment,
    status: "RESCHEDULED",
    appointmentDate: new Date(nextDate).toISOString(),
    updatedAt: now.toISOString(),
    rescheduledFrom: appointment.appointmentDate,
  };
}

export class MockAppointmentAdapter implements AppointmentIntegrationAdapter {
  readonly source = "MOCK_APPOINTMENT";

  constructor(private readonly events: EvidenceEvent[] = []) {}

  async fetchEvents(since: string) {
    const sinceTime = new Date(since);
    if (Number.isNaN(sinceTime.getTime())) {
      throw new Error("Appointment synchronization start time is invalid.");
    }
    return this.events.filter(
      (event) => new Date(event.event_time).getTime() >= sinceTime.getTime(),
    );
  }
}
