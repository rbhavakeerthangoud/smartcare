"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { evaluateExecution } from "@/lib/smartcare/execution-engine";
import { evaluateDependencies } from "@/lib/smartcare/dependency-engine";
import type { ExecutionState } from "@/lib/smartcare/types";
import { useSmartCareAuth } from "@/lib/supabase/auth-context";

type Audience = "CAREGIVER" | "CLINICIAN";
type CarePlan = { id: string; patient_id: string; name: string };
type Patient = { id: string; full_name: string };
type Task = {
  id: string;
  care_plan_id: string;
  name: string;
  verification_method?: string | null;
};
type Occurrence = {
  id: string;
  task_id: string;
  occurrence_date: string;
  time_zone?: string | null;
  allowed_start_time?: string | null;
  allowed_end_time?: string | null;
  status?: string | null;
  completed_at?: string | null;
  completion_source?: string | null;
};
type EventRecord = {
  occurrence_id?: string | null;
  event_time: string;
  source: string;
  value?: string | null;
  confidence?: number | null;
  notes?: string | null;
};
type DocumentRecord = {
  occurrence_id?: string | null;
  uploaded_at: string;
  file_name: string;
};
type Escalation = {
  id: string;
  care_plan_id: string;
  task_id?: string | null;
  occurrence_id?: string | null;
  trigger_state: string;
  priority: string;
  recipient_type: string;
  status: string;
  message?: string | null;
  created_at: string;
  acknowledged_at?: string | null;
  resolved_at?: string | null;
};

function isActive(escalation: Escalation) {
  return !["RESOLVED", "CLOSED"].includes(escalation.status);
}

function stateBadge(state: ExecutionState) {
  const base = "sc-badge";
  if (state === "ON_TIME") return `${base} sc-badge-success`;
  if (state === "LATE") return `${base} sc-badge-warning`;
  if (state === "MISSED" || state === "CONFLICTING") return `${base} sc-badge-danger`;
  return `${base} sc-badge-neutral`;
}

export default function CareOverviewDashboard({
  audience,
}: {
  audience: Audience;
}) {
  const { session } = useSmartCareAuth();
  const userId = session?.user.id;
  const [carePlans, setCarePlans] = useState<CarePlan[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [executionStates, setExecutionStates] = useState<
    Map<string, ExecutionState>
  >(new Map());
  const [blockedCount, setBlockedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadDashboard() {
      setLoading(true);
      setError("");
      try {
        if (audience === "CAREGIVER") {
          if (!userId) {
            if (!active) return;
            setCarePlans([]);
            setPatients([]);
            setTasks([]);
            setOccurrences([]);
            setEvents([]);
            setDocuments([]);
            setEscalations([]);
            setExecutionStates(new Map());
            setBlockedCount(0);
            return;
          }

          const { data: caregiverAccessRows, error: caregiverAccessError } = await supabase
            .from("smartcare_patient_access")
            .select("patient_id,user_id,access_role,active")
            .eq("user_id", userId)
            .eq("access_role", "CAREGIVER")
            .eq("active", true);

          if (caregiverAccessError) throw caregiverAccessError;
          const authorizedPatientIds = [
            ...new Set((caregiverAccessRows || []).map((entry) => entry.patient_id)),
          ];

          if (authorizedPatientIds.length === 0) {
            if (!active) return;
            setCarePlans([]);
            setPatients([]);
            setTasks([]);
            setOccurrences([]);
            setEvents([]);
            setDocuments([]);
            setEscalations([]);
            setExecutionStates(new Map());
            setBlockedCount(0);
            return;
          }

          const { data: planRows, error: planError } = await supabase
            .from("care_plans")
            .select("id,patient_id,name")
            .in("patient_id", authorizedPatientIds)
            .order("created_at", { ascending: false });
          if (planError) throw planError;
          const loadedPlans = planRows || [];
          const planIds = loadedPlans.map((plan) => plan.id);

          if (planIds.length === 0) {
            if (!active) return;
            setCarePlans([]);
            setPatients([]);
            setTasks([]);
            setOccurrences([]);
            setEvents([]);
            setDocuments([]);
            setEscalations([]);
            setExecutionStates(new Map());
            setBlockedCount(0);
            return;
          }

          const { data: patientRows, error: patientError } = await supabase
            .from("patients")
            .select("id,full_name")
            .in("id", authorizedPatientIds);
          if (patientError) throw patientError;

          const { data: taskRows, error: taskError } = await supabase
            .from("tasks")
            .select("id,care_plan_id,name,verification_method")
            .in("care_plan_id", planIds);
          if (taskError) throw taskError;
          const loadedTasks = taskRows || [];
          const taskIds = loadedTasks.map((task) => task.id);

          let loadedOccurrences: Occurrence[] = [];
          let loadedEvents: EventRecord[] = [];
          let loadedDocuments: DocumentRecord[] = [];
          if (taskIds.length > 0) {
            const [occurrenceResult, eventResult, documentResult] = await Promise.all([
              supabase
                .from("task_occurrences")
                .select("id,task_id,occurrence_date,time_zone,allowed_start_time,allowed_end_time,status,completed_at,completion_source")
                .in("task_id", taskIds),
              supabase
                .from("events")
                .select("occurrence_id,event_time,source,value,confidence,notes")
                .in("task_id", taskIds),
              supabase
                .from("documents")
                .select("occurrence_id,uploaded_at,file_name")
                .in("task_id", taskIds),
            ]);
            if (occurrenceResult.error) throw occurrenceResult.error;
            if (eventResult.error) throw eventResult.error;
            if (documentResult.error) throw documentResult.error;
            loadedOccurrences = occurrenceResult.data || [];
            loadedEvents = eventResult.data || [];
            loadedDocuments = documentResult.data || [];
          }

          const { data: escalationRows, error: escalationError } = await supabase
            .from("escalations")
            .select("*")
            .in("care_plan_id", planIds)
            .order("created_at", { ascending: false });
          if (escalationError) throw escalationError;

          const taskMap = new Map(loadedTasks.map((task) => [task.id, task]));
          const states = new Map<string, ExecutionState>();
          for (const occurrence of loadedOccurrences) {
            const task = taskMap.get(occurrence.task_id);
            if (!task) continue;
            const result = evaluateExecution({
              task,
              occurrence,
              events: loadedEvents
                .filter((event) => event.occurrence_id === occurrence.id)
                .map((event) => ({ ...event, occurrence_id: occurrence.id })),
              documents: loadedDocuments
                .filter((document) => document.occurrence_id === occurrence.id)
                .map((document) => ({ ...document, occurrence_id: occurrence.id })),
            });
            states.set(occurrence.id, result.state);
          }

          const dependenciesQuery = await supabase
            .from("dependencies")
            .select("prerequisite_task_id,dependent_task_id,dependency_type")
            .in("care_plan_id", planIds);
          if (dependenciesQuery.error) throw dependenciesQuery.error;
          const taskStateMap = new Map<string, ExecutionState>();
          const latestOccurrenceByTask = new Map<string, Occurrence>();
          for (const occurrence of loadedOccurrences) {
            const previous = latestOccurrenceByTask.get(occurrence.task_id);
            if (!previous || occurrence.occurrence_date > previous.occurrence_date) {
              latestOccurrenceByTask.set(occurrence.task_id, occurrence);
            }
          }
          for (const [taskId, occurrence] of latestOccurrenceByTask) {
            taskStateMap.set(taskId, states.get(occurrence.id) || "PENDING");
          }
          const dependencyResults = evaluateDependencies({
            dependencies: (dependenciesQuery.data || []).map((dependency) => ({
              prerequisiteTaskId: dependency.prerequisite_task_id,
              dependentTaskId: dependency.dependent_task_id,
              type:
                dependency.dependency_type.toUpperCase() === "BEFORE" ||
                dependency.dependency_type.toUpperCase() === "AFTER"
                  ? dependency.dependency_type.toUpperCase()
                  : "REQUIRED_BEFORE",
            })),
            executionStates: taskStateMap,
          });

          if (!active) return;
          setCarePlans(loadedPlans);
          setPatients(patientRows || []);
          setTasks(loadedTasks);
          setOccurrences(loadedOccurrences);
          setEvents(loadedEvents);
          setDocuments(loadedDocuments);
          setEscalations(escalationRows || []);
          setExecutionStates(states);
          setBlockedCount(
            [...dependencyResults.values()].filter((result) => result.state === "BLOCKED").length,
          );
          return;
        }

        const { data: planRows, error: planError } = await supabase
          .from("care_plans")
          .select("id,patient_id,name")
          .order("created_at", { ascending: false });
        if (planError) throw planError;
        const loadedPlans = planRows || [];
        const planIds = loadedPlans.map((plan) => plan.id);

        if (planIds.length === 0) {
          if (!active) return;
          setCarePlans([]);
          setPatients([]);
          setTasks([]);
          setOccurrences([]);
          setEvents([]);
          setDocuments([]);
          setEscalations([]);
          setExecutionStates(new Map());
          setBlockedCount(0);
          return;
        }

        const patientIds = [...new Set(loadedPlans.map((plan) => plan.patient_id))];
        const { data: patientRows, error: patientError } = await supabase
          .from("patients")
          .select("id,full_name")
          .in("id", patientIds);
        if (patientError) throw patientError;

        const { data: taskRows, error: taskError } = await supabase
          .from("tasks")
          .select("id,care_plan_id,name,verification_method")
          .in("care_plan_id", planIds);
        if (taskError) throw taskError;
        const loadedTasks = taskRows || [];
        const taskIds = loadedTasks.map((task) => task.id);

        let loadedOccurrences: Occurrence[] = [];
        let loadedEvents: EventRecord[] = [];
        let loadedDocuments: DocumentRecord[] = [];
        if (taskIds.length > 0) {
          const [occurrenceResult, eventResult, documentResult] =
            await Promise.all([
              supabase
                .from("task_occurrences")
                .select("id,task_id,occurrence_date,time_zone,allowed_start_time,allowed_end_time,status,completed_at,completion_source")
                .in("task_id", taskIds),
              supabase
                .from("events")
                .select("occurrence_id,event_time,source,value,confidence,notes")
                .in("task_id", taskIds),
              supabase
                .from("documents")
                .select("occurrence_id,uploaded_at,file_name")
                .in("task_id", taskIds),
            ]);
          if (occurrenceResult.error) throw occurrenceResult.error;
          if (eventResult.error) throw eventResult.error;
          if (documentResult.error) throw documentResult.error;
          loadedOccurrences = occurrenceResult.data || [];
          loadedEvents = eventResult.data || [];
          loadedDocuments = documentResult.data || [];
        }

        const { data: escalationRows, error: escalationError } = await supabase
          .from("escalations")
          .select("*")
          .in("care_plan_id", planIds)
          .order("created_at", { ascending: false });
        if (escalationError) throw escalationError;

        const taskMap = new Map(loadedTasks.map((task) => [task.id, task]));
        const states = new Map<string, ExecutionState>();
        for (const occurrence of loadedOccurrences) {
          const task = taskMap.get(occurrence.task_id);
          if (!task) continue;
          const result = evaluateExecution({
            task,
            occurrence,
            events: loadedEvents
              .filter((event) => event.occurrence_id === occurrence.id)
              .map((event) => ({ ...event, occurrence_id: occurrence.id })),
            documents: loadedDocuments
              .filter((document) => document.occurrence_id === occurrence.id)
              .map((document) => ({ ...document, occurrence_id: occurrence.id })),
          });
          states.set(occurrence.id, result.state);
        }

        const dependenciesQuery = await supabase
          .from("dependencies")
          .select("prerequisite_task_id,dependent_task_id,dependency_type")
          .in("care_plan_id", planIds);
        if (dependenciesQuery.error) throw dependenciesQuery.error;
        const taskStateMap = new Map<string, ExecutionState>();
        const latestOccurrenceByTask = new Map<string, Occurrence>();
        for (const occurrence of loadedOccurrences) {
          const previous = latestOccurrenceByTask.get(occurrence.task_id);
          if (!previous || occurrence.occurrence_date > previous.occurrence_date) {
            latestOccurrenceByTask.set(occurrence.task_id, occurrence);
          }
        }
        for (const [taskId, occurrence] of latestOccurrenceByTask) {
          taskStateMap.set(taskId, states.get(occurrence.id) || "PENDING");
        }
        const dependencyResults = evaluateDependencies({
          dependencies: (dependenciesQuery.data || []).map((dependency) => ({
            prerequisiteTaskId: dependency.prerequisite_task_id,
            dependentTaskId: dependency.dependent_task_id,
            type:
              dependency.dependency_type.toUpperCase() === "BEFORE" ||
              dependency.dependency_type.toUpperCase() === "AFTER"
                ? dependency.dependency_type.toUpperCase()
                : "REQUIRED_BEFORE",
          })),
          executionStates: taskStateMap,
        });

        if (!active) return;
        setCarePlans(loadedPlans);
        setPatients(patientRows || []);
        setTasks(loadedTasks);
        setOccurrences(loadedOccurrences);
        setEvents(loadedEvents);
        setDocuments(loadedDocuments);
        setEscalations(escalationRows || []);
        setExecutionStates(states);
        setBlockedCount(
          [...dependencyResults.values()].filter((result) => result.state === "BLOCKED").length,
        );
      } catch (loadError) {
        console.error("Unable to load authorized care dashboard data.", loadError);
        if (active) {
          setError("Dashboard data could not be loaded. Check your connection and access permissions.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    const timer = window.setTimeout(() => void loadDashboard(), 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [audience, reload, userId]);

  async function updateEscalation(
    escalation: Escalation,
    status: "ACKNOWLEDGED" | "RESOLVED",
  ) {
    setActionId(escalation.id);
    setError("");
    try {
      const update = {
        status,
        ...(status === "ACKNOWLEDGED"
          ? { acknowledged_at: new Date().toISOString() }
          : { resolved_at: new Date().toISOString() }),
      };
      const { data, error: updateError } = await supabase
        .from("escalations")
        .update(update)
        .eq("id", escalation.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      setEscalations((current) =>
        current.map((item) => (item.id === data.id ? data : item)),
      );
    } catch (updateError) {
      console.error("Unable to update escalation.", updateError);
      setError("The escalation could not be updated. Check your access and try again.");
    } finally {
      setActionId(null);
    }
  }

  const patientMap = new Map(patients.map((patient) => [patient.id, patient]));
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const planMap = new Map(carePlans.map((plan) => [plan.id, plan]));
  const activeEscalations = escalations.filter(isActive);
  const priorityEscalations = activeEscalations.filter(
    (escalation) => escalation.priority.toUpperCase() === "HIGH",
  );
  const unresolved = occurrences.filter((occurrence) =>
    ["MISSED", "LATE", "UNCONFIRMED", "CONFLICTING"].includes(
      executionStates.get(occurrence.id) || "PENDING",
    ),
  );
  const today = (() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  })();
  const todayOccurrences = occurrences
    .filter((occurrence) => occurrence.occurrence_date === today)
    .sort((a, b) =>
      (a.allowed_start_time || "").localeCompare(b.allowed_start_time || ""),
    );
  const linkedPatients = [...new Map(patients.map((patient) => [patient.id, patient])).values()];

  return (
    <main className="min-h-screen px-4 py-8 sm:px-6" style={{ background: "var(--sc-background)", color: "var(--sc-text)" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 sc-animate-fade-up">
          <p className="sc-section-label">
            {audience === "CAREGIVER" ? "Caregiver" : "Clinical"} · SmartCare
          </p>
          <h1 className="sc-page-title mt-2">
            {audience === "CAREGIVER" ? "Caregiver Overview" : "Clinical Dashboard"}
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--sc-muted)" }}>
            Review authorized care plans, execution evidence, and escalations.
          </p>
        </div>

        {error && (
          <div role="alert" className="mb-6 sc-alert-error">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
              className="sc-btn-secondary mt-3"
            >
              Retry loading dashboard
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true" aria-label="Loading dashboard">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="sc-skeleton h-24" />
            ))}
          </div>
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Care plans", carePlans.length],
                ["Tasks", tasks.length],
                ["Unresolved occurrences", unresolved.length],
                ["Active escalations", activeEscalations.length],
                ["High priority", priorityEscalations.length],
                ...(audience === "CLINICIAN" ? [["Blocked dependencies", blockedCount] as const] : []),
              ].map(([label, value]) => (
                <div key={label} className="sc-metric sc-animate-fade-up">
                  <p className="sc-metric-label">{label}</p>
                  <p className="sc-metric-value">{value}</p>
                </div>
              ))}
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="sc-card-lg sc-animate-fade-up">
                <h2 className="text-xl font-semibold">
                  {audience === "CAREGIVER" ? "Linked patients" : "Patient list"}
                </h2>
                {linkedPatients.length === 0 ? (
                  <p className="mt-4 text-sm" style={{ color: "var(--sc-muted)" }}>
                    No patients are available under your current access.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {linkedPatients.map((patient) => {
                      const patientPlans = carePlans.filter(
                        (plan) => plan.patient_id === patient.id,
                      );
                      const patientNeedsReview = unresolved.some((occurrence) => {
                        const task = taskMap.get(occurrence.task_id);
                        return patientPlans.some(
                          (plan) => plan.id === task?.care_plan_id,
                        );
                      });
                      return (
                        <li
                          key={patient.id}
                          className="rounded-xl p-4"
                          style={{ border: "1px solid var(--sc-border)", background: "var(--sc-surface-soft)" }}
                        >
                          <p className="font-medium">{patient.full_name}</p>
                          <p className="mt-1 text-sm" style={{ color: "var(--sc-muted)" }}>
                            {patientNeedsReview
                              ? "Care activity needs review"
                              : "No current execution alerts"}
                          </p>
                          <ul className="mt-3 flex flex-wrap gap-3">
                            {patientPlans.map((plan) => (
                              <li key={plan.id}>
                                <Link
                                  href={`/care-plans/${plan.id}`}
                                  className="text-sm font-medium hover:underline"
                                  style={{ color: "var(--sc-primary)" }}
                                >
                                  {plan.name}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="sc-card-lg sc-animate-fade-up">
                <h2 className="text-xl font-semibold">Today&apos;s care</h2>
                {todayOccurrences.length === 0 ? (
                  <p className="mt-4 text-sm" style={{ color: "var(--sc-muted)" }}>
                    No care activities are scheduled for today.
                  </p>
                ) : (
                  <ul className="mt-4 divide-y" style={{ borderColor: "var(--sc-border)" }}>
                    {todayOccurrences.map((occurrence) => {
                      const task = taskMap.get(occurrence.task_id);
                      if (!task) return null;
                      const plan = planMap.get(task.care_plan_id);
                      const state = executionStates.get(occurrence.id) || "PENDING";
                      return (
                        <li
                          key={occurrence.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3"
                        >
                          <div>
                            <p className="font-medium">{task.name}</p>
                            <p className="mt-1 text-xs" style={{ color: "var(--sc-muted)" }}>
                              {patientMap.get(plan?.patient_id || "")?.full_name || "Patient"} ·{" "}
                              {occurrence.allowed_start_time?.slice(0, 5) || "Time not specified"}
                            </p>
                          </div>
                          <span className={stateBadge(state)}>
                            {state.replaceAll("_", " ")}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>

            <section className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="sc-card-lg sc-animate-fade-up">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Authorized care plans</h2>
                  {audience === "CLINICIAN" && (
                    <Link
                      href="/care-plans/new"
                      className="text-sm hover:underline"
                      style={{ color: "var(--sc-primary)" }}
                    >
                      Create care plan
                    </Link>
                  )}
                </div>
                {carePlans.length === 0 ? (
                  <p className="mt-5 text-sm" style={{ color: "var(--sc-muted)" }}>
                    No authorized care plans are available.
                  </p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {carePlans.map((plan) => (
                      <li
                        key={plan.id}
                        className="rounded-xl p-4"
                        style={{ border: "1px solid var(--sc-border)", background: "var(--sc-surface-soft)" }}
                      >
                        <Link
                          href={`/care-plans/${plan.id}`}
                          className="font-medium hover:underline"
                          style={{ color: "var(--sc-primary)" }}
                        >
                          {plan.name}
                        </Link>
                        <p className="mt-1 text-sm" style={{ color: "var(--sc-muted)" }}>
                          Patient: {patientMap.get(plan.patient_id)?.full_name || "Unavailable"}
                        </p>
                        <p className="mt-1 text-xs" style={{ color: "var(--sc-muted)" }}>
                          {tasks.filter((task) => task.care_plan_id === plan.id).length} tasks ·{" "}
                          {activeEscalations.filter((item) => item.care_plan_id === plan.id).length} active escalations
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="sc-card-lg sc-animate-fade-up">
                <h2 className="text-xl font-semibold">Active escalations</h2>
                {activeEscalations.length === 0 ? (
                  <p className="mt-5 text-sm" style={{ color: "var(--sc-muted)" }}>
                    No active escalations.
                  </p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {activeEscalations.map((escalation) => (
                      <li
                        key={escalation.id}
                        className="rounded-xl p-4"
                        style={{ border: "1px solid var(--sc-border)", background: "var(--sc-surface-soft)" }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{escalation.trigger_state}</span>
                          <span className="sc-badge sc-badge-warning">
                            {escalation.priority}
                          </span>
                        </div>
                        <p className="mt-2 text-sm" style={{ color: "var(--sc-muted)" }}>
                          {escalation.message || "Care-plan execution requires review."}
                        </p>
                        <p className="mt-2 text-xs" style={{ color: "var(--sc-muted)" }}>
                          {planMap.get(escalation.care_plan_id)?.name || "Care plan"} ·{" "}
                          {taskMap.get(escalation.task_id || "")?.name || "Task"} ·{" "}
                          {new Date(escalation.created_at).toLocaleString()}
                        </p>
                        <div className="mt-4 flex gap-2">
                          {escalation.status !== "ACKNOWLEDGED" && (
                            <button
                              type="button"
                              onClick={() => void updateEscalation(escalation, "ACKNOWLEDGED")}
                              disabled={actionId === escalation.id}
                              className="sc-btn-secondary text-xs px-3 py-1 disabled:opacity-50"
                            >
                              Acknowledge
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void updateEscalation(escalation, "RESOLVED")}
                            disabled={actionId === escalation.id}
                            className="sc-btn-primary text-xs px-3 py-1 disabled:opacity-50"
                          >
                            Resolve
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <section className="mt-8 sc-card-lg sc-animate-fade-up">
              <h2 className="text-xl font-semibold">Unresolved task occurrences</h2>
              {unresolved.length === 0 ? (
                <p className="mt-4 text-sm" style={{ color: "var(--sc-muted)" }}>
                  No unresolved execution deviations.
                </p>
              ) : (
                <ul className="mt-4 divide-y" style={{ borderColor: "var(--sc-border)" }}>
                  {unresolved.map((occurrence) => {
                    const task = taskMap.get(occurrence.task_id);
                    const plan = carePlans.find((item) => item.id === task?.care_plan_id);
                    const state = executionStates.get(occurrence.id) || "PENDING";
                    return (
                      <li key={occurrence.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <div>
                          <p className="font-medium">{task?.name || "Task"}</p>
                          <p className="mt-1 text-xs" style={{ color: "var(--sc-muted)" }}>
                            {planMap.get(plan?.id || "")?.name || "Care plan"} · {occurrence.occurrence_date}
                          </p>
                          <p className="mt-1 text-xs" style={{ color: "var(--sc-muted)" }}>
                            {events.filter((event) => event.occurrence_id === occurrence.id).length} events ·{" "}
                            {documents.filter((document) => document.occurrence_id === occurrence.id).length} documents
                          </p>
                        </div>
                        <span className={stateBadge(state)}>
                          {state.replaceAll("_", " ")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="mt-8 sc-card-lg sc-animate-fade-up">
              <h2 className="text-xl font-semibold">Escalation history</h2>
              {escalations.length === 0 ? (
                <p className="mt-4 text-sm" style={{ color: "var(--sc-muted)" }}>
                  No escalation history.
                </p>
              ) : (
                <ul className="mt-4 space-y-2">
                  {escalations.map((escalation) => (
                    <li
                      key={escalation.id}
                      className="flex flex-wrap justify-between gap-2 rounded-lg p-3 text-sm"
                      style={{ background: "var(--sc-surface-soft)" }}
                    >
                      <span>{escalation.trigger_state} · {escalation.status}</span>
                      <span style={{ color: "var(--sc-muted)" }}>
                        {new Date(escalation.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
