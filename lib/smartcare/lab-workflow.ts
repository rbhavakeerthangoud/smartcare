export type LabWorkflowStatus =
  | "TEST_REQUESTED"
  | "TEST_SCHEDULED"
  | "TEST_PERFORMED"
  | "RESULT_RECEIVED"
  | "MISSED"
  | "CANCELLED";

export interface LabWorkflowRecord {
  id: string;
  taskId: string;
  occurrenceId: string;
  carePlanId: string;
  status: LabWorkflowStatus;
  createdAt: string;
  updatedAt: string;
  resultDocumentId?: string | null;
  notes?: string | null;
}

export function createLabWorkflowRecord(input: {
  id: string;
  taskId: string;
  occurrenceId: string;
  carePlanId: string;
  status?: LabWorkflowStatus;
  now?: Date;
}): LabWorkflowRecord {
  if (!input.id.trim()) throw new Error("A lab workflow ID is required.");
  if (!input.taskId.trim()) throw new Error("A task ID is required for a lab workflow.");
  if (!input.occurrenceId.trim()) throw new Error("An occurrence ID is required for a lab workflow.");
  if (!input.carePlanId.trim()) throw new Error("A care-plan ID is required for a lab workflow.");

  const createdAt = (input.now || new Date()).toISOString();
  return {
    id: input.id,
    taskId: input.taskId,
    occurrenceId: input.occurrenceId,
    carePlanId: input.carePlanId,
    status: input.status || "TEST_REQUESTED",
    createdAt,
    updatedAt: createdAt,
    resultDocumentId: null,
    notes: null,
  };
}

export function associateResultDocument(
  workflow: LabWorkflowRecord,
  documentId: string,
  now = new Date(),
): LabWorkflowRecord {
  if (!documentId.trim()) throw new Error("A result document ID is required.");
  if (workflow.status === "CANCELLED") {
    throw new Error("Cancelled lab workflows cannot receive result documents.");
  }

  return {
    ...workflow,
    resultDocumentId: documentId,
    status: "RESULT_RECEIVED",
    updatedAt: now.toISOString(),
  };
}

export function completeLabWorkflow(
  workflow: LabWorkflowRecord,
  now = new Date(),
): LabWorkflowRecord {
  if (workflow.status === "CANCELLED") {
    throw new Error("Cancelled lab workflows cannot be marked complete.");
  }
  if (workflow.status === "MISSED") {
    throw new Error("Missed lab workflows cannot be completed after the deadline.");
  }

  return {
    ...workflow,
    status: "TEST_PERFORMED",
    updatedAt: now.toISOString(),
  };
}
