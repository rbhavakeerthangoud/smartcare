export interface AuditEvent {
  actorId: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  occurredAt: string;
  metadata: Record<string, string | number | boolean | null>;
}

export interface AuditRepository {
  append(event: AuditEvent): Promise<void>;
}

export async function recordAuditEvent(
  repository: AuditRepository,
  event: Omit<AuditEvent, "occurredAt"> & { occurredAt?: string },
) {
  if (!event.action.trim() || !event.objectType.trim()) {
    throw new Error("Audit action and object type are required.");
  }
  await repository.append({
    ...event,
    occurredAt: event.occurredAt || new Date().toISOString(),
  });
}
