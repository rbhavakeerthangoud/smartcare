import type { ExecutionState } from "./types";

export type EscalationPriority = "HIGH" | "NORMAL";
export type EscalationRecipient =
  | "CAREGIVER"
  | "SECONDARY_CAREGIVER"
  | "CLINICIAN"
  | "HEALTHCARE_PROFESSIONAL";

export type EscalationTriggerState =
  | "MISSED"
  | "UNCONFIRMED"
  | "CONFLICTING"
  | "LATE"
  | "BLOCKED"
  | "EXCEPTION";

export interface EscalationRule {
  triggerState: EscalationTriggerState;
  priority: EscalationPriority;
  recipientType: EscalationRecipient;
}

export const ESCALATION_RULES: Readonly<
  Record<EscalationTriggerState, EscalationRule>
> = {
  MISSED: {
    triggerState: "MISSED",
    priority: "HIGH",
    recipientType: "CAREGIVER",
  },
  UNCONFIRMED: {
    triggerState: "UNCONFIRMED",
    priority: "NORMAL",
    recipientType: "CAREGIVER",
  },
  CONFLICTING: {
    triggerState: "CONFLICTING",
    priority: "HIGH",
    recipientType: "HEALTHCARE_PROFESSIONAL",
  },
  LATE: {
    triggerState: "LATE",
    priority: "NORMAL",
    recipientType: "CAREGIVER",
  },
  BLOCKED: {
    triggerState: "BLOCKED",
    priority: "HIGH",
    recipientType: "SECONDARY_CAREGIVER",
  },
  EXCEPTION: {
    triggerState: "EXCEPTION",
    priority: "HIGH",
    recipientType: "HEALTHCARE_PROFESSIONAL",
  },
};

export function getEscalationRule(
  state: ExecutionState,
): EscalationRule | null {
  if (!(state in ESCALATION_RULES)) return null;
  return ESCALATION_RULES[state as EscalationTriggerState];
}

export interface EscalationCandidate {
  occurrenceId: string;
  taskId: string;
  carePlanId: string;
  taskName: string;
  rule: EscalationRule;
  message: string;
  priority: EscalationPriority;
  recipientType: EscalationRecipient;
}

export function createEscalationCandidate(input: {
  occurrenceId: string;
  taskId: string;
  carePlanId: string;
  taskName: string;
  state: ExecutionState;
}): EscalationCandidate | null {
  const rule = getEscalationRule(input.state);
  if (!rule) return null;

  const message = `Task "${input.taskName}" is currently marked ${input.state}.`;

  return {
    occurrenceId: input.occurrenceId,
    taskId: input.taskId,
    carePlanId: input.carePlanId,
    taskName: input.taskName,
    rule,
    priority: rule.priority,
    recipientType: rule.recipientType,
    message,
  };
}

export function hasMatchingEscalation(
  existing: Array<{
    occurrence_id?: string | null;
    task_id?: string | null;
    care_plan_id?: string | null;
    trigger_state: string;
  }>,
  candidate: EscalationCandidate,
) {
  return existing.some((escalation) => {
    const sameOccurrence = escalation.occurrence_id === candidate.occurrenceId;
    const sameTrigger = escalation.trigger_state === candidate.rule.triggerState;
    const sameTask =
      escalation.task_id == null ||
      escalation.task_id === candidate.taskId ||
      candidate.taskId == null;
    const sameCarePlan =
      escalation.care_plan_id == null ||
      escalation.care_plan_id === candidate.carePlanId ||
      candidate.carePlanId == null;

    return sameOccurrence && sameTrigger && sameTask && sameCarePlan;
  });
}
