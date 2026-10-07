import type { DocumentCategory } from "./types";

const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export interface ExtractedInstructionCandidate {
  documentId: string;
  text: string;
  proposedTaskName?: string;
  proposedDate?: string;
}

export interface ReviewedInstructionCandidate
  extends ExtractedInstructionCandidate {
  status: "PENDING_REVIEW" | "APPROVED" | "REJECTED";
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface DocumentUploadRequest {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  category?: DocumentCategory | string;
  patientId?: string;
  carePlanId?: string;
  taskId?: string;
  occurrenceId?: string;
}

export interface DocumentUploadValidation {
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  category: DocumentCategory | string;
  storagePath: string;
  taskAssociation: { taskId?: string; occurrenceId?: string };
}

export function sanitizeDocumentFileName(fileName: string): string {
  const sanitized = fileName.replace(/[\\/]+/g, "-").replace(/\s+/g, " ").trim();
  if (!sanitized || sanitized === "." || sanitized === "..") {
    throw new Error("A valid file name is required.");
  }
  return sanitized;
}

export function createPrivateDocumentStoragePath(input: {
  carePlanId: string;
  fileName: string;
  category?: DocumentCategory | string;
  taskId?: string;
  occurrenceId?: string;
}): string {
  const safeName = sanitizeDocumentFileName(input.fileName);
  const segments = [
    "private",
    input.carePlanId,
    input.category || "OTHER",
    input.taskId || "general",
  ];
  if (input.occurrenceId) segments.push(input.occurrenceId);
  return `${segments.join("/")}/${safeName}`;
}

export function validateDocumentUpload(
  input: DocumentUploadRequest,
): DocumentUploadValidation {
  const fileName = sanitizeDocumentFileName(input.fileName);
  const normalizedType = input.fileType.toLowerCase();
  if (!ALLOWED_DOCUMENT_TYPES.has(normalizedType)) {
    throw new Error(
      "Unsupported file type. Upload PDF, JPG, PNG, WEBP, GIF, BMP, TIFF, DOC, or DOCX.",
    );
  }
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error("Document size must be greater than zero bytes.");
  }
  if (input.fileSizeBytes > 25 * 1024 * 1024) {
    throw new Error("Document size exceeds the 25MB upload limit.");
  }
  const category = input.category || "OTHER";

  if (input.carePlanId && !input.carePlanId.trim()) {
    throw new Error("Care-plan ID cannot be empty when linking a document.");
  }
  if (input.taskId && !input.taskId.trim() && input.occurrenceId) {
    throw new Error("Task ID is required when a document is linked to an occurrence.");
  }

  return {
    fileName,
    fileType: normalizedType,
    fileSizeBytes: input.fileSizeBytes,
    category,
    storagePath: input.carePlanId
      ? createPrivateDocumentStoragePath({
          carePlanId: input.carePlanId,
          fileName,
          category,
          taskId: input.taskId,
          occurrenceId: input.occurrenceId,
        })
      : `private/unspecified/${fileName}`,
    taskAssociation: {
      taskId: input.taskId?.trim() || undefined,
      occurrenceId: input.occurrenceId?.trim() || undefined,
    },
  };
}

export function isDocumentEvidenceForTask(input: {
  taskVerificationMethod?: string | null;
  document?: DocumentUploadValidation | null;
  occurredAt?: string | null;
  occurrenceWindowStart?: string | null;
  occurrenceWindowEnd?: string | null;
}): boolean {
  if (!input.document) return false;
  if (input.taskVerificationMethod && input.taskVerificationMethod !== "document") {
    return false;
  }
  if (!input.occurredAt || !input.occurrenceWindowEnd || !input.occurrenceWindowStart) {
    return true;
  }

  const uploadedAt = new Date(input.occurredAt).getTime();
  const windowStart = new Date(input.occurrenceWindowStart).getTime();
  const windowEnd = new Date(input.occurrenceWindowEnd).getTime();
  return uploadedAt >= windowStart && uploadedAt <= windowEnd;
}

export function createDocumentCandidate(
  candidate: ExtractedInstructionCandidate,
): ReviewedInstructionCandidate {
  if (!candidate.documentId.trim() || !candidate.text.trim()) {
    throw new Error("A source document and extracted text are required.");
  }
  if (candidate.text.length > 20_000) {
    throw new Error("Extracted text exceeds the review limit.");
  }
  if (
    candidate.proposedDate &&
    Number.isNaN(new Date(`${candidate.proposedDate}T00:00:00`).getTime())
  ) {
    throw new Error("The extracted candidate date is invalid.");
  }

  return { ...candidate, status: "PENDING_REVIEW" };
}

export function reviewDocumentCandidate(input: {
  candidate: ReviewedInstructionCandidate;
  reviewerId: string;
  reviewerRole: "PATIENT" | "CLINICIAN";
  approved: boolean;
  now?: Date;
}): ReviewedInstructionCandidate {
  if (!input.reviewerId.trim()) {
    throw new Error("A reviewer identity is required.");
  }
  if (input.candidate.status !== "PENDING_REVIEW") {
    throw new Error("Only pending document candidates can be reviewed.");
  }

  return {
    ...input.candidate,
    status: input.approved ? "APPROVED" : "REJECTED",
    reviewedBy: input.reviewerId,
    reviewedAt: (input.now || new Date()).toISOString(),
  };
}
