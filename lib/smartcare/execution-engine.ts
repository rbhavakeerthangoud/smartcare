import { reconcileEvidence } from "./evidence-engine";
import type {
  DependencyResult,
  EvidenceDocument,
  EvidenceEvent,
  ExecutionOccurrence,
  ExecutionResult,
  ExecutionTask,
} from "./types";

const ESCALATION_STATES = new Set([
  "MISSED",
  "UNCONFIRMED",
  "CONFLICTING",
  "LATE",
]);

export function evaluateExecution(input: {
  task: ExecutionTask;
  occurrence: ExecutionOccurrence;
  events: EvidenceEvent[];
  documents: EvidenceDocument[];
  dependency?: DependencyResult;
  now?: Date;
}): ExecutionResult {
  const evidence = reconcileEvidence(input);
  const reasons = [...evidence.reasons];

  if (input.dependency && input.dependency.state !== "READY") {
    reasons.push(...input.dependency.reasons);
  }

  return {
    state: evidence.state,
    reasons,
    evidence: evidence.evidence,
    deadline: evidence.deadline,
    escalationRequired: ESCALATION_STATES.has(evidence.state),
  };
}
