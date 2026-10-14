"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { evaluateExecution } from "@/lib/smartcare/execution-engine";
import type { ExecutionState } from "@/lib/smartcare/types";
import { useSmartCareAuth } from "@/lib/supabase/auth-context";

interface CarePlan {
  id: string;
  patient_id?: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
}

interface Task {
  id: string;
  care_plan_id: string;
  name: string;
  type: string;
  verification_method: string | null;
}

interface Occurrence {
  id: string;
  task_id: string;
  occurrence_date: string;
  time_zone: string | null;
  allowed_start_time: string | null;
  allowed_end_time: string | null;
  status: string | null;
  completed_at: string | null;
  completion_source: string | null;
}

interface EventRecord {
  occurrence_id: string | null;
  event_time: string;
  source: string;
  value: string | null;
  confidence: number | null;
  notes: string | null;
}

interface DocumentRecord {
  occurrence_id: string | null;
  uploaded_at: string;
  file_name: string;
}

interface PatientAccess {
  patient_id: string;
  user_id: string;
  access_role: "PATIENT" | "CAREGIVER" | "CLINICIAN";
  active: boolean;
  granted_at: string;
}

interface PatientRecord {
  id: string;
  full_name: string;
}

function toLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): string {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return toLocalDate(next);
}

function formatWindow(occurrence: Occurrence): string {
  if (!occurrence.allowed_start_time && !occurrence.allowed_end_time) {
    return "Time not specified";
  }

  return `${occurrence.allowed_start_time?.slice(0, 5) || "Any time"}${
    occurrence.allowed_end_time
      ? ` – ${occurrence.allowed_end_time.slice(0, 5)}`
      : ""
  }`;
}

function stateLabel(state: ExecutionState): string {
  switch (state) {
    case "ON_TIME":
      return "Completed on time";
    case "LATE":
      return "Completed late";
    case "REPORTED":
      return "Reported complete";
    case "MISSED":
      return "Needs your attention";
    case "CONFLICTING":
      return "Needs review";
    case "UNCONFIRMED":
      return "Waiting for confirmation";
    case "INSUFFICIENT_EVIDENCE":
      return "Needs review";
    case "BEFORE_WINDOW":
    case "PENDING":
      return "Coming up";
    case "DOCUMENT_RECORDED":
      return "Evidence received";
    default:
      return "In progress";
  }
}

function completed(state: ExecutionState): boolean {
  return ["ON_TIME", "LATE", "REPORTED"].includes(state);
}

function stateStyle(state: ExecutionState): { badge: string; dot: string } {
  if (completed(state)) {
    return {
      badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      dot: "bg-emerald-400",
    };
  }

  if (["MISSED", "CONFLICTING"].includes(state)) {
    return {
      badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
      dot: "bg-rose-400",
    };
  }

  if (["UNCONFIRMED", "INSUFFICIENT_EVIDENCE"].includes(state)) {
    return {
      badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      dot: "bg-amber-400",
    };
  }

  return {
    badge: "border-[#EA9D9D]/30 bg-[#601D49]/20 text-[#FFEBB8]",
    dot: "bg-[#EA9D9D]",
  };
}

function TaskTypeIcon({ type }: { type: string }) {
  const norm = type.toLowerCase();
  if (norm.includes("medication")) {
    return (
      <svg className="h-5 w-5 text-[#BD5579]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
        <path d="m8.5 8.5 7 7" />
      </svg>
    );
  }
  if (norm.includes("appointment")) {
    return (
      <svg className="h-5 w-5 text-[#FFEBB8]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
        <line x1="16" x2="16" y1="2" y2="6" />
        <line x1="8" x2="8" y1="2" y2="6" />
        <line x1="3" x2="21" y1="10" y2="10" />
        <path d="m9 16 2 2 4-4" />
      </svg>
    );
  }
  if (norm.includes("exercise") || norm.includes("physio")) {
    return (
      <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    );
  }
  if (norm.includes("measurement") || norm.includes("vitals")) {
    return (
      <svg className="h-5 w-5 text-[#EA9D9D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </svg>
    );
  }
  if (norm.includes("wound")) {
    return (
      <svg className="h-5 w-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </svg>
    );
  }
  if (norm.includes("document")) {
    return (
      <svg className="h-5 w-5 text-[#BD5579]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function PatientDashboard() {
  const { session } = useSmartCareAuth();
  const userId = session?.user.id;

  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [patientRecords, setPatientRecords] = useState<PatientRecord[]>([]);
  const [accessGrants, setAccessGrants] = useState<PatientAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [activeTaskFilter, setActiveTaskFilter] = useState<"ALL" | "PENDING" | "COMPLETED">("ALL");
  const [assistantTab, setAssistantTab] = useState<"GUIDELINES" | "FAQS" | "SAFETY">("GUIDELINES");
  const [isPreview, setIsPreview] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (!userId) {
        setIsPreview(true);
        const todayDate = new Date();
        const todayString = toLocalDate(todayDate);
        setPlans([
          {
            id: "demo-care-plan-1",
            name: "Post-Operative Recovery Regimen",
            description:
              "Phase 1 recovery protocol following procedure. Focus on daily vitals tracking, gentle mobility, and wound site recovery.",
            status: "ACTIVE",
            start_date: todayString,
            end_date: addDays(todayDate, 28),
          },
        ]);
        setPatientRecords([
          { id: "demo-patient-1", full_name: "Eleanor Vance (Demo Patient)" },
        ]);
        setTasks([
          {
            id: "demo-task-1",
            care_plan_id: "demo-care-plan-1",
            name: "Amoxicillin 500mg (Morning Dose)",
            type: "MEDICATION",
            verification_method: "PATIENT_REPORT",
          },
          {
            id: "demo-task-2",
            care_plan_id: "demo-care-plan-1",
            name: "Bilateral Blood Pressure & Pulse",
            type: "MEASUREMENT",
            verification_method: "DEVICE_INTEGRATION",
          },
          {
            id: "demo-task-3",
            care_plan_id: "demo-care-plan-1",
            name: "Surgical Incision Inspection & Dressing",
            type: "WOUND_CARE",
            verification_method: "PHOTO_DOCUMENT",
          },
          {
            id: "demo-task-4",
            care_plan_id: "demo-care-plan-1",
            name: "Gentle Ambulation (15 minutes)",
            type: "EXERCISE",
            verification_method: "CAREGIVER_CONFIRMATION",
          },
          {
            id: "demo-task-5",
            care_plan_id: "demo-care-plan-1",
            name: "Post-Operative Clinical Follow-Up",
            type: "APPOINTMENT",
            verification_method: "CLINICAL_RECORD",
          },
        ]);
        setOccurrences([
          {
            id: "demo-occ-1",
            task_id: "demo-task-1",
            occurrence_date: todayString,
            time_zone: "UTC",
            allowed_start_time: "08:00:00",
            allowed_end_time: "10:00:00",
            status: "COMPLETED",
            completed_at: `${todayString}T08:30:00Z`,
            completion_source: "PATIENT",
          },
          {
            id: "demo-occ-2",
            task_id: "demo-task-2",
            occurrence_date: todayString,
            time_zone: "UTC",
            allowed_start_time: "09:00:00",
            allowed_end_time: "11:00:00",
            status: "COMPLETED",
            completed_at: `${todayString}T09:15:00Z`,
            completion_source: "DEVICE",
          },
          {
            id: "demo-occ-3",
            task_id: "demo-task-3",
            occurrence_date: todayString,
            time_zone: "UTC",
            allowed_start_time: "12:00:00",
            allowed_end_time: "14:00:00",
            status: "PENDING",
            completed_at: null,
            completion_source: null,
          },
          {
            id: "demo-occ-4",
            task_id: "demo-task-4",
            occurrence_date: todayString,
            time_zone: "UTC",
            allowed_start_time: "16:00:00",
            allowed_end_time: "18:00:00",
            status: "PENDING",
            completed_at: null,
            completion_source: null,
          },
          {
            id: "demo-occ-5",
            task_id: "demo-task-5",
            occurrence_date: addDays(todayDate, 3),
            time_zone: "UTC",
            allowed_start_time: "10:30:00",
            allowed_end_time: "11:30:00",
            status: "SCHEDULED",
            completed_at: null,
            completion_source: null,
          },
        ]);
        setEvents([
          {
            occurrence_id: "demo-occ-1",
            event_time: `${todayString}T08:30:00Z`,
            source: "PATIENT",
            value: "Taken with breakfast",
            confidence: 1.0,
            notes: null,
          },
          {
            occurrence_id: "demo-occ-2",
            event_time: `${todayString}T09:15:00Z`,
            source: "DEVICE",
            value: "122/80 mmHg, 72 bpm",
            confidence: 0.98,
            notes: "Automated Bluetooth cuff sync",
          },
        ]);
        setDocuments([
          {
            occurrence_id: null,
            uploaded_at: `${todayString}T07:00:00Z`,
            file_name: "Post-Surgical Discharge Plan & Instructions.pdf",
          },
          {
            occurrence_id: "demo-occ-3",
            uploaded_at: `${todayString}T08:00:00Z`,
            file_name: "Wound Dressing Protocol Guide.pdf",
          },
        ]);
        setAccessGrants([
          {
            patient_id: "demo-patient-1",
            user_id: "demo-caregiver",
            access_role: "CAREGIVER",
            active: true,
            granted_at: `${todayString}T06:00:00Z`,
          },
        ]);
        setLoading(false);
        return;
      }

      const todayDate = new Date();
      const todayString = toLocalDate(todayDate);
      const through = addDays(todayDate, 14);

      const [planResult, accessResult] = await Promise.all([
        supabase
          .from("care_plans")
          .select("id,patient_id,name,description,status,start_date,end_date")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("smartcare_patient_access")
          .select("patient_id,user_id,access_role,active,granted_at")
          .eq("user_id", userId)
          .eq("access_role", "PATIENT")
          .eq("active", true),
      ]);

      if (planResult.error) throw planResult.error;
      if (accessResult.error) throw accessResult.error;

      const rawPlans = (planResult.data || []) as CarePlan[];
      const ownGrants = (accessResult.data || []) as PatientAccess[];
      const patientIds = [
        ...new Set(ownGrants.map((grant) => grant.patient_id)),
      ];

      // If user has no active patient access grants, immediately clear all state
      if (patientIds.length === 0) {
        setPatientRecords([]);
        setAccessGrants([]);
        setPlans([]);
        setTasks([]);
        setOccurrences([]);
        setEvents([]);
        setDocuments([]);
        setLoading(false);
        return;
      }

      // Defense in depth: strictly isolate to care plans for patients explicitly granted
      const loadedPlans = rawPlans.filter(
        (plan) => !plan.patient_id || patientIds.includes(plan.patient_id),
      );

      let loadedPatientRecords: PatientRecord[] = [];
      let loadedAccessGrants: PatientAccess[] = ownGrants;

      const [patientResult, grantsResult] = await Promise.all([
        supabase
          .from("patients")
          .select("id,full_name")
          .in("id", patientIds),
        supabase
          .from("smartcare_patient_access")
          .select("patient_id,user_id,access_role,active,granted_at")
          .in("patient_id", patientIds)
          .order("granted_at", { ascending: false }),
      ]);

      if (patientResult.error) throw patientResult.error;
      if (grantsResult.error) throw grantsResult.error;

      loadedPatientRecords = (patientResult.data || []) as PatientRecord[];
      loadedAccessGrants = (grantsResult.data || []) as PatientAccess[];

      setPatientRecords(loadedPatientRecords);
      setAccessGrants(loadedAccessGrants);

      if (loadedPlans.length === 0) {
        setPlans([]);
        setTasks([]);
        setOccurrences([]);
        setEvents([]);
        setDocuments([]);
        return;
      }

      const planIds = loadedPlans.map((plan) => plan.id);

      const { data: taskRows, error: taskError } = await supabase
        .from("tasks")
        .select("id,care_plan_id,name,type,verification_method")
        .in("care_plan_id", planIds)
        .limit(500);

      if (taskError) throw taskError;

      const loadedTasks = (taskRows || []) as Task[];
      const taskIds = loadedTasks.map((task) => task.id);

      let loadedOccurrences: Occurrence[] = [];
      let loadedEvents: EventRecord[] = [];
      let loadedDocuments: DocumentRecord[] = [];

      if (taskIds.length > 0) {
        const [occurrenceResult, eventResult, documentResult] =
          await Promise.all([
            supabase
              .from("task_occurrences")
              .select(
                "id,task_id,occurrence_date,time_zone,allowed_start_time,allowed_end_time,status,completed_at,completion_source",
              )
              .in("task_id", taskIds)
              .gte("occurrence_date", todayString)
              .lte("occurrence_date", through)
              .order("occurrence_date", { ascending: true })
              .limit(1000),
            supabase
              .from("events")
              .select("occurrence_id,event_time,source,value,confidence,notes")
              .in("task_id", taskIds)
              .limit(1000),
            supabase
              .from("documents")
              .select("occurrence_id,uploaded_at,file_name")
              .in("task_id", taskIds)
              .limit(1000),
          ]);

        if (occurrenceResult.error) throw occurrenceResult.error;
        if (eventResult.error) throw eventResult.error;
        if (documentResult.error) throw documentResult.error;

        loadedOccurrences = (occurrenceResult.data || []) as Occurrence[];
        loadedEvents = (eventResult.data || []) as EventRecord[];
        loadedDocuments = (documentResult.data || []) as DocumentRecord[];
      }

      setPlans(loadedPlans);
      setTasks(loadedTasks);
      setOccurrences(loadedOccurrences);
      setEvents(loadedEvents);
      setDocuments(loadedDocuments);
    } catch (loadError) {
      console.error("Unable to load the patient dashboard.", loadError);
      setError("Your care information could not be loaded. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh, reload]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const today = toLocalDate(now);

  const taskMap = useMemo(
    () => new Map(tasks.map((task) => [task.id, task])),
    [tasks],
  );

  const todayTasks = useMemo(() => {
    return occurrences
      .filter((occurrence) => occurrence.occurrence_date === today)
      .flatMap((occurrence) => {
        const task = taskMap.get(occurrence.task_id);
        if (!task) return [];

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
          now,
        });

        return [{ occurrence, task, state: result.state }];
      })
      .sort((a, b) =>
        (a.occurrence.allowed_start_time || "").localeCompare(
          b.occurrence.allowed_start_time || "",
        ),
      );
  }, [documents, events, now, occurrences, taskMap, today]);

  const upcomingTasks = useMemo(() => {
    return occurrences
      .filter((occurrence) => occurrence.occurrence_date > today)
      .slice(0, 8)
      .flatMap((occurrence) => {
        const task = taskMap.get(occurrence.task_id);
        return task ? [{ occurrence, task }] : [];
      });
  }, [occurrences, taskMap, today]);

  const upcomingAppointments = upcomingTasks.filter(({ task }) =>
    task.type.toUpperCase().includes("APPOINTMENT"),
  );

  const completedToday = todayTasks.filter((item) =>
    completed(item.state),
  ).length;

  const progress =
    todayTasks.length === 0
      ? 0
      : Math.round((completedToday / todayTasks.length) * 100);

  const nextTask = todayTasks.find(
    (item) =>
      !completed(item.state) &&
      !["MISSED", "CONFLICTING"].includes(item.state),
  );

  const activePlans = plans.filter(
    (plan) =>
      !["COMPLETED", "CLOSED", "CANCELLED"].includes(
        plan.status.toUpperCase(),
      ),
  );

  const primaryPlan = activePlans[0] || plans[0] || null;

  const recentDocuments = documents
    .slice()
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, 4);

  const patientDisplayName =
    patientRecords.map((p) => p.full_name).join(", ") ||
    (session?.user.email ? session.user.email.split("@")[0] : "Patient");

  const patientInitials = patientDisplayName
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "P";

  const filteredTodayTasks = useMemo(() => {
    if (activeTaskFilter === "COMPLETED") {
      return todayTasks.filter((t) => completed(t.state));
    }
    if (activeTaskFilter === "PENDING") {
      return todayTasks.filter((t) => !completed(t.state));
    }
    return todayTasks;
  }, [todayTasks, activeTaskFilter]);

  return (
    <main
      id="dashboard"
      className="relative min-h-screen bg-[#0f050d] px-4 py-8 text-slate-100 sm:px-6 lg:px-8 lg:py-10"
    >
      {/* Subtle background ambient gradients */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-[#601D49]/20 blur-[120px]" />
        <div className="absolute right-0 top-1/4 h-[600px] w-[600px] rounded-full bg-[#BD5579]/15 blur-[140px]" />
        <div className="absolute bottom-10 left-1/3 h-[500px] w-[500px] rounded-full bg-[#EA9D9D]/10 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl space-y-8">
        {isPreview && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EA9D9D]/40 bg-[#601D49]/25 px-4 py-3 text-xs text-[#FFEBB8]">
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#FFEBB8] px-2 py-0.5 font-bold text-[#4a1538]">
                DEMO PREVIEW
              </span>
              <span>
                Displaying synthetic patient sample data for demonstration. Live patient records remain protected behind Supabase authentication.
              </span>
            </div>
            <span className="text-[#EA9D9D]">Read-only preview</span>
          </div>
        )}

        {/* Top Header & Patient Identity Bar */}
        <header className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#601D49] via-[#852765] to-[#BD5579] text-lg font-bold text-white shadow-lg shadow-[#601D49]/35">
              {patientInitials}
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0f050d] ring-2 ring-[#0f050d]">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Welcome back, {patientDisplayName}
                </h1>
                <span className="rounded-full border border-[#EA9D9D]/30 bg-[#601D49]/30 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-[#FFEBB8]">
                  Patient Portal
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 sm:text-sm">
                <span>
                  {now.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                <span>•</span>
                <span className="text-emerald-400">Recovery Care Regimen Active</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {primaryPlan && (
              <Link
                href={`/care-plans/${primaryPlan.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#BD5579]/40 bg-[#BD5579]/15 px-4 text-xs font-semibold uppercase tracking-wider text-[#EA9D9D] transition hover:bg-[#BD5579]/25"
              >
                <span>View Full Care Plan</span>
                <span aria-hidden="true">→</span>
              </Link>
            )}
            <button
              type="button"
              onClick={() => setReload((v) => v + 1)}
              disabled={loading}
              aria-label="Refresh care dashboard"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700/80 bg-[#220f1e]/80 px-4 text-xs font-semibold text-slate-200 transition hover:border-[#BD5579]/50 hover:bg-[#2e1529] disabled:opacity-50"
            >
              <svg
                className={`h-4 w-4 ${loading ? "animate-spin text-[#BD5579]" : "text-slate-400"}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              <span>{loading ? "Syncing…" : "Sync"}</span>
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 shadow-lg backdrop-blur-md"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-rose-200">{error}</p>
                <p className="mt-1 text-xs text-rose-300/80">
                  If this error persists, confirm your account authorization with your clinical team.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReload((v) => v + 1)}
                className="rounded-lg border border-rose-400/40 bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/30"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Overview Metric Cards Grid */}
        <section
          aria-label="Care plan summary metrics"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {/* Card 1: Today's Adherence Progress */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#180a15]/80 p-5 shadow-lg shadow-black/20 transition hover:border-[#BD5579]/40 hover:shadow-[#BD5579]/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Today&apos;s Adherence
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#BD5579]/15 text-[#BD5579]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </span>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-white">
                {loading ? "…" : `${progress}%`}
              </span>
              <span className="text-xs font-medium text-slate-400">
                {completedToday} of {todayTasks.length} done
              </span>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#BD5579] to-[#EA9D9D] transition-all duration-700 ease-out"
                style={{ width: `${loading ? 0 : progress}%` }}
              />
            </div>
          </div>

          {/* Card 2: Active Recovery Plans */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#180a15]/80 p-5 shadow-lg shadow-black/20 transition hover:border-[#BD5579]/40 hover:shadow-[#BD5579]/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Care Plans
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#601D49]/30 text-[#FFEBB8]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </span>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-extrabold tracking-tight text-white">
                {loading ? "…" : activePlans.length}
              </span>
              <p className="mt-1 truncate text-xs font-medium text-slate-400">
                {primaryPlan ? primaryPlan.name : "No active care plans"}
              </p>
            </div>
            <p className="mt-3 text-[0.7rem] text-slate-500">
              {primaryPlan ? `Started ${primaryPlan.start_date}` : "Awaiting clinician assignment"}
            </p>
          </div>

          {/* Card 3: Next Scheduled Activity */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#180a15]/80 p-5 shadow-lg shadow-black/20 transition hover:border-[#BD5579]/40 hover:shadow-[#BD5579]/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Next Activity
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </span>
            </div>
            <div className="mt-4">
              <p className="truncate text-base font-bold text-white">
                {loading ? "Checking schedule…" : nextTask ? nextTask.task.name : "All tasks complete today"}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {nextTask ? formatWindow(nextTask.occurrence) : "No remaining scheduled items"}
              </p>
            </div>
            <p className="mt-3 text-[0.7rem] text-slate-500">
              {nextTask ? "Window enforced by plan schedule" : "Great job staying on track!"}
            </p>
          </div>

          {/* Card 4: Connected Care Team / Caregivers */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#180a15]/80 p-5 shadow-lg shadow-black/20 transition hover:border-[#BD5579]/40 hover:shadow-[#BD5579]/5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Care Team Access
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#BD5579]/15 text-[#EA9D9D]">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
            </div>
            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold tracking-tight text-white">
                {loading ? "…" : accessGrants.filter((g) => g.access_role === "CAREGIVER" && g.active).length}
              </span>
              <span className="text-xs font-medium text-emerald-400">Active Grants</span>
            </div>
            <p className="mt-3 text-[0.7rem] text-slate-500">
              Row-Level Security protects patient privacy
            </p>
          </div>
        </section>

        {/* Main Content Layout Grid */}
        <div className="grid gap-8 lg:grid-cols-[1.55fr_1fr]">
          {/* Left Column: Daily Tasks, Upcoming, Care Plans */}
          <div className="space-y-8">
            {/* Daily Tasks Section */}
            <section
              id="tasks"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/20 backdrop-blur-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#BD5579]" />
                    <h2 className="text-xl font-bold tracking-tight text-white">
                      Today&apos;s Care Schedule
                    </h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Prescribed recovery activities and verification windows for today.
                  </p>
                </div>

                {/* Filter Pills */}
                <div className="flex rounded-xl border border-slate-800 bg-[#140712] p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTaskFilter("ALL")}
                    className={`rounded-lg px-3 py-1 font-medium transition ${
                      activeTaskFilter === "ALL"
                        ? "bg-[#601D49] text-[#FFEBB8] shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    All ({todayTasks.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTaskFilter("PENDING")}
                    className={`rounded-lg px-3 py-1 font-medium transition ${
                      activeTaskFilter === "PENDING"
                        ? "bg-[#601D49] text-[#FFEBB8] shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Pending ({todayTasks.length - completedToday})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTaskFilter("COMPLETED")}
                    className={`rounded-lg px-3 py-1 font-medium transition ${
                      activeTaskFilter === "COMPLETED"
                        ? "bg-[#601D49] text-[#FFEBB8] shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    Done ({completedToday})
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="mt-6 space-y-3" aria-label="Loading today's tasks">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="h-20 animate-pulse rounded-xl border border-slate-800 bg-slate-900/60"
                    />
                  ))}
                </div>
              ) : filteredTodayTasks.length === 0 ? (
                <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800/80 bg-slate-900/40 px-6 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#BD5579]/15 text-[#BD5579]">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </span>
                  <p className="mt-3 text-sm font-semibold text-white">
                    {todayTasks.length === 0
                      ? "No care activities scheduled for today"
                      : "No activities match the selected filter"}
                  </p>
                  <p className="mt-1 max-w-sm text-xs text-slate-400">
                    {todayTasks.length === 0
                      ? "If you were expecting scheduled medications or appointments today, please contact your care team."
                      : "Switch your filter to view all scheduled care activities."}
                  </p>
                </div>
              ) : (
                <ul className="mt-6 space-y-3">
                  {filteredTodayTasks.map(({ occurrence, task, state }) => {
                    const style = stateStyle(state);
                    const isDone = completed(state);

                    return (
                      <li
                        key={occurrence.id}
                        className={`group relative flex flex-col justify-between gap-4 rounded-xl border p-4 transition md:flex-row md:items-center ${
                          isDone
                            ? "border-slate-800/60 bg-slate-900/40"
                            : "border-white/10 bg-[#140712]/80 hover:border-[#BD5579]/40 hover:bg-[#1e0c1b]"
                        }`}
                      >
                        <div className="flex items-start gap-3.5 min-w-0">
                          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-800 bg-[#0f050d]">
                            <TaskTypeIcon type={task.type} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className={`font-semibold ${isDone ? "text-slate-300 line-through" : "text-white"}`}>
                                {task.name}
                              </p>
                              <span className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">
                                {task.type.replaceAll("_", " ")}
                              </span>
                            </div>
                            <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span className="inline-flex items-center gap-1">
                                <svg className="h-3 w-3 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="12" r="10" />
                                  <polyline points="12 6 12 12 16 14" />
                                </svg>
                                {formatWindow(occurrence)}
                              </span>
                              {task.verification_method && (
                                <>
                                  <span>•</span>
                                  <span className="text-slate-500">
                                    Verify via {task.verification_method.replaceAll("_", " ")}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${style.badge}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
                            {stateLabel(state)}
                          </span>

                          <Link
                            href={`/care-plans/${task.care_plan_id}`}
                            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-800 px-3 text-xs font-semibold text-slate-200 transition hover:border-[#BD5579] hover:text-[#FFEBB8]"
                          >
                            Details →
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Upcoming Activities Timeline */}
            <section
              id="upcoming-care"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/20 backdrop-blur-md"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    Upcoming Activities
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Forward schedule derived from your care plans.
                  </p>
                </div>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs text-slate-300">
                  Next 14 Days
                </span>
              </div>

              {!loading && upcomingTasks.length > 0 ? (
                <div className="mt-6 space-y-3">
                  {upcomingTasks.map(({ occurrence, task }) => (
                    <div
                      key={occurrence.id}
                      className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-[#140712]/60 p-3.5 transition hover:border-[#BD5579]/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900">
                          <TaskTypeIcon type={task.type} />
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`/care-plans/${task.care_plan_id}`}
                            className="truncate text-sm font-medium text-slate-200 hover:text-[#BD5579] hover:underline"
                          >
                            {task.name}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {formatWindow(occurrence)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-xs font-mono text-slate-300">
                          {new Date(`${occurrence.occurrence_date}T12:00:00`).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !loading && (
                  <p className="mt-6 rounded-xl border border-dashed border-slate-800/80 p-5 text-center text-xs text-slate-500">
                    No further upcoming activities recorded in the forward schedule.
                  </p>
                )
              )}

              {/* Upcoming Appointments Sub-section */}
              <div className="mt-8 border-t border-slate-800/80 pt-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#FFEBB8]">
                  Clinical Appointments
                </h3>
                {!loading && upcomingAppointments.length > 0 ? (
                  <ul className="mt-3 space-y-2">
                    {upcomingAppointments.map(({ occurrence, task }) => (
                      <li
                        key={occurrence.id}
                        className="flex items-center justify-between rounded-xl border border-[#EA9D9D]/30 bg-[#601D49]/20 p-3 text-xs"
                      >
                        <span className="font-semibold text-[#FFEBB8]">{task.name}</span>
                        <span className="font-mono text-[#EA9D9D]">
                          {new Date(`${occurrence.occurrence_date}T12:00:00`).toLocaleDateString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !loading && (
                    <p className="mt-2 text-xs text-slate-500">
                      No standalone clinical appointments found in current plan occurrences.
                    </p>
                  )
                )}
              </div>
            </section>

            {/* Active Care Plans Overview */}
            <section
              id="care-plans"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/20 backdrop-blur-md"
            >
              <h2 className="text-xl font-bold tracking-tight text-white">
                Assigned Care Plans
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Authorized plans connected to your medical record.
              </p>

              {loading ? (
                <div className="mt-5 space-y-3">
                  <div className="h-24 animate-pulse rounded-xl bg-slate-900" />
                </div>
              ) : plans.length === 0 ? (
                <p className="mt-5 rounded-xl border border-dashed border-slate-800 p-5 text-center text-xs text-slate-500">
                  No care plan is linked to your account yet. Contact your clinical team.
                </p>
              ) : (
                <div className="mt-5 space-y-4">
                  {plans.map((plan) => (
                    <div
                      key={plan.id}
                      className="group rounded-xl border border-white/10 bg-[#140712]/70 p-4 transition hover:border-[#BD5579]/40 hover:bg-[#1e0c1b]"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link
                          href={`/care-plans/${plan.id}`}
                          className="text-base font-bold text-[#FFEBB8] hover:text-[#EA9D9D] hover:underline"
                        >
                          {plan.name}
                        </Link>
                        <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-emerald-300">
                          {plan.status.toLowerCase()}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Effective from {plan.start_date}
                        {plan.end_date ? ` to ${plan.end_date}` : " (ongoing)"}
                      </p>
                      {plan.description && (
                        <p className="mt-2 text-xs leading-5 text-slate-300">
                          {plan.description}
                        </p>
                      )}
                      <div className="mt-4 flex items-center justify-end">
                        <Link
                          href={`/care-plans/${plan.id}`}
                          className="text-xs font-semibold text-[#BD5579] hover:text-[#d67a99]"
                        >
                          Open Detailed Regimen →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Assistant, Documents, Care Team, Profile */}
          <div className="space-y-8">
            {/* Integrated Care Navigator / Assistant Panel */}
            <section
              aria-label="SmartCare Care Navigator"
              className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#2e1529] via-[#180a15] to-[#0f050d] p-6 shadow-2xl shadow-[#601D49]/20"
            >
              <div className="flex items-center justify-between border-b border-[#EA9D9D]/20 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#601D49] to-[#BD5579] text-white shadow-md shadow-[#601D49]/30">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-white">SmartCare Navigator</h3>
                    <p className="text-[0.68rem] text-[#EA9D9D]">Grounded Plan Companion</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-300 border border-emerald-500/20">
                  Online
                </span>
              </div>

              {/* Navigator Tabs */}
              <div className="mt-4 flex rounded-lg border border-slate-800 bg-[#0f050d]/80 p-1 text-[0.7rem]">
                <button
                  type="button"
                  onClick={() => setAssistantTab("GUIDELINES")}
                  className={`flex-1 rounded py-1 font-semibold transition ${
                    assistantTab === "GUIDELINES"
                      ? "bg-[#601D49] text-[#FFEBB8] shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Daily Plan
                </button>
                <button
                  type="button"
                  onClick={() => setAssistantTab("FAQS")}
                  className={`flex-1 rounded py-1 font-semibold transition ${
                    assistantTab === "FAQS"
                      ? "bg-[#601D49] text-[#FFEBB8] shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Quick Help
                </button>
                <button
                  type="button"
                  onClick={() => setAssistantTab("SAFETY")}
                  className={`flex-1 rounded py-1 font-semibold transition ${
                    assistantTab === "SAFETY"
                      ? "bg-[#601D49] text-[#FFEBB8] shadow-xs"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Safety
                </button>
              </div>

              {/* Tab Contents */}
              <div className="mt-4 text-xs leading-5 text-slate-300">
                {assistantTab === "GUIDELINES" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-[#EA9D9D]/20 bg-[#601D49]/20 p-3">
                      <p className="font-semibold text-[#FFEBB8]">Active Regimen</p>
                      <p className="mt-0.5 text-slate-300">
                        {primaryPlan ? primaryPlan.name : "Your care regimen is currently being finalized."}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-semibold text-white">Daily Execution Checklist:</p>
                      <ul className="space-y-1.5 text-slate-400">
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#BD5579]" />
                          <span>Complete activities during their specified time windows.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#BD5579]" />
                          <span>Ensure required evidence or self-reports are submitted on time.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#BD5579]" />
                          <span>Check with your connected caregiver for secondary confirmation.</span>
                        </li>
                      </ul>
                    </div>

                    {primaryPlan && (
                      <Link
                        href={`/care-plans/${primaryPlan.id}`}
                        className="mt-2 block text-center font-semibold text-[#BD5579] hover:underline"
                      >
                        Inspect Care Plan Protocol →
                      </Link>
                    )}
                  </div>
                )}

                {assistantTab === "FAQS" && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800 bg-[#140712]/60 p-3">
                      <p className="font-semibold text-white">How do I verify a task?</p>
                      <p className="mt-1 text-slate-400">
                        Open the activity from your care plan details to record a report or upload documentation.
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-[#140712]/60 p-3">
                      <p className="font-semibold text-white">What if I take medication late?</p>
                      <p className="mt-1 text-slate-400">
                        SmartCare preserves the exact submission timestamp and logs the execution state transparently.
                      </p>
                    </div>
                  </div>
                )}

                {assistantTab === "SAFETY" && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-amber-200/90">
                    <p className="font-semibold text-amber-300">Important Safety Reminder</p>
                    <p className="mt-1 leading-5 text-xs text-amber-200/80">
                      SmartCare organizes your recovery plan but does not provide emergency medical diagnosis. In case of acute discomfort or medical emergency, contact your physician or local emergency services immediately.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Recent Documents Section */}
            <section
              id="documents"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/20 backdrop-blur-md"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">
                  Care Documents
                </h2>
                <span className="text-xs text-slate-500">
                  {recentDocuments.length} files
                </span>
              </div>

              {recentDocuments.length > 0 ? (
                <ul className="mt-4 space-y-2.5">
                  {recentDocuments.map((doc, index) => (
                    <li
                      key={`${doc.uploaded_at}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#140712]/60 p-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#BD5579]/15 text-[#BD5579]">
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                          </svg>
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-200">
                            {doc.file_name}
                          </p>
                          <p className="text-[0.65rem] text-slate-500">
                            Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span className="text-[0.65rem] text-slate-400 shrink-0 font-mono">
                        Verified
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-slate-800/80 p-4 text-center text-xs text-slate-500">
                  No medical reports or lab files attached yet.
                </p>
              )}
              <p className="mt-4 text-[0.68rem] leading-relaxed text-slate-500">
                Documents are secured under Supabase Storage Row-Level Security with short-lived signed URLs.
              </p>
            </section>

            {/* Care Team & Caregiver Access Grants */}
            <section
              id="care-team"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/20 backdrop-blur-md"
            >
              <h2 className="text-base font-bold text-white">
                Care Team Access
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Authorized accounts linked to your recovery.
              </p>

              {loading ? (
                <p className="mt-4 text-xs text-slate-500">Checking grants…</p>
              ) : accessGrants.filter((g) => g.access_role === "CAREGIVER").length > 0 ? (
                <ul className="mt-4 space-y-2.5">
                  {accessGrants
                    .filter((g) => g.access_role === "CAREGIVER")
                    .map((grant) => (
                      <li
                        key={`${grant.patient_id}-${grant.user_id}`}
                        className="rounded-xl border border-white/10 bg-[#140712]/60 p-3 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">
                            Caregiver •···{grant.user_id.slice(-6)}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                              grant.active
                                ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {grant.active ? "Active" : "Revoked"}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.68rem] text-slate-500">
                          Granted {new Date(grant.granted_at).toLocaleDateString()}
                        </p>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed border-slate-800/80 p-4 text-center text-xs text-slate-500">
                  No caregiver access grants currently registered for this account.
                </p>
              )}
            </section>

            {/* Profile & Privacy Identity */}
            <section
              id="profile"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/20 backdrop-blur-md"
            >
              <h2 className="text-base font-bold text-white">
                Profile & Access
              </h2>
              <dl className="mt-4 space-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-800/60 pb-2">
                  <dt className="text-slate-400">Patient Name</dt>
                  <dd className="font-semibold text-white">{patientDisplayName}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-2">
                  <dt className="text-slate-400">Account Email</dt>
                  <dd className="font-mono text-slate-300 truncate max-w-[180px]">
                    {session?.user.email || "Unavailable"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-slate-800/60 pb-2">
                  <dt className="text-slate-400">Role</dt>
                  <dd className="font-semibold text-[#FFEBB8]">PATIENT</dd>
                </div>
                <div className="pt-1">
                  <dt className="text-slate-400">Data Protection</dt>
                  <dd className="mt-1 text-[0.68rem] leading-relaxed text-slate-500">
                    Encrypted at rest with strict Row-Level Security. Contact your administrator for permission adjustments.
                  </dd>
                </div>
              </dl>
            </section>

            {/* Measurements Section */}
            <section
              id="measurements"
              className="scroll-mt-24 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/20 backdrop-blur-md"
            >
              <h2 className="text-base font-bold text-white">
                Measurements & Telemetry
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Connected IoT device streaming and laboratory metrics appear once paired. SmartCare enforces verified telemetry without simulated values.
              </p>
            </section>
          </div>
        </div>

        {/* Footer Support Banner */}
        <footer className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#180a15]/60 p-6 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-white">Need Clinical Assistance?</h4>
            <p className="mt-1 text-xs text-slate-400">
              For treatment adjustments or urgent health questions, please contact your care team directly.
            </p>
          </div>
          <p className="text-[0.68rem] text-slate-500 shrink-0">
            SmartCare Health Platform • Care, connected.
          </p>
        </footer>
      </div>
    </main>
  );
}
