
"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { evaluateExecution } from "@/lib/smartcare/execution-engine";
import type { ExecutionState } from "@/lib/smartcare/types";
import { useSmartCareAuth } from "@/lib/supabase/auth-context";

interface CarePlan {
  id: string;
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

function stateStyle(state: ExecutionState): string {
  if (completed(state)) {
    return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  }

  if (["MISSED", "CONFLICTING"].includes(state)) {
    return "border-rose-400/20 bg-rose-400/10 text-rose-300";
  }

  if (["UNCONFIRMED", "INSUFFICIENT_EVIDENCE"].includes(state)) {
    return "border-amber-400/20 bg-amber-400/10 text-amber-300";
  }

  return "border-slate-700 bg-slate-800 text-slate-300";
}


function Panel({
  children,
  id,
  className = "",
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg shadow-black/10 sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}


function SectionTitle({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-semibold tracking-tight text-white">
        {title}
      </h2>
      {description && (
        <p className="mt-1 text-sm leading-6 text-slate-400">
          {description}
        </p>
      )}
    </div>
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (!userId) {
        throw new Error("No authenticated patient session.");
      }

      const todayDate = new Date();
      const todayString = toLocalDate(todayDate);
      const through = addDays(todayDate, 14);

      const [planResult, accessResult] = await Promise.all([
        supabase
          .from("care_plans")
          .select("id,name,description,status,start_date,end_date")
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

      const loadedPlans = (planResult.data || []) as CarePlan[];
      const ownGrants = (accessResult.data || []) as PatientAccess[];
      const patientIds = [
        ...new Set(ownGrants.map((grant) => grant.patient_id)),
      ];

      let loadedPatientRecords: PatientRecord[] = [];
      let loadedAccessGrants: PatientAccess[] = ownGrants;

      if (patientIds.length > 0) {
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

        loadedPatientRecords = (patientResult.data ||
          []) as PatientRecord[];
        loadedAccessGrants = (grantsResult.data ||
          []) as PatientAccess[];
      }

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

        loadedOccurrences = (occurrenceResult.data ||
          []) as Occurrence[];
        loadedEvents = (eventResult.data || []) as EventRecord[];
        loadedDocuments = (documentResult.data ||
          []) as DocumentRecord[];
      }

      setPlans(loadedPlans);
      setTasks(loadedTasks);
      setOccurrences(loadedOccurrences);
      setEvents(loadedEvents);
      setDocuments(loadedDocuments);
    } catch (loadError) {
      console.error("Unable to load the patient dashboard.", loadError);
      setError(
        "Your care information could not be loaded. Please try again.",
      );
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
            .filter(
              (document) => document.occurrence_id === occurrence.id,
            )
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
      .slice(0, 5)
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

  const recentDocuments = documents
    .slice()
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at))
    .slice(0, 3);

  return (
    <main
      id="dashboard"
      className="min-h-screen bg-[#080d18] px-4 py-8 text-slate-100 sm:px-6 lg:py-10"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-300">
              {now.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Your recovery plan
            </h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              A clear view of today’s care activities and what comes next.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-medium text-slate-200 transition hover:border-indigo-400/50 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh dashboard"}
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4"
          >
            <p className="font-medium text-rose-200">{error}</p>
            <button
              type="button"
              onClick={() => setReload((value) => value + 1)}
              className="mt-3 rounded-lg border border-rose-300/30 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-400/10"
            >
              Try again
            </button>
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-400">
                  Today’s care
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                  {loading ? "Loading…" : `${progress}%`}
                  <span className="ml-2 text-base font-normal text-slate-400">
                    complete
                  </span>
                </h2>
              </div>
              <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-sm font-medium text-indigo-200">
                {activePlans.length} active{" "}
                {activePlans.length === 1 ? "plan" : "plans"}
              </span>
            </div>
            <div
              className="mt-6 h-2.5 overflow-hidden rounded-full bg-slate-800"
              role="progressbar"
              aria-label="Today's care plan progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={loading ? 0 : progress}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-[width] duration-500"
                style={{ width: `${loading ? 0 : progress}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-slate-400">
              {loading
                ? "Checking scheduled care activities."
                : `${completedToday} of ${todayTasks.length} activities recorded as complete today.`}
            </p>
          </Panel>

          <Panel className="border-indigo-400/20 bg-gradient-to-br from-indigo-500/10 to-violet-500/5">
            <p className="text-sm font-medium text-indigo-300">
              Coming up
            </p>
            {loading ? (
              <p className="mt-3 text-sm text-slate-400">
                Finding your next activity…
              </p>
            ) : nextTask ? (
              <>
                <h2 className="mt-3 text-xl font-semibold text-white">
                  {nextTask.task.name}
                </h2>
                <p className="mt-2 text-sm text-slate-400">
                  {formatWindow(nextTask.occurrence)}
                </p>
                <Link
                  href={`/care-plans/${nextTask.task.care_plan_id}`}
                  className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
                >
                  View care plan <span className="ml-2">→</span>
                </Link>
              </>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                No upcoming activity is scheduled for today.
              </p>
            )}
          </Panel>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Panel id="tasks" className="scroll-mt-24">
            <SectionTitle
              title="Today’s activities"
              description="Your care team’s instructions for today."
            />

            {loading ? (
              <div className="space-y-3" aria-label="Loading today's activities">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-16 animate-pulse rounded-xl bg-slate-800"
                  />
                ))}
              </div>
            ) : todayTasks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 p-5 text-sm leading-6 text-slate-400">
                No activities are scheduled for today. If you expected to see
                a plan, contact your care team.
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {todayTasks.map(({ occurrence, task, state }) => (
                  <li
                    key={occurrence.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-white">{task.name}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {task.type.replaceAll("_", " ")} ·{" "}
                        {formatWindow(occurrence)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium ${stateStyle(state)}`}
                      >
                        {stateLabel(state)}
                      </span>
                      <Link
                        href={`/care-plans/${task.care_plan_id}`}
                        aria-label={`Open care plan for ${task.name}`}
                        className="rounded-lg px-3 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-400/10"
                      >
                        View
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="space-y-6">
            <Panel id="care-plans" className="scroll-mt-24">
              <SectionTitle title="Your care plans" />
              {loading ? (
                <p className="text-sm text-slate-400">Loading your plans…</p>
              ) : plans.length === 0 ? (
                <p className="rounded-xl bg-slate-800/70 p-4 text-sm leading-6 text-slate-400">
                  No care plan is linked to your account yet. Ask your care
                  team to connect your plan.
                </p>
              ) : (
                <ul className="space-y-3">
                  {plans.slice(0, 4).map((plan) => (
                    <li
                      key={plan.id}
                      className="rounded-xl border border-slate-800 bg-slate-800/40 p-4"
                    >
                      <Link
                        href={`/care-plans/${plan.id}`}
                        className="font-medium text-indigo-300 hover:text-indigo-200 hover:underline"
                      >
                        {plan.name}
                      </Link>
                      <p className="mt-1 text-xs capitalize text-slate-400">
                        {plan.status.toLowerCase()} · Started{" "}
                        {plan.start_date}
                      </p>
                      {plan.description && (
                        <p className="mt-2 text-sm leading-6 text-slate-400">
                          {plan.description}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel id="upcoming-care" className="scroll-mt-24">
              <SectionTitle
                title="Upcoming care"
                description="Activities listed in your care plan."
              />
              {!loading && upcomingTasks.length > 0 ? (
                <ul className="space-y-3">
                  {upcomingTasks.map(({ occurrence, task }) => (
                    <li
                      key={occurrence.id}
                      className="flex items-start justify-between gap-3 text-sm"
                    >
                      <Link
                        href={`/care-plans/${task.care_plan_id}`}
                        className="font-medium text-slate-200 hover:text-indigo-300"
                      >
                        {task.name}
                      </Link>
                      <span className="shrink-0 text-slate-400">
                        {new Date(
                          `${occurrence.occurrence_date}T12:00:00`,
                        ).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                !loading && (
                  <p className="text-sm leading-6 text-slate-400">
                    No upcoming care activities are listed in your plan.
                  </p>
                )
              )}

              <h3 className="mt-6 border-t border-slate-800 pt-5 text-sm font-semibold text-white">
                Appointments
              </h3>
              {!loading && upcomingAppointments.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {upcomingAppointments.map(({ occurrence, task }) => (
                    <li
                      key={occurrence.id}
                      className="flex flex-wrap justify-between gap-2 text-sm"
                    >
                      <span className="text-slate-200">{task.name}</span>
                      <span className="text-slate-400">
                        {new Date(
                          `${occurrence.occurrence_date}T12:00:00`,
                        ).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                !loading && (
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    No appointments are listed in your care plan. External
                    appointment systems are not connected.
                  </p>
                )
              )}
            </Panel>

            <Panel id="documents" className="scroll-mt-24">
              <SectionTitle title="Recent documents" />
              {recentDocuments.length > 0 ? (
                <ul className="space-y-3">
                  {recentDocuments.map((document, index) => (
                    <li
                      key={`${document.uploaded_at}-${index}`}
                      className="flex items-start gap-3 text-sm text-slate-300"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-300"
                      >
                        ↗
                      </span>
                      <div className="min-w-0">
                        <p className="break-words">{document.file_name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(document.uploaded_at).toLocaleDateString()}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm leading-6 text-slate-400">
                  No documents are linked to your care plans yet.
                </p>
              )}
              <p className="mt-4 text-xs leading-5 text-slate-500">
                Open a care plan to access documents using your authorized
                signed links.
              </p>
            </Panel>

            <Panel id="profile" className="scroll-mt-24">
              <SectionTitle title="Your profile" />
              <dl className="space-y-4 text-sm">
                <div>
                  <dt className="text-slate-400">Name</dt>
                  <dd className="mt-1 font-medium text-white">
                    {loading
                      ? "Loading…"
                      : patientRecords
                          .map((patient) => patient.full_name)
                          .join(", ") ||
                        "No patient profile is linked to this account."}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Account email</dt>
                  <dd className="mt-1 break-all font-medium text-white">
                    {session?.user.email || "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-400">Privacy and access</dt>
                  <dd className="mt-1 leading-6 text-slate-300">
                    Care information is limited by your account’s assigned
                    access. Contact your care team to request a correction or
                    access change.
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel id="care-team" className="scroll-mt-24">
              <SectionTitle
                title="Care team access"
                description="Access information available to this account."
              />
              {loading ? (
                <p className="text-sm text-slate-400">
                  Loading access information…
                </p>
              ) : accessGrants.filter(
                  (grant) => grant.access_role === "CAREGIVER",
                ).length > 0 ? (
                <ul className="space-y-3">
                  {accessGrants
                    .filter((grant) => grant.access_role === "CAREGIVER")
                    .map((grant) => (
                      <li
                        key={`${grant.patient_id}-${grant.user_id}`}
                        className="rounded-xl border border-slate-800 bg-slate-800/40 p-4"
                      >
                        <p className="font-medium text-white">
                          Caregiver account · {grant.user_id.slice(-8)}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {grant.active ? "Access active" : "Access inactive"}{" "}
                          · Granted{" "}
                          {new Date(grant.granted_at).toLocaleDateString()}
                        </p>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-slate-800/70 p-4 text-sm leading-6 text-slate-400">
                  No caregiver access is visible to this account. Ask your
                  care team to confirm current grants.
                </p>
              )}
            </Panel>

            <Panel id="measurements" className="scroll-mt-24">
              <SectionTitle title="Measurements" />
              <p className="text-sm leading-6 text-slate-400">
                No measurement history is connected to this account. SmartCare
                does not display simulated or invented clinical measurements.
              </p>
            </Panel>
          </div>
        </section>

        <footer className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 sm:p-6">
          <h2 className="font-semibold text-white">Need help?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Contact your care team if an instruction is unclear. SmartCare
            organizes your care plan but does not replace medical advice.
          </p>
        </footer>
      </div>
    </main>
  );
}
