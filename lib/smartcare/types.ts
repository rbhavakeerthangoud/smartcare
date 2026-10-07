export type ExecutionState =
  | "PENDING"
  | "ACTIVE"
  | "BEFORE_WINDOW"
  | "ON_TIME"
  | "LATE"
  | "MISSED"
  | "UNCONFIRMED"
  | "CONFLICTING"
  | "PARTIAL"
  | "BLOCKED"
  | "DOCUMENT_RECORDED"
  | "REPORTED"
  | "EXCEPTION"
  | "INSUFFICIENT_EVIDENCE";

export type EvidenceSource =
  | "PATIENT_REPORT"
  | "CAREGIVER_REPORT"
  | "IOT"
  | "IOT_SIMULATION"
  | "DOCUMENT"
  | "APPOINTMENT"
  | "APPLICATION"
  | "AI_STRUCTURED";

export interface EvidenceEvent {
  id?: string;
  occurrence_id: string;
  event_time: string;
  source: EvidenceSource | string;
  value?: string | null;
  confidence?: number | null;
  notes?: string | null;
}

export type DocumentCategory =
  | "DISCHARGE_SUMMARY"
  | "PRESCRIPTION"
  | "LAB_REPORT"
  | "APPOINTMENT_DOCUMENT"
  | "REFERRAL"
  | "CARE_PLAN_DOCUMENT"
  | "OTHER";

export interface EvidenceDocument {
  id?: string;
  occurrence_id: string;
  uploaded_at: string;
  file_name?: string;
  file_type?: string | null;
  file_size_bytes?: number | null;
  document_category?: DocumentCategory | string | null;
  storage_path?: string | null;
}

export type AppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "COMPLETED"
  | "MISSED"
  | "CANCELLED"
  | "RESCHEDULED";

export interface ExecutionTask {
  id: string;
  verification_method?: string | null;
}

export interface ExecutionOccurrence {
  id: string;
  occurrence_date: string;
  time_zone?: string | null;
  allowed_start_time?: string | null;
  allowed_end_time?: string | null;
  status?: string | null;
  completed_at?: string | null;
  completion_source?: string | null;
}

export interface EvidenceSummary {
  eventCount: number;
  documentCount: number;
  sources: string[];
  latestEvidenceAt: string | null;
}

export interface ExecutionResult {
  state: ExecutionState;
  reasons: string[];
  evidence: EvidenceSummary;
  deadline: Date | null;
  escalationRequired: boolean;
}

export type DependencyType = "BEFORE" | "REQUIRED_BEFORE" | "AFTER";

export interface TaskDependency {
  prerequisiteTaskId: string;
  dependentTaskId: string;
  type: DependencyType;
}

export type DependencyState =
  | "READY"
  | "AT_RISK"
  | "BLOCKED"
  | "COMPLETED"
  | "NOT_APPLICABLE";

export type CarePlanHealthState =
  | "HEALTHY"
  | "ATTENTION_REQUIRED"
  | "AT_RISK"
  | "BLOCKED"
  | "COMPLETED"
  | "INACTIVE";

export interface DependencyResult {
  taskId: string;
  state: DependencyState;
  reasons: string[];
  prerequisites: string[];
}

export interface DependencyValidationIssue {
  code:
    | "SELF_DEPENDENCY"
    | "DUPLICATE_DEPENDENCY"
    | "CIRCULAR_DEPENDENCY"
    | "MISSING_TASK"
    | "CROSS_CARE_PLAN_DEPENDENCY"
    | "INVALID_DEPENDENCY_TYPE";
  dependency: TaskDependency;
  message: string;
}

export interface DependencyValidationResult {
  valid: boolean;
  issues: DependencyValidationIssue[];
}

export interface DependencyGraphNode {
  taskId: string;
  prerequisites: string[];
  dependents: string[];
}

export interface CarePlanProgressMetrics {
  totalActiveOccurrences: number;
  completedOccurrences: number;
  onTimeOccurrences: number;
  lateOccurrences: number;
  missedOccurrences: number;
  unconfirmedOccurrences: number;
  conflictingOccurrences: number;
  blockedOccurrences: number;
  onTimeRate: number;
  completionRate: number;
}

export interface CarePlanHealthResult {
  state: CarePlanHealthState;
  reason: string;
  metrics: CarePlanProgressMetrics;
  blockedTaskIds: string[];
  affectedTaskIds: string[];
  escalationCount: number;
}

export interface RecurrenceTimeWindow {
  startTime?: string | null;
  endTime?: string | null;
}

export type RecurrenceFrequency =
  | "ONCE"
  | "DAILY"
  | "WEEKLY"
  | "EVERY_N_DAYS"
  | "SELECTED_WEEKDAYS";

export interface RecurrenceInput {
  startDate: string;
  endDate: string;
  frequency: RecurrenceFrequency;
  intervalDays?: number;
  weekdays?: number[];
  times?: RecurrenceTimeWindow[];
  excludedDates?: string[];
  horizonEnd?: string;
  maxOccurrences?: number;
}

export interface GeneratedOccurrence {
  occurrence_date: string;
  allowed_start_time: string | null;
  allowed_end_time: string | null;
}
