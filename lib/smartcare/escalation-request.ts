import type { ExecutionState } from "./types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESCALATION_STATES = new Set<ExecutionState>([
  "MISSED",
  "UNCONFIRMED",
  "CONFLICTING",
  "LATE",
  "BLOCKED",
  "EXCEPTION",
]);

export interface EscalationRequest {
  carePlanId: string;
  taskId: string;
  occurrenceId: string;
  triggerState: ExecutionState;
}

export function isEscalationRequest(value: unknown): value is EscalationRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.carePlanId === "string" &&
    UUID_PATTERN.test(request.carePlanId) &&
    typeof request.taskId === "string" &&
    UUID_PATTERN.test(request.taskId) &&
    typeof request.occurrenceId === "string" &&
    UUID_PATTERN.test(request.occurrenceId) &&
    typeof request.triggerState === "string" &&
    ESCALATION_STATES.has(request.triggerState as ExecutionState)
  );
}
