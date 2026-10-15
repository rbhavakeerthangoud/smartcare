"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { evaluateExecution } from "@/lib/smartcare/execution-engine";
import {
  createEscalationCandidate,
  hasMatchingEscalation,
} from "@/lib/smartcare/escalation-engine";
import type { EscalationCandidate } from "@/lib/smartcare/escalation-engine";
import { evaluateDependencies } from "@/lib/smartcare/dependency-engine";
import { useSmartCareAuth } from "@/lib/supabase/auth-context";
import type {
  DependencyType,
  ExecutionState,
} from "@/lib/smartcare/types";

type Patient = {
  id: string;
  full_name: string;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
};

type CarePlan = {
  id: string;
  patient_id: string;
  name: string;
  description?: string | null;
  source_type: string;
  start_date: string;
  end_date?: string | null;
  status: string;
  created_at: string;
};

type Task = {
  id: string;
  care_plan_id: string;
  type: string;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  allowed_start_time?: string | null;
  allowed_end_time?: string | null;
  frequency: string;
  priority: string;
  completion_criteria?: string | null;
  verification_method?: string | null;
  dependency_type?: string | null;
  status: string;
};

type TaskOccurrence = {
  id: string;
  task_id: string;
  occurrence_date: string;
  time_zone?: string | null;
  allowed_start_time?: string | null;
  allowed_end_time?: string | null;
  status: string;
  completed_at?: string | null;
  completion_source?: string | null;
  notes?: string | null;
};

type Event = {
  id: string;
  task_id: string;
  occurrence_id?: string | null;
  event_time: string;
  source: string;
  value?: string | null;
  confidence?: number | null;
  notes?: string | null;
};

type DocumentRecord = {
  id: string;
  task_id: string;
  occurrence_id?: string | null;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size?: number | null;
  uploaded_at: string;
};

type Dependency = {
  id: string;
  care_plan_id: string;
  prerequisite_task_id: string;
  dependent_task_id: string;
  dependency_type: string;
  created_at: string;
};

type Escalation = {
  id: string;
  care_plan_id: string;
  task_id?: string | null;
  occurrence_id?: string | null;
  trigger_state: string;
  priority: string;
  recipient_type: string;
  recipient_id?: string | null;
  status: string;
  message?: string | null;
  created_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
};

type CarePlanVersion = {
  id: string;
  version: number;
  snapshot: Record<string, unknown>;
  author_id: string | null;
  reason: string | null;
  created_at: string;
};

type PatientAccessGrant = {
  patient_id: string;
  user_id: string;
  access_role: "PATIENT" | "CAREGIVER" | "CLINICIAN";
  active: boolean;
  granted_at: string;
};

function versionFields(
  version: CarePlanVersion,
  previous?: CarePlanVersion,
) {
  return ["name", "description", "status", "source_type", "start_date", "end_date"]
    .filter((key) => {
      if (!(key in version.snapshot)) return false;
      return (
        !previous ||
        JSON.stringify(version.snapshot[key]) !==
          JSON.stringify(previous.snapshot[key])
      );
    })
    .map((key) => ({
      label: key.replaceAll("_", " "),
      value:
        version.snapshot[key] == null
          ? "—"
          : String(version.snapshot[key]),
    }));
}

function formatTaskType(type: string) {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatFrequency(frequency: string) {
  return frequency
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(date?: string | null) {
  if (!date) return "—";

  const parts = date.split("-");

  if (parts.length !== 3) return date;

  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatTime(time?: string | null) {
  if (!time) return "—";

  const [hourString, minuteString] = time.split(":");

  const hour = Number(hourString);
  const minute = Number(minuteString);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatFileSize(size?: number | null) {
  if (!size) return "—";

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(fileType: string) {
  return fileType.startsWith("image/");
}

function stateClasses(state: string) {
  switch (state) {
    case "ON_TIME":
      return "border-green-500/30 bg-green-500/10 text-green-400";

    case "LATE":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";

    case "BEFORE_WINDOW":
      return "border-emerald-700/30 bg-emerald-700/10 text-emerald-700";

    case "UNCONFIRMED":
      return "border-orange-500/30 bg-orange-500/10 text-orange-400";

    case "CONFLICTING":
      return "border-red-500/30 bg-red-500/10 text-red-400";

    case "DOCUMENT_RECORDED":
      return "border-emerald-600/30 bg-emerald-600/10 text-emerald-700";

    case "REPORTED":
      return "border-slate-200 bg-slate-50 text-slate-700";

    default:
      return "border-white/10 bg-white/5 text-white/60";
  }
}

function stateLabelForRole(state: ExecutionState, patientView: boolean) {
  if (!patientView) return state;
  switch (state) {
    case "ON_TIME":
      return "Completed on time";
    case "LATE":
      return "Completed outside the allowed time";
    case "MISSED":
      return "Past due";
    case "PENDING":
      return "Scheduled";
    case "BEFORE_WINDOW":
      return "Recorded before the allowed time";
    case "UNCONFIRMED":
      return "Waiting for supporting information";
    case "CONFLICTING":
      return "Some information needs review";
    case "DOCUMENT_RECORDED":
      return "Document received";
    case "REPORTED":
      return "Reported complete";
    case "INSUFFICIENT_EVIDENCE":
      return "Your care team may need to review this";
    default:
      return "In progress";
  }
}

function dependencyClasses(state: string) {
  switch (state) {
    case "READY":
      return "border-green-500/30 bg-green-500/10 text-green-400";

    case "AT_RISK":
      return "border-yellow-500/30 bg-yellow-500/10 text-yellow-400";

    default:
      return "border-red-500/30 bg-red-500/10 text-red-400";
  }
}

async function requestEscalation(
  candidate: EscalationCandidate,
): Promise<{ escalationId: string }> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError || !session) {
    throw new Error("Your session expired. Sign in again to create an escalation.");
  }

  const response = await fetch("/api/escalations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      carePlanId: candidate.carePlanId,
      taskId: candidate.taskId,
      occurrenceId: candidate.occurrenceId,
      triggerState: candidate.rule.triggerState,
    }),
  });
  const payload: unknown = await response.json();
  const result =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "Escalation could not be created.",
    );
  }
  if (typeof result.escalation_id !== "string") {
    throw new Error("Escalation was not returned by the database.");
  }

  return { escalationId: result.escalation_id };
}


export default function CarePlanDetailsPage() {
  const params = useParams();
  const { role, loading: authLoading } = useSmartCareAuth();

  const carePlanId =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
      ? params.id[0]
      : "";
  const [carePlan, setCarePlan] = useState<CarePlan | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [occurrences, setOccurrences] = useState<TaskOccurrence[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [documentUrls, setDocumentUrls] = useState<Record<string, string>>({});
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [versions, setVersions] = useState<CarePlanVersion[]>([]);
  const [versionError, setVersionError] = useState("");
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionReload, setVersionReload] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [actionOccurrenceId, setActionOccurrenceId] =
    useState<string | null>(null);

  const [accessGrants, setAccessGrants] = useState<PatientAccessGrant[]>([]);

  async function handleGrantAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient || !carePlan) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const targetUserId = String(data.get("grantUserId") || "").trim();
    const targetRole = String(data.get("grantRole") || "PATIENT") as "PATIENT" | "CAREGIVER";

    if (!targetUserId) {
      setError("Please provide a valid account User ID (UUID).");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUserId = sessionData.session?.user.id;
      const { error: grantErr } = await supabase
        .from("smartcare_patient_access")
        .upsert(
          {
            patient_id: patient.id,
            user_id: targetUserId,
            access_role: targetRole,
            active: true,
            granted_by: currentUserId,
          },
          { onConflict: "patient_id,user_id,access_role" },
        );

      if (grantErr) throw new Error(grantErr.message);

      setMessage(`Access granted successfully to ${targetRole.toLowerCase()} account.`);
      setError("");
      form.reset();
      const { data: refreshed } = await supabase
        .from("smartcare_patient_access")
        .select("patient_id,user_id,access_role,active,granted_at")
        .eq("patient_id", patient.id)
        .order("granted_at", { ascending: false });
      setAccessGrants(refreshed || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to grant access.");
    }
  }

  async function handleToggleAccessStatus(grant: PatientAccessGrant) {
    const nextActive = !grant.active;
    const actionName = nextActive ? "restore" : "revoke";
    if (
      !window.confirm(
        `Are you sure you want to ${actionName} access for user ${grant.user_id}? ${
          !nextActive
            ? "The user will immediately lose access to this care plan, tasks, and document uploads."
            : ""
        }`,
      )
    ) {
      return;
    }

    try {
      const { error: updateErr } = await supabase
        .from("smartcare_patient_access")
        .update({ active: nextActive })
        .eq("patient_id", grant.patient_id)
        .eq("user_id", grant.user_id)
        .eq("access_role", grant.access_role);

      if (updateErr) throw new Error(updateErr.message);

      setAccessGrants((curr) =>
        curr.map((g) =>
          g.patient_id === grant.patient_id &&
          g.user_id === grant.user_id &&
          g.access_role === grant.access_role
            ? { ...g, active: nextActive }
            : g,
        ),
      );
      setMessage(`Access ${nextActive ? "restored" : "revoked"} successfully.`);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${actionName} access.`);
    }
  }

  async function updateCarePlanStatus(nextStatus: "ACTIVE" | "ARCHIVED") {
    if (!carePlan) return;

    const isArchiving = nextStatus === "ARCHIVED";
    const confirmed = window.confirm(
      isArchiving
        ? "Archive this care plan? Historical records remain available, but the plan will be marked inactive in active workflows."
        : "Restore this care plan so it can be used in active workflows again?",
    );

    if (!confirmed) return;

    try {
      const { error: updateError } = await supabase
        .from("care_plans")
        .update({ status: nextStatus })
        .eq("id", carePlan.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setCarePlan((current) =>
        current ? { ...current, status: nextStatus } : current,
      );
      setMessage(
        isArchiving
          ? "Care plan archived successfully. Historical records remain intact."
          : "Care plan restored successfully.",
      );
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update the care plan status.",
      );
    }
  }

  async function updateTaskStatus(taskId: string, nextStatus: "PENDING" | "ARCHIVED") {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    if (!task) return;

    const isArchiving = nextStatus === "ARCHIVED";
    const confirmed = window.confirm(
      isArchiving
        ? "Archive this task? The task history and evidence remain available, but it will no longer be active in routine care workflows."
        : "Restore this task so it can be used again in active care workflows?",
    );

    if (!confirmed) return;

    try {
      const { data, error: updateError } = await supabase
        .from("tasks")
        .update({ status: nextStatus })
        .eq("id", taskId)
        .select("*")
        .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      setTasks((current) =>
        current.map((currentTask) =>
          currentTask.id === taskId ? { ...currentTask, status: data.status } : currentTask,
        ),
      );
      setMessage(
        isArchiving
          ? `Task "${task.name}" archived successfully.`
          : `Task "${task.name}" restored successfully.`,
      );
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not update the task status.",
      );
    }
  }
  const [evaluatedAt, setEvaluatedAt] = useState(() => new Date());
  const attemptedEscalations = useRef(new Set<string>());
  const canViewHistory = role === "CLINICIAN" || role === "ADMIN";

  useEffect(() => {
    const timer = setInterval(() => setEvaluatedAt(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;

    async function loadSignedReportUrls() {
      if (documents.length === 0) {
        setDocumentUrls({});
        return;
      }

      try {
        const entries = await Promise.all(
          documents.map(async (document) => {
            const { data, error: urlError } = await supabase.storage
              .from("reports")
              .createSignedUrl(document.file_path, 60 * 60);

            if (urlError) {
              console.error("Unable to create a signed report URL.", urlError);
              return [document.file_path, ""] as const;
            }
            return [document.file_path, data.signedUrl] as const;
          }),
        );

        if (!active) return;
        setDocumentUrls(Object.fromEntries(entries));
        if (entries.some(([, url]) => !url)) {
          setError(
            "One or more reports could not be opened. Check your access and storage configuration.",
          );
        }
      } catch (error) {
        console.error("Unable to load signed report URLs.", error);
        if (!active) return;
        setError(
          "Report links are temporarily unavailable. Please retry.",
        );
      }
    }

    void loadSignedReportUrls();
    const refreshTimer = setInterval(() => void loadSignedReportUrls(), 50 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(refreshTimer);
    };
  }, [documents]);

  /*
  |--------------------------------------------------------------------------
  | Load Care Plan
  |--------------------------------------------------------------------------
  */

  useEffect(() => {
    if (!carePlanId) return;

    async function loadCarePlan() {
      setLoading(true);
      setError("");

      try {
        if (role && role !== "CLINICIAN" && role !== "ADMIN") {
          setError("This care-plan management workspace is restricted to authorized clinicians.");
          setLoading(false);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          setError("Authentication session required to access care plan management.");
          setLoading(false);
          return;
        }

        const { data: carePlanData, error: carePlanError } =
          await supabase
            .from("care_plans")
            .select("*")
            .eq("id", carePlanId)
            .single();

        if (carePlanError) {
          throw new Error(carePlanError.message);
        }

        setCarePlan(carePlanData);

        const { data: patientData, error: patientError } =
          await supabase
            .from("patients")
            .select("*")
            .eq("id", carePlanData.patient_id)
            .single();

        if (patientError) {
          throw new Error(patientError.message);
        }

        setPatient(patientData);

        // Load access grants for this patient (authorized clinicians / admins)
        const { data: grantsData } = await supabase
          .from("smartcare_patient_access")
          .select("patient_id,user_id,access_role,active,granted_at")
          .eq("patient_id", carePlanData.patient_id)
          .order("granted_at", { ascending: false });
        setAccessGrants(grantsData || []);

        const { data: taskData, error: taskError } =
          await supabase
            .from("tasks")
            .select("*")
            .eq("care_plan_id", carePlanId)
            .order("created_at", { ascending: true });

        if (taskError) {
          throw new Error(taskError.message);
        }

        const loadedTasks = taskData || [];
        setTasks(loadedTasks);

        if (loadedTasks.length === 0) {
          setOccurrences([]);
          setEvents([]);
          setDocuments([]);
          setDependencies([]);
          setEscalations([]);
          return;
        }

        const taskIds = loadedTasks.map((task) => task.id);

        const { data: occurrenceData, error: occurrenceError } =
          await supabase
            .from("task_occurrences")
            .select("*")
            .in("task_id", taskIds)
            .order("occurrence_date", { ascending: true });

        if (occurrenceError) {
          throw new Error(occurrenceError.message);
        }

        setOccurrences(occurrenceData || []);

        const { data: eventData, error: eventError } =
          await supabase
            .from("events")
            .select("*")
            .in("task_id", taskIds)
            .order("event_time", { ascending: false });

        if (eventError) {
          throw new Error(eventError.message);
        }

        setEvents(eventData || []);

        const { data: documentData, error: documentError } =
          await supabase
            .from("documents")
            .select("*")
            .in("task_id", taskIds)
            .order("uploaded_at", { ascending: false });

        if (documentError) {
          throw new Error(documentError.message);
        }

        setDocuments(documentData || []);

        const { data: dependencyData, error: dependencyError } =
          await supabase
            .from("dependencies")
            .select("*")
            .eq("care_plan_id", carePlanId)
            .order("created_at", { ascending: true });

        if (dependencyError) {
          throw new Error(dependencyError.message);
        }

        setDependencies(dependencyData || []);

        const { data: escalationData, error: escalationError } =
          await supabase
            .from("escalations")
            .select("*")
            .eq("care_plan_id", carePlanId)
            .order("created_at", { ascending: false });

        if (escalationError) {
          throw new Error(escalationError.message);
        }

        setEscalations(escalationData || []);
      } catch (err) {
        console.error("Failed to load care plan data:", err);
        setError(err instanceof Error ? err.message : "Failed to load care plan data.");
      } finally {
        setLoading(false);
      }
    }

    loadCarePlan();
  }, [carePlanId, role]);

  useEffect(() => {
    let active = true;
    if (!carePlanId || !canViewHistory) {
      return;
    }

    async function loadVersions() {
      setVersionError("");
      const { data, error: queryError } = await supabase
        .from("care_plan_versions")
        .select("id,version,snapshot,author_id,reason,created_at")
        .eq("care_plan_id", carePlanId)
        .order("version", { ascending: false })
        .limit(25);
      if (!active) return;
      if (queryError) {
        console.error("Unable to load care-plan history.", queryError);
        setVersionError("Care-plan history could not be loaded.");
      } else {
        setVersions((data || []) as CarePlanVersion[]);
      }
      setVersionsLoading(false);
    }

    const timer = window.setTimeout(() => {
      setVersionsLoading(true);
      void loadVersions();
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canViewHistory, carePlanId, versionReload]);

  /*
  |--------------------------------------------------------------------------
  | Task Map
  |--------------------------------------------------------------------------
  */

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();

    tasks.forEach((task) => {
      map.set(task.id, task);
    });

    return map;
  }, [tasks]);

  /*
  |--------------------------------------------------------------------------
  | Execution State
  |--------------------------------------------------------------------------
  */

  const getExecutionState = useCallback((
    occurrence: TaskOccurrence,
    task?: Task
  ) => {
    const occurrenceEvents = events
      .filter(
        (event) => event.occurrence_id === occurrence.id
      )
      .sort(
        (a, b) =>
          new Date(b.event_time).getTime() -
          new Date(a.event_time).getTime()
      );

    const occurrenceDocuments = documents.filter(
      (document) => document.occurrence_id === occurrence.id
    );

    const result = evaluateExecution({
      task: task || { id: occurrence.task_id },
      occurrence,
      events: occurrenceEvents.map((event) => ({
        ...event,
        occurrence_id: occurrence.id,
      })),
      documents: occurrenceDocuments.map((document) => ({
        ...document,
        occurrence_id: occurrence.id,
      })),
      now: evaluatedAt,
    });

    return {
      state: result.state as ExecutionState,
      event: occurrenceEvents[0] || null,
      document: occurrenceDocuments[0] || null,
    };
  }, [documents, events, evaluatedAt]);

  useEffect(() => {
    if (
      loading ||
      !carePlan ||
      tasks.length === 0 ||
      (role !== "CLINICIAN" && role !== "ADMIN")
    ) return;
    let cancelled = false;

    async function createRequiredEscalations() {
      for (const occurrence of occurrences) {
        if (cancelled) return;

        const task = taskMap.get(occurrence.task_id);
        if (!task) continue;

        const result = evaluateExecution({
          task,
          occurrence,
          events: events
            .filter((event) => event.occurrence_id === occurrence.id)
            .map((event) => ({
              ...event,
              occurrence_id: occurrence.id,
            })),
          documents: documents
            .filter((document) => document.occurrence_id === occurrence.id)
            .map((document) => ({
              ...document,
              occurrence_id: occurrence.id,
            })),
          now: evaluatedAt,
        });
        const candidate = createEscalationCandidate({
          occurrenceId: occurrence.id,
          taskId: task.id,
          carePlanId,
          taskName: task.name,
          state: result.state,
        });

        if (!candidate || hasMatchingEscalation(escalations, candidate)) {
          continue;
        }

        const key = `${candidate.occurrenceId}:${candidate.rule.triggerState}`;
        if (attemptedEscalations.current.has(key)) continue;
        attemptedEscalations.current.add(key);

        try {
          const { data: existing, error: lookupError } = await supabase
            .from("escalations")
            .select("id")
            .eq("occurrence_id", candidate.occurrenceId)
            .eq("trigger_state", candidate.rule.triggerState)
            .limit(1)
            .maybeSingle();

          if (lookupError) throw new Error(lookupError.message);
          if (existing || cancelled) continue;

          const { escalationId } = await requestEscalation(candidate);
          const { data, error: loadEscalationError } = await supabase
            .from("escalations")
            .select("*")
            .eq("id", escalationId)
            .single();
          if (loadEscalationError) throw new Error(loadEscalationError.message);

          if (data) {
            setEscalations((current) =>
              hasMatchingEscalation(current, candidate)
                ? current
                : [data, ...current],
            );
          }
        } catch (error) {
          attemptedEscalations.current.delete(key);
          setError(
            `Automatic escalation could not be saved: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }
      }
    }

    void createRequiredEscalations();
    return () => {
      cancelled = true;
    };
  }, [
    carePlan,
    carePlanId,
    documents,
    escalations,
    evaluatedAt,
    events,
    loading,
    occurrences,
    role,
    taskMap,
    tasks.length,
  ]);

  const dependencyResults = useMemo(() => {
    const latestOccurrenceByTask = new Map<string, TaskOccurrence>();
    for (const occurrence of occurrences) {
      const current = latestOccurrenceByTask.get(occurrence.task_id);
      if (
        !current ||
        occurrence.occurrence_date > current.occurrence_date
      ) {
        latestOccurrenceByTask.set(occurrence.task_id, occurrence);
      }
    }

    const executionStates = new Map<string, ExecutionState>();
    for (const task of tasks) {
      const occurrence = latestOccurrenceByTask.get(task.id);
      executionStates.set(
        task.id,
        occurrence
          ? getExecutionState(occurrence, task).state
          : "PENDING",
      );
    }

    return evaluateDependencies({
      dependencies: dependencies.map((dependency) => {
        const type = dependency.dependency_type.toUpperCase();
        const dependencyType: DependencyType =
          type === "BEFORE" || type === "AFTER"
            ? type
            : "REQUIRED_BEFORE";

        return {
          prerequisiteTaskId: dependency.prerequisite_task_id,
          dependentTaskId: dependency.dependent_task_id,
          type: dependencyType,
        };
      }),
      executionStates,
    });
  }, [
    dependencies,
    getExecutionState,
    occurrences,
    tasks,
  ]);

  /*
  |--------------------------------------------------------------------------
  | Report Completion
  |--------------------------------------------------------------------------
  */

  async function reportCompletion(
    occurrence: TaskOccurrence
  ) {
    setActionOccurrenceId(occurrence.id);
    setMessage("");
    setError("");

    try {
      const { data, error: eventError } = await supabase
        .from("events")
        .insert({
          task_id: occurrence.task_id,
          occurrence_id: occurrence.id,
          event_time: new Date().toISOString(),
          source: "PATIENT_REPORT",
          value: "completed",
          confidence: 1,
          notes: "Patient reported task completion.",
        })
        .select()
        .single();

      if (eventError) {
        throw new Error(eventError.message);
      }

      if (data) {
        setEvents((current) => [data, ...current]);
      }

      setMessage("Completion event recorded successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not record completion."
      );
    } finally {
      setActionOccurrenceId(null);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | IoT Simulation
  |--------------------------------------------------------------------------
  */

  async function addIoTTestEvent(
    occurrence: TaskOccurrence,
    value: "detected" | "not_detected"
  ) {
    setActionOccurrenceId(occurrence.id);
    setMessage("");
    setError("");

    try {
      const { data, error: eventError } = await supabase
        .from("events")
        .insert({
          task_id: occurrence.task_id,
          occurrence_id: occurrence.id,
          event_time: new Date().toISOString(),
          source: "IOT_SIMULATION",
          value,
          confidence: 0.95,
          notes:
            value === "detected"
              ? "Simulated IoT evidence detected task completion."
              : "Simulated IoT evidence did not detect expected completion.",
        })
        .select()
        .single();

      if (eventError) {
        throw new Error(eventError.message);
      }

      if (data) {
        setEvents((current) => [data, ...current]);
      }

      setMessage(
        value === "detected"
          ? "Simulated IoT confirmation recorded."
          : "Simulated conflicting IoT evidence recorded."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not record IoT event."
      );
    } finally {
      setActionOccurrenceId(null);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Report Upload
  |--------------------------------------------------------------------------
  */

  async function uploadReport(
    occurrence: TaskOccurrence,
    file: File
  ) {
    setActionOccurrenceId(occurrence.id);
    setMessage("");
    setError("");

    try {
      const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
        "image/bmp",
        "image/tiff",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error(
          "Unsupported file type. Upload JPG, PNG, WEBP, GIF, BMP, TIFF, PDF, DOC, or DOCX."
        );
      }

      const maxSize = 10 * 1024 * 1024;

      if (file.size > maxSize) {
        throw new Error("Maximum file size is 10 MB.");
      }

      const cleanFileName = file.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      const filePath =
        `${carePlanId}/${occurrence.task_id}/${occurrence.id}/${Date.now()}-${cleanFileName}`;

      const { error: uploadError } =
        await supabase.storage
          .from("reports")
          .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
          });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: documentData, error: documentError } =
        await supabase
          .from("documents")
          .insert({
            task_id: occurrence.task_id,
            occurrence_id: occurrence.id,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            file_size: file.size,
          })
          .select()
          .single();

      if (documentError) {
        await supabase.storage
          .from("reports")
          .remove([filePath]);

        throw new Error(documentError.message);
      }

      if (documentData) {
        setDocuments((current) => [
          documentData,
          ...current,
        ]);
      }

      setMessage("Report uploaded successfully.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not upload report."
      );
    } finally {
      setActionOccurrenceId(null);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Public Report URL
  |--------------------------------------------------------------------------
  */

  function getDocumentUrl(filePath: string) {
    return documentUrls[filePath] || "";
  }

  /*
  |--------------------------------------------------------------------------
  | Create Escalation
  |--------------------------------------------------------------------------
  */

  async function createEscalation(
    occurrence: TaskOccurrence,
    triggerState: ExecutionState,
  ) {
    setActionOccurrenceId(occurrence.id);
    setMessage("");
    setError("");

    try {
      const task = taskMap.get(occurrence.task_id);

      if (!task) {
        throw new Error("Task could not be found.");
      }

      const candidate = createEscalationCandidate({
        occurrenceId: occurrence.id,
        taskId: task.id,
        carePlanId,
        taskName: task.name,
        state: triggerState,
      });

      if (!candidate) {
        throw new Error("This execution state does not have an escalation rule.");
      }

      if (hasMatchingEscalation(escalations, candidate)) {
        throw new Error(
          "An escalation already exists for this occurrence and trigger state."
        );
      }

      const { data: existing, error: lookupError } = await supabase
        .from("escalations")
        .select("id")
        .eq("occurrence_id", occurrence.id)
        .eq("trigger_state", triggerState)
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        throw new Error(lookupError.message);
      }
      if (existing) {
        throw new Error(
          "An escalation already exists for this occurrence and trigger state."
        );
      }

      const { escalationId } = await requestEscalation(candidate);
      const { data, error: loadEscalationError } = await supabase
        .from("escalations")
        .select("*")
        .eq("id", escalationId)
        .single();
      if (loadEscalationError) throw new Error(loadEscalationError.message);

      if (data) {
        setEscalations((current) => [
          data,
          ...current,
        ]);
      }

      setMessage(
        `Escalation created for ${candidate.rule.recipientType.replaceAll(
          "_",
          " "
        )}.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not create escalation."
      );
    } finally {
      setActionOccurrenceId(null);
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Update Escalation Status
  |--------------------------------------------------------------------------
  */

  async function updateEscalationStatus(
    escalation: Escalation,
    status: "ACKNOWLEDGED" | "RESOLVED"
  ) {
    setMessage("");
    setError("");

    try {
      const updateData: Record<string, string> = {
        status,
      };

      if (status === "ACKNOWLEDGED") {
        updateData.acknowledged_at =
          new Date().toISOString();
      }

      if (status === "RESOLVED") {
        updateData.resolved_at =
          new Date().toISOString();
      }

      const { data, error: updateError } =
        await supabase
          .from("escalations")
          .update(updateData)
          .eq("id", escalation.id)
          .select()
          .single();

      if (updateError) {
        throw new Error(updateError.message);
      }

      if (data) {
        setEscalations((current) =>
          current.map((item) =>
            item.id === data.id
              ? data
              : item
          )
        );
      }

      setMessage(
        `Escalation marked as ${status}.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not update escalation."
      );
    }
  }

  /*
  |--------------------------------------------------------------------------
  | Execution Summary
  |--------------------------------------------------------------------------
  */

  const executionSummary = useMemo(() => {
    let onTime = 0;
    let late = 0;
    let missed = 0;
    let pending = 0;
    let beforeWindow = 0;
    let unconfirmed = 0;
    let conflicting = 0;
    let insufficientEvidence = 0;
    let reported = 0;
    let documentRecorded = 0;

    occurrences.forEach((occurrence) => {
      const task = taskMap.get(occurrence.task_id);

      const result = getExecutionState(
        occurrence,
        task
      );

      switch (result.state) {
        case "ON_TIME":
          onTime++;
          break;

        case "LATE":
          late++;
          break;

        case "MISSED":
          missed++;
          break;

        case "BEFORE_WINDOW":
          beforeWindow++;
          break;

        case "UNCONFIRMED":
          unconfirmed++;
          break;

        case "CONFLICTING":
          conflicting++;
          break;

        case "INSUFFICIENT_EVIDENCE":
          insufficientEvidence++;
          break;

        case "DOCUMENT_RECORDED":
          documentRecorded++;
          break;

        case "REPORTED":
          reported++;
          break;

        default:
          pending++;
      }
    });

    return {
      onTime,
      late,
      missed,
      pending,
      beforeWindow,
      unconfirmed,
      conflicting,
      insufficientEvidence,
      reported,
      documentRecorded,
    };
  }, [
    occurrences,
    taskMap,
    getExecutionState,
  ]);

  const patientReviewCount =
    executionSummary.late +
    executionSummary.missed +
    executionSummary.unconfirmed +
    executionSummary.conflicting +
    executionSummary.insufficientEvidence;

  /*
  |--------------------------------------------------------------------------
  | Role Guard
  |--------------------------------------------------------------------------
  */

  if (!authLoading && role && role !== "CLINICIAN" && role !== "ADMIN") {
    return (
      <main className="grid min-h-screen place-items-center px-6 bg-black text-white">
        <section className="max-w-lg rounded-2xl border border-white/10 bg-[#180a15] p-8 text-center shadow-2xl">
          <h1 className="text-xl font-bold text-white">Clinician Workspace Restricted</h1>
          <p className="mt-3 text-sm text-slate-300">
            This care-plan management workspace is reserved for authorized healthcare clinicians and administrators.
            Patients access their care instructions, daily schedules, and progress tracking through the Patient Portal.
          </p>
          <Link
            href={role === "PATIENT" ? "/patient" : role === "CAREGIVER" ? "/caregiver" : "/"}
            className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#BD5579] px-5 text-sm font-semibold text-white transition hover:bg-[#852765]"
          >
            Return to your dashboard
          </Link>
        </section>
      </main>
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Loading
  |--------------------------------------------------------------------------
  */

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-white/60">
            Loading care plan...
          </p>
        </div>
      </main>
    );
  }

  if (error && !carePlan) {
    return (
      <main className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <h1 className="text-xl font-semibold">
              Could not load care plan
            </h1>

            <p className="mt-2 text-red-300">
              {error}
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!carePlan) {
    return (
      <main className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-white/60">
            Care plan not found.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* ============================================================
            HEADER
        ============================================================ */}

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">

          <div>

            <Link
              href={
                role === "ADMIN"
                  ? "/admin"
                  : role === "CLINICIAN"
                    ? "/clinical"
                    : role === "CAREGIVER"
                      ? "/caregiver"
                      : "/"
              }
              className="text-sm text-white/50 hover:text-white"
            >
              ← Back to Care Plans
            </Link>

            <h1 className="mt-3 text-3xl font-bold">
              {carePlan.name}
            </h1>

            <p className="mt-2 text-white/60">
              {carePlan.description ||
                "Post-discharge care plan"}
            </p>

          </div>

          {(role === "CLINICIAN" || role === "ADMIN") && (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/tasks/new?carePlanId=${carePlan.id}`}
                className="rounded-xl bg-white text-black px-5 py-3 font-semibold text-center"
              >
                + Add Task
              </Link>

              <button
                type="button"
                onClick={() =>
                  void updateCarePlanStatus(
                    carePlan.status?.toUpperCase() === "ARCHIVED" ? "ACTIVE" : "ARCHIVED",
                  )
                }
                className="rounded-xl border border-white/20 bg-white/[0.04] px-5 py-3 font-semibold text-white"
              >
                {carePlan.status?.toUpperCase() === "ARCHIVED"
                  ? "Restore Care Plan"
                  : "Archive Care Plan"}
              </button>
            </div>
          )}

        </div>

        {/* ============================================================
            MESSAGES
        ============================================================ */}

        {message && (
          <div className="mt-6 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
            {message}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
            {error}
          </div>
        )}

        {/* ============================================================
            CARE PLAN INFO
        ============================================================ */}

        <section className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-white/50">
              Patient
            </p>

            <p className="mt-2 font-semibold">
              {patient?.full_name || "—"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-white/50">
              Status
            </p>

            <p className="mt-2 font-semibold">
              {carePlan.status}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-white/50">
              Start Date
            </p>

            <p className="mt-2 font-semibold">
              {formatDate(carePlan.start_date)}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <p className="text-sm text-white/50">
              End Date
            </p>

            <p className="mt-2 font-semibold">
              {formatDate(carePlan.end_date)}
            </p>
          </div>

        </section>

        {(role === "CLINICIAN" || role === "ADMIN") && (
          <section className="mt-8 rounded-2xl border border-[#BD5579]/30 bg-[#180a15]/90 p-6 shadow-xl backdrop-blur-md">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#BD5579]" />
                  <p className="text-xs font-bold uppercase tracking-wider text-[#EA9D9D]">
                    Patient Portal Access Governance
                  </p>
                </div>
                <h2 className="mt-1 text-lg font-bold text-white">
                  Authorized Patient & Caregiver Accounts
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Only accounts granted active authorization below can access this patient&apos;s care plan in their portal. Revocation takes effect immediately database-wide.
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-[0.7rem] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="pb-3 font-semibold">User Account ID</th>
                    <th className="pb-3 font-semibold">Access Role</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Granted Date</th>
                    <th className="pb-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {accessGrants.map((grant) => (
                    <tr key={`${grant.patient_id}-${grant.user_id}-${grant.access_role}`}>
                      <td className="py-3 font-mono text-slate-200">{grant.user_id}</td>
                      <td className="py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider ${
                          grant.access_role === 'PATIENT' ? 'bg-[#601D49] text-[#FFEBB8]' : 'bg-[#BD5579]/20 text-[#EA9D9D]'
                        }`}>
                          {grant.access_role}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold ${
                          grant.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${grant.active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          {grant.active ? 'ACTIVE' : 'REVOKED'}
                        </span>
                      </td>
                      <td className="py-3 text-slate-400">{new Date(grant.granted_at).toLocaleDateString()}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleToggleAccessStatus(grant)}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition ${
                            grant.active
                              ? 'border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
                              : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                          }`}
                        >
                          {grant.active ? 'Revoke Access' : 'Restore Access'}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {accessGrants.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-slate-400">
                        No external portal accounts have been granted access to this patient record yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <form onSubmit={handleGrantAccess} className="mt-5 rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <p className="text-xs font-semibold text-slate-300">Grant Portal Access to Another Account</p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  name="grantUserId"
                  placeholder="User Account ID (UUID)"
                  required
                  className="flex-1 rounded-lg border border-white/10 bg-[#0f050d] px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-[#BD5579] focus:outline-none"
                />
                <select
                  name="grantRole"
                  className="rounded-lg border border-white/10 bg-[#0f050d] px-3 py-2 text-xs text-white focus:border-[#BD5579] focus:outline-none"
                >
                  <option value="PATIENT">Role: Patient</option>
                  <option value="CAREGIVER">Role: Caregiver</option>
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-[#BD5579] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#852765]"
                >
                  Grant Access
                </button>
              </div>
            </form>
          </section>
        )}

        {canViewHistory && (
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Care-plan history</h2>
                <p className="mt-1 text-sm text-white/50">
                  Published record snapshots and tracked field changes.
                </p>
              </div>
              {versionError && (
                <button
                  type="button"
                  onClick={() => setVersionReload((value) => value + 1)}
                  className="rounded-lg border border-white/20 px-3 py-2 text-sm"
                >
                  Retry
                </button>
              )}
            </div>
            {versionsLoading ? (
              <p className="mt-4 text-sm text-white/50">Loading history…</p>
            ) : versionError ? (
              <p role="alert" className="mt-4 text-sm text-red-300">{versionError}</p>
            ) : versions.length === 0 ? (
              <p className="mt-4 text-sm text-white/50">No history snapshots are available.</p>
            ) : (
              <ol className="mt-5 space-y-3">
                {versions.map((version, index) => {
                  const fields = versionFields(version, versions[index + 1]);
                  return (
                    <li key={version.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold">
                          Version {version.version}
                          {typeof version.snapshot.name === "string"
                            ? ` · ${version.snapshot.name}`
                            : ""}
                        </h3>
                        <time className="text-xs text-white/50" dateTime={version.created_at}>
                          {new Date(version.created_at).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-1 text-sm text-white/60">
                        {version.reason || "Care-plan record updated"} · Author:{" "}
                        {version.author_id || "System / migration"}
                      </p>
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer text-teal-300">
                          {index + 1 < versions.length ? "View changes" : "View snapshot"}
                        </summary>
                        {fields.length === 0 ? (
                          <p className="mt-2 text-white/50">No tracked care-plan fields changed.</p>
                        ) : (
                          <dl className="mt-2 grid gap-x-5 gap-y-2 sm:grid-cols-2">
                            {fields.map((field) => (
                              <div key={field.label}>
                                <dt className="text-xs capitalize text-white/40">{field.label}</dt>
                                <dd className="mt-0.5 break-words text-white/80">{field.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {/* ============================================================
            EXECUTION ENGINE
        ============================================================ */}

        <section className="mt-8">

          <h2 className="text-xl font-semibold">
            {role === "PATIENT" ? "Care at a glance" : "Execution Engine"}
          </h2>

          <p className="text-sm text-white/50 mt-1">
            {role === "PATIENT"
              ? "A summary of the activities and updates in your care plan."
              : "Current execution state derived from events and evidence."}
          </p>

          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">

            {(role === "PATIENT"
              ? [
                  ["Completed on time", executionSummary.onTime, "text-green-400"],
                  ["Scheduled", executionSummary.pending + executionSummary.beforeWindow, "text-white/70"],
                  ["Care team review", patientReviewCount, "text-orange-400"],
                  ["Reported complete", executionSummary.reported, "text-slate-600"],
                ]
              : [
              ["On Time", executionSummary.onTime, "text-green-400"],
              ["Late", executionSummary.late, "text-yellow-400"],
              ["Missed", executionSummary.missed, "text-red-400"],
              ["Pending", executionSummary.pending, "text-white/70"],
              ["Unconfirmed", executionSummary.unconfirmed, "text-orange-400"],
              ["Conflicting", executionSummary.conflicting, "text-red-400"],
              ["Before Window", executionSummary.beforeWindow, "text-emerald-700"],
              ["Reported", executionSummary.reported, "text-slate-600"],
              ["Reports", executionSummary.documentRecorded, "text-emerald-700"],
                ]
            ).map(([label, value, color]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <p className="text-sm text-white/50">
                  {label}
                </p>

                <p
                  className={`text-3xl font-bold mt-2 ${color}`}
                >
                  {value}
                </p>
              </div>
            ))}

          </div>

        </section>

        {/* ============================================================
            TASKS
        ============================================================ */}

        <section className="mt-10">

          <h2 className="text-xl font-semibold">
            {role === "PATIENT" ? "Care-plan instructions" : "Tasks"}
          </h2>

          <p className="text-sm text-white/50 mt-1">
            {role === "PATIENT"
              ? "Activities and instructions included in your care plan."
              : `${tasks.length} task${tasks.length !== 1 ? "s" : ""} in this care plan.`}
          </p>

          {role === "PATIENT" && tasks.length > 0 && (
            <ul className="mt-5 space-y-3">
              {tasks.map((task) => (
                <li key={task.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-medium">{task.name}</p>
                  {task.description && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/70">
                      {task.description}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-white/50">
                    {formatTaskType(task.type)} · {formatFrequency(task.frequency)}
                  </p>
                </li>
              ))}
            </ul>
          )}

          {tasks.length === 0 ? (

            <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-10 text-center">

              <p className="text-white/50">
                No tasks have been added yet.
              </p>

              {(role === "CLINICIAN" || role === "ADMIN") && (
                <Link
                  href={`/tasks/new?carePlanId=${carePlan.id}`}
                  className="inline-block mt-4 rounded-xl bg-white text-black px-5 py-3 font-semibold"
                >
                  Add First Task
                </Link>
              )}

            </div>

          ) : (

            <div className={`mt-5 overflow-x-auto rounded-2xl border border-white/10 ${role === "PATIENT" ? "hidden" : ""}`}>

              <table className="w-full min-w-[900px]">

                <thead className="bg-white/[0.04]">

                  <tr className="text-left text-sm text-white/50">

                    <th className="px-5 py-4">
                      Task
                    </th>

                    <th className="px-5 py-4">
                      Type
                    </th>

                    <th className="px-5 py-4">
                      Frequency
                    </th>

                    <th className="px-5 py-4">
                      Priority
                    </th>

                    <th className="px-5 py-4">
                      Verification
                    </th>

                    {(role === "CLINICIAN" || role === "ADMIN") && (
                      <th className="px-5 py-4 text-right">
                        Actions
                      </th>
                    )}

                  </tr>

                </thead>

                <tbody>

                  {tasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-t border-white/10"
                    >

                      <td className="px-5 py-4">

                        <p className="font-semibold">
                          {task.name}
                        </p>

                        {task.description && (
                          <p className="text-sm text-white/40 mt-1 max-w-md">
                            {task.description}
                          </p>
                        )}

                      </td>

                      <td className="px-5 py-4 text-white/70">
                        {formatTaskType(task.type)}
                      </td>

                      <td className="px-5 py-4 text-white/70">
                        {formatFrequency(task.frequency)}
                      </td>

                      <td className="px-5 py-4">

                        <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs">
                          {task.priority}
                        </span>

                      </td>

                      <td className="px-5 py-4 text-white/70">
                        {task.verification_method
                          ? formatTaskType(task.verification_method)
                          : "—"}
                      </td>

                      {(role === "CLINICIAN" || role === "ADMIN") && (
                        <td className="px-5 py-4">
                          <button
                            type="button"
                            onClick={() =>
                              void updateTaskStatus(
                                task.id,
                                task.status?.toUpperCase() === "ARCHIVED" ? "PENDING" : "ARCHIVED",
                              )
                            }
                            className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-medium text-white"
                          >
                            {task.status?.toUpperCase() === "ARCHIVED"
                              ? "Restore"
                              : "Archive"}
                          </button>
                        </td>
                      )}

                    </tr>
                  ))}

                </tbody>

              </table>

            </div>

          )}

        </section>

        {/* ============================================================
            TASK OCCURRENCES
        ============================================================ */}

        <section className="mt-10">

          <h2 className="text-xl font-semibold">
            {role === "PATIENT" ? "Scheduled care" : "Task Occurrences"}
          </h2>

          <p className="text-sm text-white/50 mt-1">
            {role === "PATIENT"
              ? "Review your schedule, report completion, or share a supporting document."
              : "Execute tasks, submit evidence, and evaluate care-plan compliance."}
          </p>

          {occurrences.length === 0 ? (

            <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-10 text-center">
              <p className="text-white/50">
                No task occurrences have been generated yet.
              </p>
            </div>

          ) : (

            <div className="mt-5 space-y-5">

              {occurrences.map((occurrence) => {

                const task =
                  taskMap.get(occurrence.task_id);

                const execution =
                  getExecutionState(
                    occurrence,
                    task
                  );

                const occurrenceDocuments =
                  documents.filter(
                    (document) =>
                      document.occurrence_id ===
                      occurrence.id
                  );

                const existingEscalation =
                  escalations.find(
                    (item) =>
                      item.occurrence_id ===
                        occurrence.id &&
                      item.status !== "RESOLVED" &&
                      item.status !== "CLOSED"
                  );

                const busy =
                  actionOccurrenceId ===
                  occurrence.id;

                return (
                  <div
                    key={occurrence.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                  >

                    <div className="flex flex-col xl:flex-row gap-6">

                      <div className="flex-1">

                        <div className="flex flex-wrap items-center gap-3">

                          <h3 className="font-semibold text-lg">
                            {task?.name || "Unknown Task"}
                          </h3>

                          <span
                            className={`rounded-full border px-3 py-1 text-xs ${stateClasses(
                              execution.state
                            )}`}
                          >
                            {stateLabelForRole(execution.state, role === "PATIENT")}
                          </span>

                        </div>
                        {role === "PATIENT" &&
                          ["MISSED", "UNCONFIRMED", "CONFLICTING", "INSUFFICIENT_EVIDENCE"].includes(execution.state) && (
                            <p role="status" className="mt-3 text-sm text-white/70">
                              Your care team may need to review this activity. Contact them if you are unsure what to do.
                            </p>
                          )}

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">

                          <div>
                            <p className="text-white/40">
                              Date
                            </p>

                            <p className="mt-1 text-white/80">
                              {formatDate(
                                occurrence.occurrence_date
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-white/40">
                              Allowed Window
                            </p>

                            <p className="mt-1 text-white/80">
                              {formatTime(
                                occurrence.allowed_start_time
                              )}
                              {" → "}
                              {formatTime(
                                occurrence.allowed_end_time
                              )}
                            </p>
                          </div>

                          <div>
                            <p className="text-white/40">
                              Latest Evidence
                            </p>

                            <p className="mt-1 text-white/80">
                              {execution.event
                                ? formatDateTime(
                                    execution.event.event_time
                                  )
                                : execution.document
                                ? "Document uploaded"
                                : "No evidence"}
                            </p>
                          </div>

                        </div>

                        {role !== "PATIENT" && execution.event && (
                          <p className="mt-4 text-xs text-white/40">
                            Latest event source:{" "}
                            <span className="text-white/70">
                              {execution.event.source}
                            </span>
                            {execution.event.value && (
                              <>
                                {" • "}Value:{" "}
                                <span className="text-white/70">
                                  {execution.event.value}
                                </span>
                              </>
                            )}
                          </p>
                        )}

                      </div>

                      {/* ACTIONS */}

                      <div className="xl:w-[330px]">

                        {/* Patient completion */}

                        <button
                          type="button"
                          onClick={() =>
                            reportCompletion(occurrence)
                          }
                          disabled={busy}
                          className="w-full rounded-xl bg-white text-black px-5 py-3 font-semibold disabled:opacity-50"
                        >
                          {busy
                            ? "Processing..."
                            : "Report Completion"}
                        </button>

                        {/* Report upload */}

                        <div className="mt-4">

                          <label className="block">

                            <span className="text-xs text-white/40">
                              Upload Report / Evidence
                            </span>

                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.tif,.pdf,.doc,.docx"
                              disabled={busy}
                              onChange={async (event) => {

                                const file =
                                  event.target.files?.[0];

                                if (!file) return;

                                await uploadReport(
                                  occurrence,
                                  file
                                );

                                event.target.value = "";
                              }}
                              className="mt-2 block w-full text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-black"
                            />

                          </label>

                          <p className="mt-2 text-[11px] text-white/30">
                            JPG, PNG, WEBP, GIF, BMP, TIFF,
                            PDF, DOC, DOCX • Maximum 10 MB
                          </p>

                        </div>

                        {/* IoT */}

                        {(role === "CLINICIAN" || role === "ADMIN") && (
                        <div className="mt-5">

                          <p className="text-xs text-white/30 mb-2">
                            Development IoT Simulation
                          </p>

                          <div className="flex gap-2">

                            <button
                              type="button"
                              onClick={() =>
                                addIoTTestEvent(
                                  occurrence,
                                  "detected"
                                )
                              }
                              disabled={busy}
                              className="flex-1 rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400 disabled:opacity-50"
                            >
                              IoT Detected
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                addIoTTestEvent(
                                  occurrence,
                                  "not_detected"
                                )
                              }
                              disabled={busy}
                              className="flex-1 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400 disabled:opacity-50"
                            >
                              IoT Conflict
                            </button>

                          </div>

                        </div>
                        )}

                        {/* Escalation */}

                        {role !== "PATIENT" && (
                        <div className="mt-5">

                          <p className="text-xs text-white/30 mb-2">
                            Escalation Engine
                          </p>

                          {existingEscalation ? (

                            <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">

                              <p className="text-xs text-orange-400">
                                Escalation already created
                              </p>

                              <p className="text-[11px] text-orange-400/60 mt-1">
                                {existingEscalation.status}
                              </p>

                            </div>

                          ) : (
                            execution.state === "UNCONFIRMED" ||
                            execution.state === "CONFLICTING" ||
                            execution.state === "LATE" ||
                            execution.state === "MISSED"
                          ) && (role === "CLINICIAN" || role === "ADMIN") ? (

                            <button
                              type="button"
                              onClick={() =>
                                createEscalation(occurrence, execution.state)
                              }
                              disabled={busy}
                              className="w-full rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-400 disabled:opacity-50"
                            >
                              Create Escalation
                            </button>
                          ) : execution.state === "UNCONFIRMED" ||
                            execution.state === "CONFLICTING" ||
                            execution.state === "LATE" ||
                            execution.state === "MISSED" ? (
                            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs text-white/60">
                              Only clinicians can create an escalation.
                            </p>
                          ) : (

                            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-xs text-white/30">
                              No escalation required
                            </div>

                          )}

                        </div>
                        )}

                      </div>

                    </div>

                    {/* Uploaded reports */}

                    {occurrenceDocuments.length > 0 && (

                      <div className="mt-6 border-t border-white/10 pt-5">

                        <h4 className="text-sm font-semibold">
                          Uploaded Reports
                        </h4>

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">

                          {occurrenceDocuments.map(
                            (document) => {

                              const url =
                                getDocumentUrl(
                                  document.file_path
                                );

                              return (
                                <div
                                  key={document.id}
                                  className="rounded-xl border border-white/10 bg-black/30 p-4"
                                >

                                  <div className="flex items-center justify-between gap-4">

                                    <div className="min-w-0">

                                      <p className="text-sm font-medium truncate">
                                        {document.file_name}
                                      </p>

                                      <p className="mt-1 text-xs text-white/40">
                                        {document.file_type}
                                        {" • "}
                                        {formatFileSize(
                                          document.file_size
                                        )}
                                      </p>

                                      <p className="mt-1 text-xs text-white/30">
                                        Uploaded{" "}
                                        {formatDateTime(
                                          document.uploaded_at
                                        )}
                                      </p>

                                    </div>

                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs"
                                    >
                                      View
                                    </a>

                                  </div>

                                  {isImageFile(
                                    document.file_type
                                  ) && (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="block mt-4"
                                    >
                                      <Image
                                        src={url}
                                        alt={document.file_name}
                                        unoptimized
                                        width={1200}
                                        height={800}
                                        className="max-h-48 w-full rounded-lg border border-white/5 bg-black/50 object-contain"
                                      />
                                    </a>
                                  )}

                                </div>
                              );
                            }
                          )}

                        </div>

                      </div>
                    )}

                  </div>
                );
              })}

            </div>
          )}

        </section>

        {/* ============================================================
            DEPENDENCIES
        ============================================================ */}

        <section className={`mt-10 ${role === "PATIENT" ? "hidden" : ""}`}>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">

            <h2 className="text-xl font-semibold">
              Care Plan Dependencies
            </h2>

            <p className="mt-2 text-sm text-white/50">
              Dependencies identify tasks that must occur before other tasks can proceed.
            </p>

            {dependencies.length === 0 ? (

              <div className="mt-5 rounded-xl border border-dashed border-white/10 p-6 text-center">
                <p className="text-sm text-white/40">
                  No dependencies configured yet.
                </p>
              </div>

            ) : (

              <div className="mt-5 space-y-3">

                {dependencies.map((dependency) => {

                  const prerequisiteTask =
                    taskMap.get(
                      dependency.prerequisite_task_id
                    );

                  const dependentTask =
                    taskMap.get(
                      dependency.dependent_task_id
                    );

                  const prerequisiteOccurrences =
                    occurrences
                      .filter(
                        (occurrence) =>
                          occurrence.task_id ===
                          dependency.prerequisite_task_id
                      )
                      .sort(
                        (a, b) =>
                          b.occurrence_date.localeCompare(
                            a.occurrence_date
                          )
                      );

                  const latestPrerequisite =
                    prerequisiteOccurrences[0];

                  const prerequisiteState =
                    latestPrerequisite
                      ? getExecutionState(
                          latestPrerequisite,
                          prerequisiteTask
                        ).state
                      : "PENDING";

                  const dependencyResult = dependentTask
                    ? dependencyResults.get(dependentTask.id)
                    : undefined;
                  const dependencyState =
                    dependencyResult?.state ||
                    (prerequisiteState === "PENDING" ? "BLOCKED" : "READY");

                  return (
                    <div
                      key={dependency.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-4"
                    >

                      <div className="flex flex-col md:flex-row md:items-center gap-4">

                        <div className="flex-1">

                          <p className="text-sm font-semibold">
                            {prerequisiteTask?.name ||
                              "Unknown prerequisite"}
                          </p>

                          <p className="text-xs text-white/40 mt-1">
                            Prerequisite task
                          </p>

                        </div>

                        <div className="text-white/30">
                          →
                        </div>

                        <div className="flex-1">

                          <p className="text-sm font-semibold">
                            {dependentTask?.name ||
                              "Unknown dependent task"}
                          </p>

                          <p className="text-xs text-white/40 mt-1">
                            Dependent task
                          </p>

                        </div>

                        {dependencyResult?.reasons.map((reason) => (
                          <p
                            key={reason}
                            className="w-full text-xs text-white/40 md:basis-full"
                          >
                            {reason}
                          </p>
                        ))}

                        <span
                          className={`rounded-full border px-3 py-1 text-xs ${dependencyClasses(
                            dependencyState
                          )}`}
                        >
                          {dependencyState}
                        </span>

                      </div>

                      <p className="mt-3 text-xs text-white/40">
                        Dependency:{" "}
                        <span className="text-white/60">
                          {dependency.dependency_type}
                        </span>
                        {" • "}
                        Prerequisite state:{" "}
                        <span className="text-white/60">
                          {prerequisiteState}
                        </span>
                      </p>

                    </div>
                  );
                })}

              </div>
            )}

          </div>

        </section>

        {/* ============================================================
            ESCALATION ENGINE
        ============================================================ */}

        <section className={`mt-10 ${role === "PATIENT" ? "hidden" : ""}`}>

          <div className="mb-5">

            <h2 className="text-xl font-semibold">
              Escalation Engine
            </h2>

            <p className="text-sm text-white/50 mt-1">
              Predefined workflow actions for unresolved care-plan deviations.
            </p>

          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">

              <p className="text-sm text-white/40">
                Total
              </p>

              <p className="mt-2 text-3xl font-bold">
                {escalations.length}
              </p>

            </div>

            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-5">

              <p className="text-sm text-white/40">
                Created
              </p>

              <p className="mt-2 text-3xl font-bold text-orange-400">
                {
                  escalations.filter(
                    (item) =>
                      item.status === "CREATED"
                  ).length
                }
              </p>

            </div>

            <div className="rounded-2xl border border-emerald-700/20 bg-emerald-700/5 p-5">

              <p className="text-sm text-white/40">
                Acknowledged
              </p>

              <p className="mt-2 text-3xl font-bold text-emerald-700">
                {
                  escalations.filter(
                    (item) =>
                      item.status === "ACKNOWLEDGED"
                  ).length
                }
              </p>

            </div>

            <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-5">

              <p className="text-sm text-white/40">
                Resolved
              </p>

              <p className="mt-2 text-3xl font-bold text-green-400">
                {
                  escalations.filter(
                    (item) =>
                      item.status === "RESOLVED"
                  ).length
                }
              </p>

            </div>

          </div>

          {escalations.length === 0 ? (

            <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center">

              <p className="text-white/40">
                No escalations have been created.
              </p>

            </div>

          ) : (

            <div className="mt-5 space-y-3">

              {escalations.map((escalation) => {

                const task =
                  escalation.task_id
                    ? taskMap.get(
                        escalation.task_id
                      )
                    : undefined;

                return (
                  <div
                    key={escalation.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                  >

                    <div className="flex flex-col md:flex-row md:items-center gap-4">

                      <div className="flex-1">

                        <div className="flex flex-wrap items-center gap-2">

                          <h3 className="font-semibold">
                            {task?.name ||
                              "Care-plan task"}
                          </h3>

                          <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-xs text-orange-400">
                            {escalation.trigger_state}
                          </span>

                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/60">
                            {escalation.priority}
                          </span>

                        </div>

                        <p className="mt-3 text-sm text-white/50">
                          {escalation.message ||
                            "Attention required."}
                        </p>

                        <p className="mt-3 text-xs text-white/30">
                          Recipient:{" "}
                          <span className="text-white/60">
                            {escalation.recipient_type.replaceAll(
                              "_",
                              " "
                            )}
                          </span>
                          {" • "}
                          Status:{" "}
                          <span className="text-white/60">
                            {escalation.status}
                          </span>
                          {" • "}
                          Created:{" "}
                          <span className="text-white/60">
                            {formatDateTime(
                              escalation.created_at
                            )}
                          </span>
                        </p>

                      </div>

                      {/* Escalation actions */}

                      <div className="flex gap-2">

                        {escalation.status ===
                          "CREATED" && (

                          <button
                            type="button"
                            onClick={() =>
                              updateEscalationStatus(
                                escalation,
                                "ACKNOWLEDGED"
                              )
                            }
                            className="rounded-lg border border-emerald-700/20 bg-emerald-700/10 px-3 py-2 text-xs text-emerald-700"
                          >
                            Acknowledge
                          </button>

                        )}

                        {escalation.status ===
                          "ACKNOWLEDGED" && (

                          <button
                            type="button"
                            onClick={() =>
                              updateEscalationStatus(
                                escalation,
                                "RESOLVED"
                              )
                            }
                            className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-xs text-green-400"
                          >
                            Resolve
                          </button>

                        )}

                      </div>

                    </div>

                  </div>
                );
              })}

            </div>
          )}

        </section>

        {/* ============================================================
            EVIDENCE RECONCILIATION
        ============================================================ */}

        <section className={`mt-10 ${role === "PATIENT" ? "hidden" : ""}`}>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">

            <h2 className="text-xl font-semibold">
              Evidence Reconciliation
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/50">
              SmartCare compares evidence from different sources instead of relying on a single completion report.
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="font-semibold text-sm">
                  Patient
                </div>

                <p className="mt-2 text-xs text-white/40">
                  Patient-reported completion.
                </p>

                <div className="mt-4 text-xs text-slate-600">
                  PATIENT_REPORT
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="font-semibold text-sm">
                  IoT
                </div>

                <p className="mt-2 text-xs text-white/40">
                  Device-generated evidence.
                </p>

                <div className="mt-4 text-xs text-green-400">
                  IOT
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="font-semibold text-sm">
                  Document
                </div>

                <p className="mt-2 text-xs text-white/40">
                  Uploaded report or supporting document.
                </p>

                <div className="mt-4 text-xs text-emerald-700">
                  DOCUMENT
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                <div className="font-semibold text-sm">
                  Reconciliation
                </div>

                <p className="mt-2 text-xs text-white/40">
                  Evidence is compared against task requirements.
                </p>

                <div className="mt-4 text-xs text-orange-400">
                  EXECUTION_STATE
                </div>
              </div>

            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-black/40 p-5">

              <p className="text-sm font-semibold">
                Prototype Logic
              </p>

              <div className="mt-4 space-y-2 text-sm text-white/60">

                <p>
                  • Required document missing →{" "}
                  <span className="text-orange-400">
                    UNCONFIRMED
                  </span>
                </p>

                <p>
                  • Required IoT evidence missing →{" "}
                  <span className="text-orange-400">
                    UNCONFIRMED
                  </span>
                </p>

                <p>
                  • Patient completed + IoT not detected →{" "}
                  <span className="text-red-400">
                    CONFLICTING
                  </span>
                </p>

                <p>
                  • Evidence inside time window →{" "}
                  <span className="text-green-400">
                    ON_TIME
                  </span>
                </p>

                <p>
                  • Evidence after time window →{" "}
                  <span className="text-yellow-400">
                    LATE
                  </span>
                </p>

              </div>

            </div>

          </div>

        </section>

        {/* ============================================================
            RECORDED EVENTS
        ============================================================ */}

        <section className={`mt-10 ${role === "PATIENT" ? "hidden" : ""}`}>

          <h2 className="text-xl font-semibold">
            Recorded Events
          </h2>

          <p className="text-sm text-white/50 mt-1">
            Evidence events stored for this care plan.
          </p>

          {events.length === 0 ? (

            <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-white/50">
                No events recorded yet.
              </p>
            </div>

          ) : (

            <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">

              <table className="w-full min-w-[850px]">

                <thead className="bg-white/[0.04]">

                  <tr className="text-left text-sm text-white/50">

                    <th className="px-5 py-4">
                      Event Time
                    </th>

                    <th className="px-5 py-4">
                      Task
                    </th>

                    <th className="px-5 py-4">
                      Source
                    </th>

                    <th className="px-5 py-4">
                      Value
                    </th>

                    <th className="px-5 py-4">
                      Confidence
                    </th>

                  </tr>

                </thead>

                <tbody>

                  {events.map((event) => {

                    const task =
                      taskMap.get(
                        event.task_id
                      );

                    return (
                      <tr
                        key={event.id}
                        className="border-t border-white/10"
                      >

                        <td className="px-5 py-4 text-white/70">
                          {formatDateTime(
                            event.event_time
                          )}
                        </td>

                        <td className="px-5 py-4 font-medium">
                          {task?.name ||
                            "Unknown Task"}
                        </td>

                        <td className="px-5 py-4">

                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs">
                            {event.source}
                          </span>

                        </td>

                        <td className="px-5 py-4 text-white/70">
                          {event.value || "—"}
                        </td>

                        <td className="px-5 py-4 text-white/70">
                          {event.confidence ??
                            "—"}
                        </td>

                      </tr>
                    );
                  })}

                </tbody>

              </table>

            </div>

          )}

        </section>

        {/* ============================================================
            REPORT DOCUMENTS
        ============================================================ */}

        <section className="mt-10">

          <h2 className="text-xl font-semibold">
            Report Documents
          </h2>

          <p className="text-sm text-white/50 mt-1">
            Reports and supporting files uploaded for this care plan.
          </p>

          {documents.length === 0 ? (

            <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-8 text-center">
              <p className="text-white/50">
                No reports uploaded yet.
              </p>
            </div>

          ) : (

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">

              {documents.map((document) => {

                const task =
                  taskMap.get(
                    document.task_id
                  );

                const url =
                  getDocumentUrl(
                    document.file_path
                  );

                return (
                  <div
                    key={document.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                  >

                    <div className="flex items-start justify-between gap-4">

                      <div className="min-w-0">

                        <p className="font-semibold truncate">
                          {document.file_name}
                        </p>

                        <p className="text-xs text-white/40 mt-2">
                          Task:{" "}
                          {task?.name ||
                            "Unknown Task"}
                        </p>

                        <p className="text-xs text-white/40 mt-1">
                          {document.file_type}
                          {" • "}
                          {formatFileSize(
                            document.file_size
                          )}
                        </p>

                        <p className="text-xs text-white/30 mt-1">
                          Uploaded{" "}
                          {formatDateTime(
                            document.uploaded_at
                          )}
                        </p>

                      </div>

                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-lg bg-white text-black px-3 py-2 text-xs font-semibold"
                      >
                        View
                      </a>

                    </div>

                    {isImageFile(
                      document.file_type
                    ) && (

                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mt-4"
                      >

                        <Image
                          src={url}
                          alt={document.file_name}
                          unoptimized
                          width={1200}
                          height={800}
                          className="max-h-56 w-full rounded-xl border border-white/5 bg-black/50 object-contain"
                        />

                      </a>

                    )}

                  </div>
                );
              })}

            </div>

          )}

        </section>

        {/* ============================================================
            SMARTCARE PIPELINE
        ============================================================ */}

        <section className="mt-10 mb-12">

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">

            <h2 className="text-xl font-semibold">
              SmartCare Execution Pipeline
            </h2>

            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">

              {[
                "Care Plan",
                "Task",
                "Occurrence",
                "Evidence",
                "Reconciliation",
                "Dependency",
                "Execution State",
                "Escalation",
              ].map((item, index, array) => (
                <div
                  key={item}
                  className="flex items-center gap-3"
                >

                  <span className="rounded-lg border border-white/10 bg-white/5 px-4 py-2">
                    {item}
                  </span>

                  {index < array.length - 1 && (
                    <span className="text-white/30">
                      →
                    </span>
                  )}

                </div>
              ))}

            </div>

            <p className="mt-5 text-sm leading-6 text-white/50">
              SmartCare records patient-reported,
              document-based, application-generated and
              future IoT evidence, then reconciles that
              evidence against temporal constraints,
              verification requirements and dependencies.
            </p>

            <p className="mt-3 text-sm leading-6 text-white/50">
              Escalations are generated from predefined
              workflow rules. The system does not diagnose,
              prescribe, or independently modify treatment.
            </p>

          </div>

        </section>

      </div>

    </main>
  );
}