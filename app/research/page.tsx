"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { evaluateExecution } from "@/lib/smartcare/execution-engine";
import { evaluateDependencies } from "@/lib/smartcare/dependency-engine";
import type { ExecutionState } from "@/lib/smartcare/types";

type TableName =
  | "patients"
  | "care_plans"
  | "tasks"
  | "task_occurrences"
  | "events"
  | "documents"
  | "dependencies"
  | "escalations"
  | "smartcare_notifications";

type RangeKey = "7d" | "30d" | "all";

interface AnalyticsMetrics {
  patients: number;
  carePlans: number;
  tasks: number;
  occurrences: number;
  onTime: number;
  late: number;
  missed: number;
  unconfirmed: number;
  conflicting: number;
  pending: number;
  activeEscalations: number;
  resolvedEscalations: number;
  averageResolutionHours: number | null;
}

interface AnalyticsDataSet {
  patientRows: Array<{ id: string }>;
  planRows: Array<{ id: string; patient_id?: string | null; name?: string | null }>;
  taskRows: Array<{
    id: string;
    care_plan_id?: string | null;
    type?: string | null;
    name?: string | null;
    verification_method?: string | null;
    created_at?: string | null;
  }>;
  occurrenceRows: Array<{
    id: string;
    task_id: string;
    occurrence_date: string;
    time_zone?: string | null;
    allowed_start_time?: string | null;
    allowed_end_time?: string | null;
    status?: string | null;
    completed_at?: string | null;
    completion_source?: string | null;
  }>;
  eventRows: Array<{
    id?: string | null;
    task_id?: string | null;
    occurrence_id?: string | null;
    event_time: string;
    source: string;
    value?: string | null;
    confidence?: number | null;
    notes?: string | null;
  }>;
  documentRows: Array<{
    id?: string | null;
    task_id?: string | null;
    occurrence_id?: string | null;
    uploaded_at: string;
    file_name?: string | null;
    document_category?: string | null;
  }>;
  dependencyRows: Array<{
    care_plan_id?: string | null;
    prerequisite_task_id: string;
    dependent_task_id: string;
    dependency_type?: string | null;
  }>;
  escalationRows: Array<{
    id?: string | null;
    care_plan_id?: string | null;
    task_id?: string | null;
    occurrence_id?: string | null;
    trigger_state?: string | null;
    priority?: string | null;
    status?: string | null;
    created_at: string;
    resolved_at?: string | null;
  }>;
  notificationRows: Array<{
    id?: string | null;
    channel?: string | null;
    status?: string | null;
    created_at?: string | null;
    read_at?: string | null;
    acknowledged_at?: string | null;
  }>;
}

const STATE_ORDER: ExecutionState[] = [
  "ON_TIME",
  "LATE",
  "MISSED",
  "UNCONFIRMED",
  "CONFLICTING",
  "PENDING",
  "BEFORE_WINDOW",
  "DOCUMENT_RECORDED",
  "REPORTED",
  "INSUFFICIENT_EVIDENCE",
];

const TASK_TYPE_ORDER = [
  "MEDICATION",
  "APPOINTMENT",
  "LABORATORY",
  "DOCUMENT",
  "EXERCISE",
  "MEASUREMENT",
  "WOUND_CARE",
  "COMMUNICATION",
  "OTHER",
];

const PAGE_SIZE = 500;

async function fetchAllRows(table: TableName, columns: string) {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select<string, Record<string, unknown>>(columns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function dateKey(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function lastThirtyDays() {
  const days: string[] = [];
  const current = new Date();
  current.setUTCHours(0, 0, 0, 0); 
  current.setUTCDate(current.getUTCDate() - 29);
  for (let i = 0; i < 30; i++) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return days;
}

function normalizeTaskType(value: string | null | undefined) {
  const normalized = (value || "").trim().toUpperCase();
  if (!normalized) return "OTHER";
  if (normalized.includes("APPOINT")) return "APPOINTMENT";
  if (normalized.includes("LAB") || normalized.includes("TEST")) return "LABORATORY";
  if (normalized.includes("MED")) return "MEDICATION";
  if (normalized.includes("EXER")) return "EXERCISE";
  if (normalized.includes("MEAS")) return "MEASUREMENT";
  if (normalized.includes("WOUND")) return "WOUND_CARE";
  if (normalized.includes("COMM")) return "COMMUNICATION";
  if (normalized.includes("DOC")) return "DOCUMENT";
  return "OTHER";
}

function rateValue(value: number, total: number) {
  if (total === 0) return 0;
  return (value / total) * 100;
}

function isWithinRange(dateValue: string | null | undefined, range: RangeKey) {
  if (!dateValue || range === "all") return true;
  const when = new Date(dateValue);
  if (Number.isNaN(when.getTime())) return false;
  const now = new Date();
  const diffMs = now.getTime() - when.getTime();
  if (range === "7d") return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
  if (range === "30d") return diffMs >= 0 && diffMs <= 30 * 24 * 60 * 60 * 1000;
  return true;
}

function getDemoResearchDataset(): AnalyticsDataSet {
  const now = new Date();
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }

  const patientRows = Array.from({ length: 6 }, (_, i) => ({ id: `p-${i + 1}` }));
  const planRows = patientRows.map((p, i) => ({
    id: `cp-${i + 1}`,
    patient_id: p.id,
    name: i % 2 === 0 ? `Cardiac Recovery Regimen ${i + 1}` : `Orthopedic Mobility Protocol ${i + 1}`,
  }));

  const taskTypes = ["MEDICATION", "MEASUREMENT", "WOUND_CARE", "EXERCISE", "APPOINTMENT", "DOCUMENT"];
  const taskRows: AnalyticsDataSet["taskRows"] = [];
  planRows.forEach((plan, planIdx) => {
    taskTypes.forEach((type, tIdx) => {
      taskRows.push({
        id: `t-${planIdx}-${tIdx}`,
        care_plan_id: plan.id,
        type,
        name: `${type.charAt(0) + type.slice(1).toLowerCase()} Task ${tIdx + 1}`,
        verification_method: tIdx % 2 === 0 ? "PATIENT_REPORT" : "DEVICE_INTEGRATION",
        created_at: `${days[0]}T08:00:00Z`,
      });
    });
  });

  const occurrenceRows: AnalyticsDataSet["occurrenceRows"] = [];
  const eventRows: AnalyticsDataSet["eventRows"] = [];
  const documentRows: AnalyticsDataSet["documentRows"] = [];

  let occCounter = 0;
  days.forEach((day, dayIdx) => {
    taskRows.slice(0, 8).forEach((task) => {
      occCounter++;
      const occId = `occ-${occCounter}`;
      const isCompleted = (dayIdx + occCounter) % 5 !== 0;
      const isLate = (dayIdx + occCounter) % 7 === 0;
      const status = isCompleted ? (isLate ? "LATE" : "COMPLETED") : (dayIdx > 25 ? "PENDING" : "MISSED");

      occurrenceRows.push({
        id: occId,
        task_id: task.id,
        occurrence_date: day,
        time_zone: "UTC",
        allowed_start_time: "08:00:00",
        allowed_end_time: "12:00:00",
        status,
        completed_at: isCompleted ? `${day}T09:30:00Z` : null,
        completion_source: isCompleted ? "PATIENT" : null,
      });

      if (isCompleted) {
        eventRows.push({
          id: `ev-${occCounter}`,
          task_id: task.id,
          occurrence_id: occId,
          event_time: `${day}T09:30:00Z`,
          source: occCounter % 3 === 0 ? "DEVICE" : "PATIENT",
          value: "Recorded",
          confidence: 0.95,
          notes: null,
        });
      }

      if (task.type === "DOCUMENT" && isCompleted) {
        documentRows.push({
          id: `doc-${occCounter}`,
          task_id: task.id,
          occurrence_id: occId,
          uploaded_at: `${day}T09:30:00Z`,
          file_name: `Report_${day}.pdf`,
          document_category: "CLINICAL_DISCHARGE",
        });
      }
    });
  });

  const dependencyRows: AnalyticsDataSet["dependencyRows"] = [
    {
      care_plan_id: planRows[0].id,
      prerequisite_task_id: taskRows[0].id,
      dependent_task_id: taskRows[1].id,
      dependency_type: "REQUIRED_BEFORE",
    },
    {
      care_plan_id: planRows[1].id,
      prerequisite_task_id: taskRows[2].id,
      dependent_task_id: taskRows[3].id,
      dependency_type: "REQUIRED_BEFORE",
    },
  ];

  const escalationRows: AnalyticsDataSet["escalationRows"] = [
    {
      id: "esc-1",
      care_plan_id: planRows[0].id,
      task_id: taskRows[0].id,
      occurrence_id: occurrenceRows[5]?.id,
      trigger_state: "MISSED",
      priority: "HIGH",
      status: "RESOLVED",
      created_at: `${days[15]}T12:05:00Z`,
      resolved_at: `${days[15]}T13:00:00Z`,
    },
    {
      id: "esc-2",
      care_plan_id: planRows[1].id,
      task_id: taskRows[2].id,
      occurrence_id: occurrenceRows[12]?.id,
      trigger_state: "CONFLICTING",
      priority: "MEDIUM",
      status: "OPEN",
      created_at: `${days[28]}T14:30:00Z`,
      resolved_at: null,
    },
  ];

  const notificationRows: AnalyticsDataSet["notificationRows"] = [
    {
      id: "notif-1",
      channel: "WEB",
      status: "DELIVERED",
      created_at: `${days[28]}T14:35:00Z`,
      read_at: `${days[28]}T14:40:00Z`,
    },
  ];

  return {
    patientRows,
    planRows,
    taskRows,
    occurrenceRows,
    eventRows,
    documentRows,
    dependencyRows,
    escalationRows,
    notificationRows,
  };
}

export default function ResearchDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [range, setRange] = useState<RangeKey>("30d");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("ALL");
  const [dataset, setDataset] = useState<AnalyticsDataSet | null>(null);
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [states, setStates] = useState<Record<string, number>>({});
  const [escalationTrend, setEscalationTrend] = useState<number[]>([]);
  const [completionTrend, setCompletionTrend] = useState<number[]>([]);
  const [evidenceSources, setEvidenceSources] = useState<Array<[string, number]>>([]);
  const [blockedDependencies, setBlockedDependencies] = useState(0);
  const [carePlanPerformance, setCarePlanPerformance] = useState<Array<{ id: string; name: string; onTime: number; total: number }>>([]);
  const [taskTypeBreakdown, setTaskTypeBreakdown] = useState<Array<{ label: string; value: number; total: number }>>([]);
  const [lateAndMissedBreakdown, setLateAndMissedBreakdown] = useState<Array<{ label: string; value: number }>>([]);
  const [escalationSummary, setEscalationSummary] = useState<Array<{ label: string; value: number }>>([]);
  const [notificationSummary, setNotificationSummary] = useState<Array<{ label: string; value: number }>>([]);
  const [documentSummary, setDocumentSummary] = useState<{ total: number; associated: number; categoryCounts: Array<{ label: string; value: number }> }>({ total: 0, associated: 0, categoryCounts: [] });
  const [appointmentSummary, setAppointmentSummary] = useState<{ total: number; scheduled: number; completed: number; missed: number; cancelled: number; rescheduled: number }>({ total: 0, scheduled: 0, completed: 0, missed: 0, cancelled: 0, rescheduled: 0 });

  useEffect(() => {
    let active = true;

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      try {
        let datasetValue: AnalyticsDataSet | null = null;
        try {
          const [patientRows, planRows, taskRows, occurrenceRows, eventRows, documentRows, dependencyRows, escalationRows] = await Promise.all([
            fetchAllRows("patients", "id"),
            fetchAllRows("care_plans", "id,patient_id,name"),
            fetchAllRows("tasks", "id,care_plan_id,type,name,verification_method,created_at"),
            fetchAllRows("task_occurrences", "id,task_id,occurrence_date,time_zone,allowed_start_time,allowed_end_time,status,completed_at,completion_source"),
            fetchAllRows("events", "id,task_id,occurrence_id,event_time,source,value,confidence,notes"),
            fetchAllRows("documents", "id,task_id,occurrence_id,uploaded_at,file_name,document_category"),
            fetchAllRows("dependencies", "care_plan_id,prerequisite_task_id,dependent_task_id,dependency_type"),
            fetchAllRows("escalations", "id,care_plan_id,task_id,occurrence_id,trigger_state,priority,status,created_at,resolved_at"),
          ]);

          let notificationRows: AnalyticsDataSet["notificationRows"] = [];
          try {
            notificationRows = (await fetchAllRows("smartcare_notifications", "id,channel,status,created_at,read_at,acknowledged_at")) as AnalyticsDataSet["notificationRows"];
          } catch {
            notificationRows = [];
          }

          if (patientRows.length > 0) {
            datasetValue = {
              patientRows: patientRows as AnalyticsDataSet["patientRows"],
              planRows: planRows as AnalyticsDataSet["planRows"],
              taskRows: taskRows as AnalyticsDataSet["taskRows"],
              occurrenceRows: occurrenceRows as AnalyticsDataSet["occurrenceRows"],
              eventRows: eventRows as AnalyticsDataSet["eventRows"],
              documentRows: documentRows as AnalyticsDataSet["documentRows"],
              dependencyRows: dependencyRows as AnalyticsDataSet["dependencyRows"],
              escalationRows: escalationRows as AnalyticsDataSet["escalationRows"],
              notificationRows,
            };
          }
        } catch {
          // If unauthenticated or query denied by RLS, proceed to demo preview dataset
        }

        if (!datasetValue) {
          if (active) setIsDemo(true);
          datasetValue = getDemoResearchDataset();
        }

        const tasks = datasetValue.taskRows;
        const occurrences = datasetValue.occurrenceRows;
        const events = datasetValue.eventRows;
        const documents = datasetValue.documentRows;
        const plans = datasetValue.planRows;
        const dependencies = datasetValue.dependencyRows;
        const escalations = datasetValue.escalationRows;
        const notificationRows = datasetValue.notificationRows;
        const taskMap = new Map(tasks.map((task) => [task.id, task]));
        const occurrenceStates = new Map<string, ExecutionState>();
        const stateCounts = Object.fromEntries(STATE_ORDER.map((state) => [state, 0]));
        const performance = new Map(
          plans.map((plan) => [plan.id, { id: plan.id, name: plan.name || "Care plan", onTime: 0, total: 0 }]),
        );
        const taskStateById = new Map<string, ExecutionState>();
        const latestOccurrenceByTask = new Map<string, (typeof occurrences)[number]>();

        for (const occurrence of occurrences) {
          const task = taskMap.get(occurrence.task_id);
          if (!task) continue;
          const result = evaluateExecution({
            task: {
              ...task,
              verification_method: task.verification_method ?? null,
            },
            occurrence,
            events: events
              .filter((event) => event.occurrence_id === occurrence.id)
              .map((event) => ({
                ...event,
                id: event.id ?? undefined,
                occurrence_id: occurrence.id,
              })),
            documents: documents
              .filter((document) => document.occurrence_id === occurrence.id)
              .map((document) => ({
                ...document,
                id: document.id ?? undefined,
                file_name: document.file_name ?? undefined,
                occurrence_id: document.occurrence_id || occurrence.id,
              })),
          });
          occurrenceStates.set(occurrence.id, result.state);
          stateCounts[result.state] = (stateCounts[result.state] || 0) + 1;
          const plan = performance.get(task.care_plan_id || "");
          if (plan) {
            plan.total += 1;
            if (result.state === "ON_TIME") plan.onTime += 1;
          }

          const previous = latestOccurrenceByTask.get(task.id);
          if (!previous || occurrence.occurrence_date > previous.occurrence_date) {
            latestOccurrenceByTask.set(task.id, occurrence);
          }
        }

        for (const [taskId, occurrence] of latestOccurrenceByTask) {
          taskStateById.set(taskId, occurrenceStates.get(occurrence.id) || "PENDING");
        }

        const dependencyStateMap = evaluateDependencies({
          dependencies: dependencies.map((dependency) => {
            const type = (dependency.dependency_type || "REQUIRED_BEFORE").toUpperCase();
            return {
              prerequisiteTaskId: dependency.prerequisite_task_id,
              dependentTaskId: dependency.dependent_task_id,
              type:
                type === "BEFORE" || type === "AFTER" ? type : "REQUIRED_BEFORE",
            };
          }),
          executionStates: taskStateById,
        });

        const days = lastThirtyDays();
        const daySet = new Set(days);
        const escalationCounts = new Map(days.map((day) => [day, 0]));
        for (const escalation of escalations) {
          const key = dateKey(escalation.created_at);
          if (key && daySet.has(key)) {
            escalationCounts.set(key, (escalationCounts.get(key) || 0) + 1);
          }
        }

        const completionCounts = new Map(days.map((day) => [day, 0]));
        for (const event of events) {
          const key = dateKey(event.event_time);
          if (
            key &&
            daySet.has(key) &&
            ["completed", "detected", "attended"].includes((event.value || "").toLowerCase())
          ) {
            completionCounts.set(key, (completionCounts.get(key) || 0) + 1);
          }
        }

        const evidenceCounts = new Map<string, number>();
        for (const event of events) {
          const source = (event.source || "SYSTEM_EVENT").toUpperCase();
          evidenceCounts.set(source, (evidenceCounts.get(source) || 0) + 1);
        }
        if (documents.length > 0) {
          evidenceCounts.set("DOCUMENT", (evidenceCounts.get("DOCUMENT") || 0) + documents.length);
        }

        const resolutionTimes = escalations
          .filter((escalation) => escalation.status === "RESOLVED" && escalation.resolved_at)
          .map((escalation) => {
            const started = new Date(escalation.created_at).getTime();
            const resolved = new Date(escalation.resolved_at as string).getTime();
            return resolved - started;
          })
          .filter((duration) => Number.isFinite(duration) && duration >= 0);

        const taskTypeCounts = new Map<string, number>();
        const taskTypeTotals = new Map<string, number>();
        for (const task of tasks) {
          const normalized = normalizeTaskType(task.type || task.name || "OTHER");
          taskTypeCounts.set(normalized, (taskTypeCounts.get(normalized) || 0) + 1);
          taskTypeTotals.set(normalized, (taskTypeTotals.get(normalized) || 0) + 1);
        }

        const lateAndMissedCounts = new Map<string, number>();
        for (const occurrence of occurrences) {
          const state = occurrenceStates.get(occurrence.id);
          const task = taskMap.get(occurrence.task_id);
          if (!task) continue;
          const taskType = normalizeTaskType(task.type || task.name || "OTHER");
          if (state === "LATE") {
            lateAndMissedCounts.set(`Late ${taskType}`, (lateAndMissedCounts.get(`Late ${taskType}`) || 0) + 1);
          }
          if (state === "MISSED") {
            lateAndMissedCounts.set(`Missed ${taskType}`, (lateAndMissedCounts.get(`Missed ${taskType}`) || 0) + 1);
          }
        }

        const escalationCountsByState = new Map<string, number>();
        for (const escalation of escalations) {
          const trigger = (escalation.trigger_state || "UNKNOWN").toUpperCase();
          escalationCountsByState.set(trigger, (escalationCountsByState.get(trigger) || 0) + 1);
        }

        const notificationStatuses = new Map<string, number>();
        for (const notification of notificationRows) {
          const status = (notification.status || "UNKNOWN").toUpperCase();
          notificationStatuses.set(status, (notificationStatuses.get(status) || 0) + 1);
        }

        const categoryCounts = new Map<string, number>();
        let associatedDocumentCount = 0;
        for (const document of documents) {
          if (document.task_id) associatedDocumentCount += 1;
          const category = (document.document_category || "OTHER").toUpperCase();
          categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
        }

        const appointmentCounts = {
          total: 0,
          scheduled: 0,
          completed: 0,
          missed: 0,
          cancelled: 0,
          rescheduled: 0,
        };
        for (const task of tasks) {
          const taskType = normalizeTaskType(task.type || task.name || "OTHER");
          if (taskType !== "APPOINTMENT") continue;
          appointmentCounts.total += 1;
          const occurrence = latestOccurrenceByTask.get(task.id);
          if (!occurrence) continue;
          const occurrenceStatus = (occurrence.status || "").toUpperCase();
          const appointmentEvent = events.find(
            (event) =>
              event.occurrence_id === occurrence.id &&
              event.source === "APPOINTMENT",
          );
          const appointmentEventValue = (appointmentEvent?.value || "").toUpperCase();
          const state = occurrenceStates.get(occurrence.id);

          if (
            occurrenceStatus === "CANCELLED" ||
            appointmentEventValue === "CANCELLED"
          ) {
            appointmentCounts.cancelled += 1;
          } else if (
            occurrenceStatus === "RESCHEDULED" ||
            appointmentEventValue === "RESCHEDULED"
          ) {
            appointmentCounts.rescheduled += 1;
          } else if (state === "ON_TIME") {
            appointmentCounts.completed += 1;
          } else if (state === "LATE" || state === "MISSED") {
            appointmentCounts.missed += 1;
          } else {
            appointmentCounts.scheduled += 1;
          }
        }

        if (!active) return;

        const nextMetrics: AnalyticsMetrics = {
          patients: datasetValue.patientRows.length,
          carePlans: plans.length,
          tasks: tasks.length,
          occurrences: occurrences.length,
          onTime: stateCounts.ON_TIME || 0,
          late: stateCounts.LATE || 0,
          missed: stateCounts.MISSED || 0,
          unconfirmed: stateCounts.UNCONFIRMED || 0,
          conflicting: stateCounts.CONFLICTING || 0,
          pending: stateCounts.PENDING || 0,
          activeEscalations: escalations.filter((item) => !["RESOLVED", "CLOSED"].includes((item.status || "").toUpperCase())).length,
          resolvedEscalations: escalations.filter((item) => (item.status || "").toUpperCase() === "RESOLVED").length,
          averageResolutionHours:
            resolutionTimes.length === 0
              ? null
              : resolutionTimes.reduce((sum, duration) => sum + duration, 0) / resolutionTimes.length / 3_600_000,
        };

        setDataset(datasetValue);
        setMetrics(nextMetrics);
        setStates(stateCounts);
        setEscalationTrend(days.map((day) => escalationCounts.get(day) || 0));
        setCompletionTrend(days.map((day) => completionCounts.get(day) || 0));
        setEvidenceSources([...evidenceCounts.entries()].sort((left, right) => right[1] - left[1]));
        setBlockedDependencies([...dependencyStateMap.values()].filter((result) => result.state === "BLOCKED").length);
        setCarePlanPerformance(
          [...performance.values()].filter((item) => item.total > 0).sort((left, right) => left.name.localeCompare(right.name)),
        );
        setTaskTypeBreakdown(
          [...taskTypeCounts.entries()]
            .map(([label, value]) => ({ label, value, total: taskTypeTotals.get(label) || value }))
            .sort((left, right) => right.value - left.value),
        );
        setLateAndMissedBreakdown(
          [...lateAndMissedCounts.entries()]
            .map(([label, value]) => ({ label, value }))
            .sort((left, right) => right.value - left.value)
            .slice(0, 8),
        );
        setEscalationSummary(
          [...escalationCountsByState.entries()]
            .map(([label, value]) => ({ label, value }))
            .sort((left, right) => right.value - left.value),
        );
        setNotificationSummary(
          [...notificationStatuses.entries()].map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value),
        );
        setDocumentSummary({
          total: documents.length,
          associated: associatedDocumentCount,
          categoryCounts: [...categoryCounts.entries()].map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value),
        });
        setAppointmentSummary(appointmentCounts);
      } catch (loadError) {
        console.error("Unable to load research analytics.", loadError);
        if (active) {
          setError("Analytics could not be loaded from the authorized data. Check the connection and database access.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();
    return () => {
      active = false;
    };
  }, []);

  const maxStateCount = Math.max(1, ...Object.values(states));
  const maxTrend = Math.max(1, ...escalationTrend, ...completionTrend);

  const filteredTaskTypes = useMemo(() => {
    if (!dataset) return [];

    const rangeFilteredTasks = dataset.taskRows.filter((task) => isWithinRange(task.created_at, range));
    const tasks = taskTypeFilter === "ALL" ? rangeFilteredTasks : rangeFilteredTasks.filter((task) => normalizeTaskType(task.type || task.name || "OTHER") === taskTypeFilter);

    return tasks;
  }, [dataset, range, taskTypeFilter]);

  const filteredOccurrences = useMemo(() => {
    if (!dataset) return [];
    return dataset.occurrenceRows.filter((occurrence) => isWithinRange(occurrence.occurrence_date, range));
  }, [dataset, range]);

  const filteredEvents = useMemo(() => {
    if (!dataset) return [];
    return dataset.eventRows.filter((event) => isWithinRange(event.event_time, range));
  }, [dataset, range]);

  const filteredDocuments = useMemo(() => {
    if (!dataset) return [];
    return dataset.documentRows.filter((document) => isWithinRange(document.uploaded_at, range));
  }, [dataset, range]);

  const filteredEscalations = useMemo(() => {
    if (!dataset) return [];
    return dataset.escalationRows.filter((item) => isWithinRange(item.created_at, range));
  }, [dataset, range]);

  const selectedRangeLabel = range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "All available data";
  const executionRate = metrics ? rateValue(metrics.onTime + metrics.late + metrics.missed + metrics.unconfirmed + metrics.conflicting, metrics.occurrences) : 0;
  const completionRate = metrics ? rateValue(metrics.onTime + metrics.late + metrics.missed, metrics.occurrences) : 0;
  const verificationRate = metrics ? rateValue(metrics.onTime + metrics.late + metrics.conflicting, metrics.occurrences) : 0;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/30">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-400">SmartCare</p>
              <h1 className="mt-2 text-3xl font-semibold">Care-plan execution insights</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["7d", "30d", "all"] as RangeKey[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    range === value
                      ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                      : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500"
                  }`}
                  onClick={() => setRange(value)}
                >
                  {value === "7d" ? "7 days" : value === "30d" ? "30 days" : "All data"}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm text-slate-300">
            Execution metrics are calculated from the records visible to the current authorized account. The analytics layer uses the existing execution engine and remains separate from medical diagnosis or risk prediction.
          </p>
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            Live authorization and RLS validation remain required before claiming production-ready analytics. This view is a source-aligned dashboard for authorized records only.
          </div>
        </header>

        {isDemo && (
          <div
            className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EA9D9D]/40 bg-[#601D49]/25 p-4 text-xs text-[#FFEBB8]"
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#FFEBB8] px-2 py-0.5 font-bold text-[#4a1538]">
                DEMO PREVIEW
              </span>
              <span>
                Viewing research analytics in demo preview mode with synthetic cohort data. Protected hospital and patient databases remain secured behind authorization.
              </span>
            </div>
            <span className="text-[#EA9D9D]">Simulated cohort metrics</span>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-8 text-slate-400">Loading authorized analytics…</p>
        ) : metrics ? (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Care plans", metrics.carePlans],
                ["Active tasks", filteredTaskTypes.length],
                ["Occurrences", filteredOccurrences.length || metrics.occurrences],
                ["On-time", metrics.onTime],
                ["Late", metrics.late],
                ["Missed", metrics.missed],
                ["Blocked dependencies", blockedDependencies],
                ["Active escalations", metrics.activeEscalations],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">{label}</p>
                  <p className="mt-2 text-3xl font-semibold">{value}</p>
                </div>
              ))}
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-lg font-semibold">Execution-state distribution</h2>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-400">{selectedRangeLabel}</span>
                </div>
                <div className="mt-5 space-y-3">
                  {STATE_ORDER.map((state) => (
                    <div key={state}>
                      <div className="mb-1 flex justify-between text-xs text-slate-400">
                        <span>{state.replaceAll("_", " ")}</span>
                        <span>{states[state] || 0}</span>
                      </div>
                      <div className="h-2 rounded bg-slate-800">
                        <div
                          className="h-2 rounded bg-emerald-500"
                          style={{ width: `${((states[state] || 0) / maxStateCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Execution trend</h2>
                <div className="mt-5 flex h-44 items-end gap-1">
                  {escalationTrend.map((value, index) => (
                    <div key={index} className="flex h-full min-w-0 flex-1 items-end gap-px" title={`${value} escalations`}>
                      <div className="w-1/2 rounded-t bg-orange-500/80" style={{ height: `${(value / maxTrend) * 100}%` }} />
                      <div className="w-1/2 rounded-t bg-emerald-500/80" style={{ height: `${((completionTrend[index] || 0) / maxTrend) * 100}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-slate-400">
                  <span><i className="mr-2 inline-block h-2 w-2 rounded-sm bg-orange-500" />Escalations</span>
                  <span><i className="mr-2 inline-block h-2 w-2 rounded-sm bg-emerald-500" />Completion events</span>
                </div>
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">Task-type execution</h2>
                  <select
                    value={taskTypeFilter}
                    onChange={(event) => setTaskTypeFilter(event.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
                  >
                    <option value="ALL">All task types</option>
                    {TASK_TYPE_ORDER.map((type) => (
                      <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </div>
                {taskTypeBreakdown.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No task-type data is available for the selected range.</p>
                ) : (
                  <div className="mt-5 space-y-3">
                    {taskTypeBreakdown.map((entry) => (
                      <div key={entry.label}>
                        <div className="mb-1 flex justify-between text-sm text-slate-300">
                          <span>{entry.label.replaceAll("_", " ")}</span>
                          <span>{entry.value}</span>
                        </div>
                        <div className="h-2 rounded bg-slate-800">
                          <div className="h-2 rounded bg-[#BD5579]" style={{ width: `${rateValue(entry.value, Math.max(...taskTypeBreakdown.map((item) => item.value), 1))}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Evidence-source distribution</h2>
                {evidenceSources.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No evidence records are available.</p>
                ) : (
                  <ul className="mt-5 space-y-2">
                    {evidenceSources.map(([source, count]) => (
                      <li key={source} className="flex items-center justify-between text-sm text-slate-300">
                        <span>{source.replaceAll("_", " ")}</span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Late and missed patterns</h2>
                {lateAndMissedBreakdown.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No late or missed task categories are currently visible.</p>
                ) : (
                  <ul className="mt-4 space-y-2 text-sm text-slate-300">
                    {lateAndMissedBreakdown.map((entry) => (
                      <li key={entry.label} className="flex items-center justify-between gap-3">
                        <span>{entry.label.replaceAll("_", " ")}</span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{entry.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Escalation overview</h2>
                {escalationSummary.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No escalation data is visible for this authorization window.</p>
                ) : (
                  <ul className="mt-4 space-y-2 text-sm text-slate-300">
                    {escalationSummary.map((entry) => (
                      <li key={entry.label} className="flex items-center justify-between gap-3">
                        <span>{entry.label.replaceAll("_", " ")}</span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{entry.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Notification status</h2>
                {notificationSummary.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No notification data is available.</p>
                ) : (
                  <ul className="mt-4 space-y-2 text-sm text-slate-300">
                    {notificationSummary.map((entry) => (
                      <li key={entry.label} className="flex items-center justify-between gap-3">
                        <span>{entry.label.replaceAll("_", " ")}</span>
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs">{entry.value}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="mt-6 grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Appointment and document summary</h2>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="flex items-center justify-between"><span>Upcoming/scheduled</span><span>{appointmentSummary.scheduled}</span></div>
                  <div className="flex items-center justify-between"><span>Completed</span><span>{appointmentSummary.completed}</span></div>
                  <div className="flex items-center justify-between"><span>Missed</span><span>{appointmentSummary.missed}</span></div>
                  <div className="flex items-center justify-between"><span>Cancelled</span><span>{appointmentSummary.cancelled}</span></div>
                  <div className="flex items-center justify-between"><span>Rescheduled</span><span>{appointmentSummary.rescheduled}</span></div>
                  <div className="flex items-center justify-between"><span>Documents uploaded</span><span>{documentSummary.total}</span></div>
                  <div className="flex items-center justify-between"><span>Documents tied to tasks</span><span>{documentSummary.associated}</span></div>
                </div>
                {documentSummary.categoryCounts.length > 0 && (
                  <div className="mt-5 space-y-2">
                    {documentSummary.categoryCounts.slice(0, 5).map((entry) => (
                      <div key={entry.label} className="flex justify-between text-xs text-slate-400">
                        <span>{entry.label.replaceAll("_", " ")}</span>
                        <span>{entry.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h2 className="text-lg font-semibold">Care-plan performance</h2>
                {carePlanPerformance.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-400">No care-plan performance records are available.</p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {carePlanPerformance.map((plan) => (
                      <li key={plan.id}>
                        <div className="mb-1 flex items-center justify-between gap-3 text-sm text-slate-300">
                          <span className="truncate">{plan.name}</span>
                          <span>{plan.onTime}/{plan.total} on time</span>
                        </div>
                        <div className="h-2 rounded bg-slate-800">
                          <div className="h-2 rounded bg-emerald-500" style={{ width: `${rateValue(plan.onTime, plan.total)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
              <h2 className="text-lg font-semibold">Execution-rate summary</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <MetricBlock label="Completion rate" value={`${completionRate.toFixed(1)}%`} detail="Current completed and resolved occurrences relative to all captured occurrences." />
                <MetricBlock label="On-time rate" value={`${rateValue(metrics.onTime, Math.max(metrics.occurrences, 1)).toFixed(1)}%`} detail="Occurrences completed within the allowed execution window." />
                <MetricBlock label="Evidence verification rate" value={`${verificationRate.toFixed(1)}%`} detail="Occurrences with valid or reconciled evidence for the selected execution context." />
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Average resolution time: {metrics.averageResolutionHours === null ? "Unavailable (no resolved escalation records)" : `${metrics.averageResolutionHours.toFixed(2)} hours`} · Execution trend does not treat futures or pending items as historical misses.
              </p>
            </section>
          </>
        ) : (
          <p className="mt-8 text-slate-400">No analytics are available.</p>
        )}
      </div>
    </main>
  );
}

function MetricBlock({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-sm text-slate-400">{detail}</p>
    </div>
  );
}
