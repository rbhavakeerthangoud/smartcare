"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import {
  useSmartCareAuth,
  type SmartCareRole,
} from "@/lib/supabase/auth-context";

interface UserRole {
  user_id: string;
  role: SmartCareRole;
  created_at: string;
}

interface Patient {
  id: string;
  full_name: string;
}

interface PatientAccess {
  patient_id: string;
  user_id: string;
  access_role: "PATIENT" | "CAREGIVER" | "CLINICIAN";
  active: boolean;
  granted_at: string;
}

interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  occurred_at: string;
}

interface CarePlanVersion {
  id: string;
  care_plan_id: string;
  version: number;
  snapshot: Record<string, unknown>;
  author_id: string | null;
  reason: string | null;
  created_at: string;
}

interface CarePlanSummary {
  id: string;
  name: string;
}

interface NotificationSummary {
  id: string;
  channel: string;
  status: string;
  created_at: string;
}

const roles: SmartCareRole[] = ["PATIENT", "CAREGIVER", "CLINICIAN", "ADMIN"];
const accessRoles: PatientAccess["access_role"][] = [
  "PATIENT",
  "CAREGIVER",
  "CLINICIAN",
];

export default function AdminPage() {
  const { session } = useSmartCareAuth();
  const [userRoles, setUserRoles] = useState<UserRole[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [carePlans, setCarePlans] = useState<CarePlanSummary[]>([]);
  const [accessGrants, setAccessGrants] = useState<PatientAccess[]>([]);
  const [carePlanCount, setCarePlanCount] = useState(0);
  const [escalations, setEscalations] = useState<Array<{ status: string }>>([]);
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [versions, setVersions] = useState<CarePlanVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError("");
    const [
      roleResult,
      patientResult,
      accessResult,
      carePlanResult,
      escalationResult,
      notificationResult,
      auditResult,
      versionResult,
    ] = await Promise.all([
      supabase
        .from("smartcare_user_roles")
        .select("user_id,role,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("patients").select("id,full_name").order("full_name").limit(500),
      supabase
        .from("smartcare_patient_access")
        .select("patient_id,user_id,access_role,active,granted_at")
        .order("granted_at", { ascending: false })
        .limit(500),
      supabase.from("care_plans").select("id,name", { count: "exact" }).limit(1000),
      supabase.from("escalations").select("status").limit(1000),
      supabase
        .from("smartcare_notifications")
        .select("id,channel,status,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("smartcare_audit_log")
        .select("id,actor_id,action,object_type,object_id,occurred_at")
        .order("occurred_at", { ascending: false })
        .limit(20),
      supabase
        .from("care_plan_versions")
        .select("id,care_plan_id,version,snapshot,author_id,reason,created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const results = [
      roleResult,
      patientResult,
      accessResult,
      carePlanResult,
      escalationResult,
      notificationResult,
      auditResult,
      versionResult,
    ];
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      console.error("Unable to load administration data.", failed.error);
      setError(
        "Administration data could not be loaded. Confirm your admin role and database permissions, then retry.",
      );
      setLoading(false);
      return;
    }

    setUserRoles((roleResult.data || []) as UserRole[]);
    setPatients((patientResult.data || []) as Patient[]);
    setCarePlans((carePlanResult.data || []) as CarePlanSummary[]);
    setAccessGrants((accessResult.data || []) as PatientAccess[]);
    setCarePlanCount(carePlanResult.count || 0);
    setEscalations((escalationResult.data || []) as Array<{ status: string }>);
    setNotifications((notificationResult.data || []) as NotificationSummary[]);
    setAuditEntries((auditResult.data || []) as AuditEntry[]);
    setVersions((versionResult.data || []) as CarePlanVersion[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAdminData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAdminData, reload]);

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const userId = String(data.get("roleUserId") || "").trim();
    const role = String(data.get("role") || "");
    if (!userId || !roles.includes(role as SmartCareRole)) {
      setError("Choose an existing account and a valid SmartCare role.");
      setSaving(false);
      return;
    }
    if (userId === session?.user.id) {
      setError("For safety, an administrator cannot change their own role here.");
      setSaving(false);
      return;
    }

    const { error: upsertError } = await supabase
      .from("smartcare_user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id" });
    if (upsertError) {
      console.error("Unable to update SmartCare role.", upsertError);
      setError("Role could not be saved. Check the user ID and administrator permissions.");
    } else {
      setMessage("SmartCare role saved.");
      form.reset();
      setReload((value) => value + 1);
    }
    setSaving(false);
  }

  async function grantPatientAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const patientId = String(data.get("patientId") || "");
    const userId = String(data.get("accessUserId") || "").trim();
    const accessRole = String(data.get("accessRole") || "");
    if (
      !patientId ||
      !userId ||
      !accessRoles.includes(accessRole as PatientAccess["access_role"])
    ) {
      setError("Choose a patient, an existing account, and an access role.");
      setSaving(false);
      return;
    }

    const { error: grantError } = await supabase
      .from("smartcare_patient_access")
      .upsert(
        { patient_id: patientId, user_id: userId, access_role: accessRole, active: true },
        { onConflict: "patient_id,user_id,access_role" },
      );
    if (grantError) {
      console.error("Unable to save patient access.", grantError);
      setError("Patient access could not be saved. Verify the selected IDs and administrator permissions.");
    } else {
      setMessage("Patient access grant saved.");
      form.reset();
      setReload((value) => value + 1);
    }
    setSaving(false);
  }

  async function revokeAccess(grant: PatientAccess) {
    if (!window.confirm("Revoke this patient access grant?")) return;
    setError("");
    setMessage("");
    const { error: revokeError } = await supabase
      .from("smartcare_patient_access")
      .update({ active: false })
      .eq("patient_id", grant.patient_id)
      .eq("user_id", grant.user_id)
      .eq("access_role", grant.access_role);
    if (revokeError) {
      console.error("Unable to revoke patient access.", revokeError);
      setError("Access could not be revoked. Check your administrator permissions.");
      return;
    }
    setMessage("Patient access revoked.");
    setReload((value) => value + 1);
  }

  const activeEscalations = escalations.filter(
    (item) => !["RESOLVED", "CLOSED"].includes(item.status.toUpperCase()),
  ).length;
  const notificationCounts = notifications.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    },
    {},
  );
  const patientName = (patientId: string) =>
    patients.find((patient) => patient.id === patientId)?.full_name || "Patient";
  const carePlanName = (carePlanId: string) =>
    carePlans.find((carePlan) => carePlan.id === carePlanId)?.name || "Care plan";

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="sc-admin-hero mb-8 rounded-2xl p-6 text-white sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
            SmartCare · Administration
          </p>
          <h1 className="mt-3 text-3xl font-semibold">System overview</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Manage existing roles and patient access, and review platform activity.
            Account creation remains in Supabase Authentication.
          </p>
        </header>

        {(error || message) && (
          <div
            role={error ? "alert" : "status"}
            className={`mb-6 rounded-xl border p-4 text-sm ${
              error
                ? "border-rose-200 bg-rose-50 text-rose-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            {error || message}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Loading administration overview">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : error ? (
          <button
            type="button"
            onClick={() => setReload((value) => value + 1)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium"
          >
            Retry loading
          </button>
        ) : (
          <>
            <section aria-label="System metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Assigned users" value={userRoles.length} detail="Accounts with a SmartCare role" />
              <Metric label="Patients" value={patients.length} detail="Visible under administrator access" />
              <Metric label="Care plans" value={carePlanCount} detail="Available in the database" />
              <Metric label="Active escalations" value={activeEscalations} detail="Not resolved or closed" />
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Assign a SmartCare role</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Select an account already registered in Supabase Authentication.
                  This does not create an authentication account.
                </p>
                <form onSubmit={assignRole} className="mt-5 grid gap-4 sm:grid-cols-[1fr_10rem_auto]">
                  <label className="text-sm font-medium">
                    Supabase user ID
                    <input name="roleUserId" required pattern="[0-9a-fA-F-]{36}" placeholder="UUID of an existing auth user" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs" />
                  </label>
                  <label className="text-sm font-medium">
                    Role
                    <select name="role" required defaultValue="PATIENT" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
                      {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <button disabled={saving} className="self-end min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    Save role
                  </button>
                </form>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <tr><th className="py-3 pr-4">User ID</th><th className="py-3 pr-4">Role</th><th className="py-3">Assigned</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userRoles.map((item) => (
                        <tr key={item.user_id}>
                          <td className="py-3 pr-4 font-mono text-xs">{item.user_id}</td>
                          <td className="py-3 pr-4">{item.role}</td>
                          <td className="py-3">{new Date(item.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Patient access</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Grant the minimum patient-level access needed. Existing RLS remains enabled.
                </p>
                <form onSubmit={grantPatientAccess} className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">
                    Patient
                    <select name="patientId" required defaultValue="" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
                      <option value="" disabled>Select patient</option>
                      {patients.map((patient) => (
                        <option key={patient.id} value={patient.id}>{patient.full_name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium">
                    Supabase user ID
                    <input name="accessUserId" required pattern="[0-9a-fA-F-]{36}" placeholder="UUID of an existing auth user" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-mono text-xs" />
                  </label>
                  <label className="text-sm font-medium">
                    Access role
                    <select name="accessRole" required defaultValue="PATIENT" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
                      {accessRoles.map((role) => <option key={role} value={role}>{role}</option>)}
                    </select>
                  </label>
                  <button disabled={saving || patients.length === 0 || userRoles.length === 0} className="self-end min-h-11 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    Save access
                  </button>
                </form>
                <ul className="mt-5 divide-y divide-slate-100">
                  {accessGrants.length === 0 ? (
                    <li className="py-4 text-sm text-slate-500">No patient access grants are available.</li>
                  ) : accessGrants.slice(0, 10).map((grant) => (
                    <li key={`${grant.patient_id}-${grant.user_id}-${grant.access_role}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{patientName(grant.patient_id)} · {grant.access_role}</p>
                        <p className="mt-1 truncate font-mono text-xs text-slate-500">{grant.user_id}</p>
                      </div>
                      {grant.active ? (
                        <button type="button" onClick={() => void revokeAccess(grant)} className="min-h-9 rounded-lg border border-rose-200 px-3 text-xs font-medium text-rose-800 hover:bg-rose-50">
                          Revoke
                        </button>
                      ) : <span className="text-xs text-slate-500">Revoked</span>}
                    </li>
                  ))}
                </ul>
              </article>
            </section>

            <section className="mt-6 grid gap-6 xl:grid-cols-2">
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Recent audit activity</h2>
                {auditEntries.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No audit entries are available.</p>
                ) : (
                  <ol className="mt-4 divide-y divide-slate-100">
                    {auditEntries.map((entry) => (
                      <li key={entry.id} className="py-3">
                        <p className="font-medium">{entry.action} · {entry.object_type}</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-500">
                          {entry.object_id || "No object ID"} · {entry.actor_id || "System"}
                        </p>
                        <time className="mt-1 block text-xs text-slate-500" dateTime={entry.occurred_at}>
                          {new Date(entry.occurred_at).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </article>

              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xl font-semibold">Care-plan history</h2>
                {versions.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No plan versions are available.</p>
                ) : (
                  <ul className="mt-4 divide-y divide-slate-100">
                    {versions.map((version) => (
                      <li key={version.id} className="py-3">
                        <p className="font-medium">Version {version.version} · {carePlanName(version.care_plan_id)}</p>
                        <p className="mt-1 text-sm text-slate-600">{version.reason || "Care-plan record updated"}</p>
                        <p className="mt-1 text-xs text-slate-500">Author: {version.author_id || "System / migration"}</p>
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer font-medium text-teal-800">Snapshot details</summary>
                          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-600">
                            {["name", "status", "source_type", "start_date", "end_date"].map((key) => (
                              <FragmentField
                                key={key}
                                label={key.replaceAll("_", " ")}
                                value={version.snapshot[key]}
                              />
                            ))}
                          </dl>
                        </details>
                        <time className="mt-1 block text-xs text-slate-500" dateTime={version.created_at}>
                          {new Date(version.created_at).toLocaleString()}
                        </time>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Notification monitoring</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Status counts below cover the latest {notifications.length} records visible to this console.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(notificationCounts).map(([status, count]) => (
                    <span key={status} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                      {status}: {count}
                    </span>
                  ))}
                </div>
              </div>
              {notifications.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">No notification records are available.</p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {notifications.slice(0, 8).map((notification) => (
                    <li key={notification.id} className="rounded-xl bg-slate-50 p-4">
                      <p className="font-medium">{notification.status}</p>
                      <p className="mt-1 text-xs text-slate-500">{notification.channel}</p>
                      <time className="mt-2 block text-xs text-slate-500" dateTime={notification.created_at}>
                        {new Date(notification.created_at).toLocaleString()}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p className="mt-6 text-xs text-slate-500">
              External scheduler and email/SMS/voice delivery are configuration-dependent and are not represented as live integrations here.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </article>
  );
}

function FragmentField({ label, value }: { label: string; value: unknown }) {
  return (
    <>
      <dt className="capitalize">{label}</dt>
      <dd className="break-all">{value == null ? "—" : String(value)}</dd>
    </>
  );
}
