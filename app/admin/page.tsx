"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

interface DoctorRecord {
  user_id: string;
  name: string;
  department: string;
  specialty: string;
  hospital: string;
  license_number: string;
  status: "AUTHORIZED" | "PENDING_APPROVAL" | "SUSPENDED" | "REVOKED";
  assigned_patients_count: number;
  authorized_at: string;
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
  metadata?: Record<string, unknown>;
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
  patient_id?: string;
  status?: string;
}

interface NotificationSummary {
  id: string;
  channel: string;
  status: string;
  created_at: string;
}

const roles: SmartCareRole[] = ["CLINICIAN", "PATIENT", "CAREGIVER", "ADMIN"];
const accessRoles: PatientAccess["access_role"][] = [
  "CLINICIAN",
  "PATIENT",
  "CAREGIVER",
];

const INITIAL_DEMO_DOCTORS: DoctorRecord[] = [
  {
    user_id: "usr-doc-01",
    name: "Dr. Sarah Chen, MD",
    department: "Cardiology & Post-Operative Care",
    specialty: "Interventional Cardiology",
    hospital: "MetroHealth Heart & Vascular Pavilion",
    license_number: "MD-9402849-NY",
    status: "AUTHORIZED",
    assigned_patients_count: 3,
    authorized_at: "2026-09-15T09:00:00Z",
  },
  {
    user_id: "usr-doc-02",
    name: "Dr. Michael Patel, MD",
    department: "Orthopedic Surgery & Rehabilitation",
    specialty: "Joint Reconstruction",
    hospital: "MetroHealth Surgical Center",
    license_number: "MD-7294820-NY",
    status: "AUTHORIZED",
    assigned_patients_count: 2,
    authorized_at: "2026-09-20T10:30:00Z",
  },
  {
    user_id: "usr-doc-03",
    name: "Dr. Elena Rodriguez, MD",
    department: "Internal Medicine & Post-Discharge Recovery",
    specialty: "Geriatric & Complex Care",
    hospital: "MetroHealth Medical Center - West Wing",
    license_number: "MD-6492018-NY",
    status: "PENDING_APPROVAL",
    assigned_patients_count: 0,
    authorized_at: "2026-10-12T14:15:00Z",
  },
  {
    user_id: "usr-doc-04",
    name: "Dr. James Wilson, MD",
    department: "Pulmonary & Critical Care",
    specialty: "Respiratory Medicine",
    hospital: "MetroHealth Respiratory Pavilion",
    license_number: "MD-5294810-NY",
    status: "SUSPENDED",
    assigned_patients_count: 1,
    authorized_at: "2026-08-01T11:00:00Z",
  },
];

export default function AdminPage() {
  const { session } = useSmartCareAuth();
  const [activeTab, setActiveTab] = useState<
    "DOCTORS" | "PATIENTS" | "ROLES" | "AUDIT" | "VERSIONS"
  >("DOCTORS");

  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
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
  const [isDemo, setIsDemo] = useState(false);

  // Filters
  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorStatusFilter, setDoctorStatusFilter] = useState<string>("ALL");
  const [auditActionFilter, setAuditActionFilter] = useState<string>("ALL");

  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setError("");

    if (!session) {
      setIsDemo(true);
      setDoctors(INITIAL_DEMO_DOCTORS);
      setUserRoles([
        { user_id: "usr-doc-01", role: "CLINICIAN", created_at: "2026-09-15T09:00:00Z" },
        { user_id: "usr-doc-02", role: "CLINICIAN", created_at: "2026-09-20T10:30:00Z" },
        { user_id: "usr-doc-03", role: "CLINICIAN", created_at: "2026-10-12T14:15:00Z" },
        { user_id: "usr-doc-04", role: "CLINICIAN", created_at: "2026-08-01T11:00:00Z" },
        { user_id: "usr-patient-01", role: "PATIENT", created_at: "2026-10-12T11:00:00Z" },
        { user_id: "usr-patient-02", role: "PATIENT", created_at: "2026-10-13T09:00:00Z" },
        { user_id: "usr-caregiver-01", role: "CAREGIVER", created_at: "2026-10-11T09:30:00Z" },
        { user_id: "usr-admin-01", role: "ADMIN", created_at: "2026-08-01T00:00:00Z" },
      ]);
      setPatients([
        { id: "demo-p-1", full_name: "Eleanor Vance" },
        { id: "demo-p-2", full_name: "Marcus Brody" },
        { id: "demo-p-3", full_name: "Arthur Pendelton" },
        { id: "demo-p-4", full_name: "Clara Oswald" },
      ]);
      setCarePlans([
        { id: "demo-cp-1", name: "Post-Cardiac Recovery Regimen", status: "ACTIVE" },
        { id: "demo-cp-2", name: "Orthopedic Mobility Protocol", status: "ACTIVE" },
        { id: "demo-cp-3", name: "Pulmonary Rehabilitation Phase 2", status: "ACTIVE" },
      ]);
      setAccessGrants([
        { patient_id: "demo-p-1", user_id: "usr-doc-01", access_role: "CLINICIAN", active: true, granted_at: "2026-09-16T10:00:00Z" },
        { patient_id: "demo-p-1", user_id: "usr-patient-01", access_role: "PATIENT", active: true, granted_at: "2026-09-16T10:05:00Z" },
        { patient_id: "demo-p-1", user_id: "usr-caregiver-01", access_role: "CAREGIVER", active: true, granted_at: "2026-09-17T11:00:00Z" },
        { patient_id: "demo-p-2", user_id: "usr-doc-02", access_role: "CLINICIAN", active: true, granted_at: "2026-09-22T08:30:00Z" },
        { patient_id: "demo-p-2", user_id: "usr-patient-02", access_role: "PATIENT", active: true, granted_at: "2026-09-22T08:35:00Z" },
      ]);
      setCarePlanCount(3);
      setEscalations([{ status: "OPEN" }, { status: "RESOLVED" }, { status: "ACKNOWLEDGED" }]);
      setNotifications([
        { id: "demo-notif-1", channel: "WEB", status: "DELIVERED", created_at: "2026-10-14T10:00:00Z" },
        { id: "demo-notif-2", channel: "EMAIL", status: "SENT", created_at: "2026-10-13T14:30:00Z" },
      ]);
      setAuditEntries([
        { id: "audit-01", actor_id: "usr-admin-01", action: "AUTHORIZE_DOCTOR", object_type: "DOCTOR", object_id: "usr-doc-03", occurred_at: "2026-10-14T15:30:00Z" },
        { id: "audit-02", actor_id: "usr-admin-01", action: "GRANT_PATIENT_ACCESS", object_type: "PATIENT_ACCESS", object_id: "demo-p-1", occurred_at: "2026-10-14T12:00:00Z" },
        { id: "audit-03", actor_id: "usr-doc-01", action: "CREATE_CARE_PLAN", object_type: "CARE_PLAN", object_id: "demo-cp-1", occurred_at: "2026-10-14T09:15:00Z" },
        { id: "audit-04", actor_id: "usr-doc-01", action: "RESOLVE_ESCALATION", object_type: "ESCALATION", object_id: "esc-001", occurred_at: "2026-10-14T08:30:00Z" },
        { id: "audit-05", actor_id: "usr-admin-01", action: "SUSPEND_DOCTOR", object_type: "DOCTOR", object_id: "usr-doc-04", occurred_at: "2026-10-10T11:00:00Z" },
      ]);
      setVersions([
        {
          id: "v-2",
          care_plan_id: "demo-cp-1",
          version: 2,
          snapshot: { name: "Post-Cardiac Recovery Regimen", status: "ACTIVE", source_type: "healthcare" },
          author_id: "usr-doc-01",
          reason: "Adjusted morning window for cardiac medication",
          created_at: "2026-10-14T10:00:00Z",
        },
        {
          id: "v-1",
          care_plan_id: "demo-cp-1",
          version: 1,
          snapshot: { name: "Post-Cardiac Recovery Regimen", status: "ACTIVE", source_type: "healthcare" },
          author_id: "usr-doc-01",
          reason: "Initial care plan baseline established",
          created_at: "2026-10-12T08:00:00Z",
        },
      ]);
      setLoading(false);
      return;
    }

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
      supabase.from("care_plans").select("id,name,status", { count: "exact" }).limit(1000),
      supabase.from("escalations").select("status").limit(1000),
      supabase
        .from("smartcare_notifications")
        .select("id,channel,status,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("smartcare_audit_log")
        .select("id,actor_id,action,object_type,object_id,occurred_at,metadata")
        .order("occurred_at", { ascending: false })
        .limit(40),
      supabase
        .from("care_plan_versions")
        .select("id,care_plan_id,version,snapshot,author_id,reason,created_at")
        .order("created_at", { ascending: false })
        .limit(30),
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

    const loadedRoles = (roleResult.data || []) as UserRole[];
    const loadedAccess = (accessResult.data || []) as PatientAccess[];

    // Extract doctors from CLINICIAN user roles
    const clinicianRoles = loadedRoles.filter((r) => r.role === "CLINICIAN");
    const loadedDoctors: DoctorRecord[] = clinicianRoles.map((cr, idx) => {
      const assignedCount = loadedAccess.filter(
        (a) => a.user_id === cr.user_id && a.access_role === "CLINICIAN" && a.active,
      ).length;
      return {
        user_id: cr.user_id,
        name: `Dr. Clinician #${cr.user_id.slice(0, 8)}`,
        department: "Department of Clinical Care",
        specialty: "Attending Physician",
        hospital: "SmartCare Regional Health Center",
        license_number: `NPI-${1000000000 + idx}`,
        status: "AUTHORIZED",
        assigned_patients_count: assignedCount,
        authorized_at: cr.created_at,
      };
    });

    setDoctors(loadedDoctors);
    setUserRoles(loadedRoles);
    setPatients((patientResult.data || []) as Patient[]);
    setCarePlans((carePlanResult.data || []) as CarePlanSummary[]);
    setAccessGrants(loadedAccess);
    setCarePlanCount(carePlanResult.count || 0);
    setEscalations((escalationResult.data || []) as Array<{ status: string }>);
    setNotifications((notificationResult.data || []) as NotificationSummary[]);
    setAuditEntries((auditResult.data || []) as AuditEntry[]);
    setVersions((versionResult.data || []) as CarePlanVersion[]);
    setLoading(false);
  }, [session]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadAdminData(), 0);
    return () => window.clearTimeout(timer);
  }, [loadAdminData, reload]);

  /*
  |--------------------------------------------------------------------------
  | Doctor Management: Authorize, Suspend, Revoke
  |--------------------------------------------------------------------------
  */

  async function handleAuthorizeDoctor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const userId = String(data.get("doctorUserId") || "").trim();
    const name = String(data.get("doctorName") || "").trim();
    const department = String(data.get("doctorDepartment") || "").trim();
    const specialty = String(data.get("doctorSpecialty") || "").trim();
    const licenseNumber = String(data.get("doctorLicense") || "").trim();

    if (!userId) {
      setError("Provide a valid Supabase user ID (UUID) for the doctor account.");
      setSaving(false);
      return;
    }

    if (!session) {
      // Demo mode simulation
      const newDoc: DoctorRecord = {
        user_id: userId,
        name: name || `Dr. ${userId.slice(0, 8)}`,
        department: department || "General Medicine",
        specialty: specialty || "Attending Physician",
        hospital: "MetroHealth Medical Center",
        license_number: licenseNumber || "NPI-PENDING",
        status: "AUTHORIZED",
        assigned_patients_count: 0,
        authorized_at: "2026-10-15T01:00:00Z",
      };

      setDoctors((curr) => [newDoc, ...curr.filter((d) => d.user_id !== userId)]);
      setUserRoles((curr) => [
        { user_id: userId, role: "CLINICIAN", created_at: "2026-10-15T01:00:00Z" },
        ...curr.filter((r) => r.user_id !== userId),
      ]);
      setAuditEntries((curr) => [
        {
          id: `audit-${curr.length + 1}`,
          actor_id: "usr-admin-01",
          action: "AUTHORIZE_DOCTOR",
          object_type: "DOCTOR",
          object_id: userId,
          occurred_at: "2026-10-15T01:00:00Z",
        },
        ...curr,
      ]);

      setMessage(`Doctor ${newDoc.name} authorized with CLINICIAN privileges (Simulated in demo mode).`);
      form.reset();
      setSaving(false);
      return;
    }

    // Live mode: update smartcare_user_roles with CLINICIAN role
    const { error: upsertError } = await supabase
      .from("smartcare_user_roles")
      .upsert({ user_id: userId, role: "CLINICIAN" }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Unable to authorize doctor.", upsertError);
      setError(`Doctor authorization failed: ${upsertError.message}`);
    } else {
      setMessage(`Doctor account ${userId} authorized successfully as CLINICIAN.`);
      form.reset();
      setReload((v) => v + 1);
    }
    setSaving(false);
  }

  async function handleUpdateDoctorStatus(
    doctor: DoctorRecord,
    newStatus: "AUTHORIZED" | "SUSPENDED" | "REVOKED",
  ) {
    const actionLabel =
      newStatus === "AUTHORIZED"
        ? "Authorize / Activate"
        : newStatus === "SUSPENDED"
        ? "Suspend"
        : "Revoke authorization for";

    if (
      !window.confirm(
        `${actionLabel} ${doctor.name}? Suspended or revoked doctors cannot access clinical care-plan tools.`,
      )
    ) {
      return;
    }

    setError("");
    setMessage("");

    if (!session) {
      setDoctors((curr) =>
        curr.map((d) =>
          d.user_id === doctor.user_id ? { ...d, status: newStatus } : d,
        ),
      );
      setAuditEntries((curr) => [
        {
          id: `audit-${curr.length + 1}`,
          actor_id: "usr-admin-01",
          action: `${newStatus}_DOCTOR`,
          object_type: "DOCTOR",
          object_id: doctor.user_id,
          occurred_at: "2026-10-15T01:00:00Z",
        },
        ...curr,
      ]);
      setMessage(`Doctor status updated to ${newStatus} (Simulated in demo mode).`);
      return;
    }

    // In live mode:
    if (newStatus === "REVOKED") {
      const { error: revokeRoleError } = await supabase
        .from("smartcare_user_roles")
        .update({ status: "REVOKED" })
        .eq("user_id", doctor.user_id);

      if (revokeRoleError) {
        // Fallback: delete if status column update fails
        await supabase
          .from("smartcare_user_roles")
          .delete()
          .eq("user_id", doctor.user_id);
      }

      // Deactivate all active clinician patient access grants for this doctor
      await supabase
        .from("smartcare_patient_access")
        .update({ active: false })
        .eq("user_id", doctor.user_id)
        .eq("access_role", "CLINICIAN");
    } else if (newStatus === "SUSPENDED") {
      const { error: suspendError } = await supabase
        .from("smartcare_user_roles")
        .update({ status: "SUSPENDED" })
        .eq("user_id", doctor.user_id);

      if (suspendError) {
        setError(`Could not suspend doctor account: ${suspendError.message}`);
        return;
      }
    } else if (newStatus === "AUTHORIZED") {
      const { error: activateError } = await supabase
        .from("smartcare_user_roles")
        .update({ status: "ACTIVE" })
        .eq("user_id", doctor.user_id);

      if (activateError) {
        setError(`Could not activate doctor account: ${activateError.message}`);
        return;
      }
    }

    setMessage(`Doctor status updated to ${newStatus}.`);
    setReload((v) => v + 1);
  }

  /*
  |--------------------------------------------------------------------------
  | Role Management: Assign System Roles
  |--------------------------------------------------------------------------
  */

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
    if (session && userId === session.user.id) {
      setError("For safety, an administrator cannot change their own role here.");
      setSaving(false);
      return;
    }

    if (!session) {
      setUserRoles((curr) => [
        { user_id: userId, role: role as SmartCareRole, created_at: "2026-10-15T01:00:00Z" },
        ...curr.filter((r) => r.user_id !== userId),
      ]);
      setAuditEntries((curr) => [
        {
          id: `audit-${curr.length + 1}`,
          actor_id: "usr-admin-01",
          action: "ASSIGN_ROLE",
          object_type: "USER_ROLE",
          object_id: userId,
          occurred_at: "2026-10-15T01:00:00Z",
        },
        ...curr,
      ]);
      setMessage("SmartCare role saved (Simulated in demo mode).");
      form.reset();
      setSaving(false);
      return;
    }

    const { error: upsertError } = await supabase
      .from("smartcare_user_roles")
      .upsert({ user_id: userId, role }, { onConflict: "user_id" });

    if (upsertError) {
      console.error("Unable to update SmartCare role.", upsertError);
      setError(`Role could not be saved: ${upsertError.message}`);
    } else {
      setMessage("SmartCare role saved successfully.");
      form.reset();
      setReload((value) => value + 1);
    }
    setSaving(false);
  }

  /*
  |--------------------------------------------------------------------------
  | Patient Access Governance: Grant & Revoke
  |--------------------------------------------------------------------------
  */

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

    if (!session) {
      setAccessGrants((curr) => [
        {
          patient_id: patientId,
          user_id: userId,
          access_role: accessRole as PatientAccess["access_role"],
          active: true,
          granted_at: "2026-10-15T01:00:00Z",
        },
        ...curr,
      ]);
      setAuditEntries((curr) => [
        {
          id: `audit-${curr.length + 1}`,
          actor_id: "usr-admin-01",
          action: "GRANT_PATIENT_ACCESS",
          object_type: "PATIENT_ACCESS",
          object_id: patientId,
          occurred_at: "2026-10-15T01:00:00Z",
        },
        ...curr,
      ]);
      setMessage("Patient access grant saved (Simulated in demo mode).");
      form.reset();
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
      setError(`Patient access could not be saved: ${grantError.message}`);
    } else {
      setMessage("Patient access grant saved successfully.");
      form.reset();
      setReload((value) => value + 1);
    }
    setSaving(false);
  }

  async function revokeAccess(grant: PatientAccess) {
    if (!window.confirm("Revoke this patient access grant?")) return;
    setError("");
    setMessage("");

    if (!session) {
      setAccessGrants((curr) =>
        curr.map((g) =>
          g.patient_id === grant.patient_id && g.user_id === grant.user_id
            ? { ...g, active: false }
            : g,
        ),
      );
      setAuditEntries((curr) => [
        {
          id: `audit-${curr.length + 1}`,
          actor_id: "usr-admin-01",
          action: "REVOKE_PATIENT_ACCESS",
          object_type: "PATIENT_ACCESS",
          object_id: grant.patient_id,
          occurred_at: "2026-10-15T01:00:00Z",
        },
        ...curr,
      ]);
      setMessage("Patient access revoked (Simulated in demo mode).");
      return;
    }

    const { error: revokeError } = await supabase
      .from("smartcare_patient_access")
      .update({ active: false })
      .eq("patient_id", grant.patient_id)
      .eq("user_id", grant.user_id)
      .eq("access_role", grant.access_role);

    if (revokeError) {
      console.error("Unable to revoke patient access.", revokeError);
      setError(`Access could not be revoked: ${revokeError.message}`);
      return;
    }
    setMessage("Patient access revoked successfully.");
    setReload((value) => value + 1);
  }

  // Calculations
  const activeDoctorsCount = doctors.filter((d) => d.status === "AUTHORIZED").length;
  const pendingDoctorsCount = doctors.filter((d) => d.status === "PENDING_APPROVAL").length;
  const activeEscalations = escalations.filter(
    (item) => !["RESOLVED", "CLOSED"].includes(item.status.toUpperCase()),
  ).length;

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      const matchesSearch =
        doc.name.toLowerCase().includes(doctorSearch.toLowerCase()) ||
        doc.specialty.toLowerCase().includes(doctorSearch.toLowerCase()) ||
        doc.department.toLowerCase().includes(doctorSearch.toLowerCase()) ||
        doc.user_id.toLowerCase().includes(doctorSearch.toLowerCase());

      const matchesStatus =
        doctorStatusFilter === "ALL" || doc.status === doctorStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [doctors, doctorSearch, doctorStatusFilter]);

  const filteredAudits = useMemo(() => {
    return auditEntries.filter((audit) => {
      if (auditActionFilter === "ALL") return true;
      return audit.action.includes(auditActionFilter);
    });
  }, [auditEntries, auditActionFilter]);

  const patientName = (patientId: string) =>
    patients.find((patient) => patient.id === patientId)?.full_name || "Patient";
  const carePlanName = (carePlanId: string) =>
    carePlans.find((carePlan) => carePlan.id === carePlanId)?.name || "Care plan";

  return (
    <main className="relative min-h-screen bg-[#0f050d] px-4 py-8 text-slate-100 sm:px-6 lg:px-8 lg:py-10">
      {/* Background ambient glow effects */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden="true"
      >
        <div className="absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-[#601D49]/20 blur-[120px]" />
        <div className="absolute right-0 top-1/4 h-[600px] w-[600px] rounded-full bg-[#BD5579]/15 blur-[140px]" />
        <div className="absolute bottom-10 left-1/3 h-[500px] w-[500px] rounded-full bg-[#EA9D9D]/10 blur-[120px]" />
      </div>

      <div className="mx-auto max-w-7xl space-y-8">
        {/* Demo Preview Banner */}
        {isDemo && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#EA9D9D]/40 bg-[#601D49]/25 px-4 py-3 text-xs text-[#FFEBB8]">
            <div className="flex items-center gap-2">
              <span className="rounded bg-[#FFEBB8] px-2 py-0.5 font-bold text-[#4a1538]">
                DEMO PREVIEW
              </span>
              <span>
                Viewing Hospital Admin Portal in preview mode with synthetic facility records. Doctor authorizations and access grants operate in simulated preview mode without database writes.
              </span>
            </div>
            <span className="text-[#EA9D9D]">Governance Simulation Mode</span>
          </div>
        )}

        {/* Top Header & Facility Identity */}
        <header className="flex flex-col gap-6 rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#601D49] via-[#852765] to-[#BD5579] text-xl font-bold text-white shadow-lg shadow-[#601D49]/35">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#0f050d] ring-2 ring-[#0f050d]">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              </span>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  Hospital Operations & Governance
                </h1>
                <span className="rounded-full border border-[#EA9D9D]/30 bg-[#601D49]/30 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-[#FFEBB8]">
                  Hospital Admin Portal
                </span>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 sm:text-sm">
                <span className="font-medium text-slate-300">MetroHealth Medical Center</span>
                <span>•</span>
                <span>Facility ID: METRO-FAC-8921</span>
                <span>•</span>
                <span className="text-emerald-400">HIPAA Security Tier-3 Active</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setReload((v) => v + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-[#220f1e]/60 px-4 text-xs font-semibold uppercase tracking-wider text-slate-200 transition hover:bg-[#2e1529] active:scale-[0.98]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("DOCTORS")}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#BD5579] to-[#9e3e5f] px-4 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-[#BD5579]/25 transition hover:from-[#d67a99] hover:to-[#BD5579] active:scale-[0.98]"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" x2="19" y1="8" y2="14" />
                <line x1="22" x2="16" y1="11" y2="11" />
              </svg>
              Authorize Doctor
            </button>
          </div>
        </header>

        {/* Status Message Alerts */}
        {(error || message) && (
          <div
            role={error ? "alert" : "status"}
            className={`rounded-xl border p-4 text-sm ${
              error
                ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {error ? (
                <svg className="h-5 w-5 shrink-0 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" x2="12" y1="8" y2="12" />
                  <line x1="12" x2="12.01" y1="16" y2="16" />
                </svg>
              ) : (
                <svg className="h-5 w-5 shrink-0 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              )}
              <span>{error || message}</span>
            </div>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" aria-label="Loading administration overview">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60" />
            ))}
          </div>
        ) : (
          <>
            {/* System Overview Metrics Cards */}
            <section aria-label="System metrics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <MetricCard
                label="Authorized Doctors"
                value={activeDoctorsCount}
                detail={`${pendingDoctorsCount} pending approval`}
                badge="Medical Staff"
                badgeColor="blue"
                icon={
                  <svg className="h-5 w-5 text-[#BD5579]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                }
              />
              <MetricCard
                label="Enrolled Patients"
                value={patients.length}
                detail="Active hospital records"
                badge="Patients"
                badgeColor="indigo"
                icon={
                  <svg className="h-5 w-5 text-[#EA9D9D]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" x2="16" y1="2" y2="6" />
                    <line x1="8" x2="8" y1="2" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                  </svg>
                }
              />
              <MetricCard
                label="Active Care Plans"
                value={carePlanCount}
                detail="Prescribed recovery regimens"
                badge="Care Plans"
                badgeColor="violet"
                icon={
                  <svg className="h-5 w-5 text-[#BD5579]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                }
              />
              <MetricCard
                label="Active Escalations"
                value={activeEscalations}
                detail={activeEscalations === 0 ? "All items resolved" : "Requires clinical review"}
                badge="Safety Alerts"
                badgeColor={activeEscalations > 0 ? "amber" : "emerald"}
                icon={
                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                    <line x1="12" x2="12" y1="9" y2="13" />
                    <line x1="12" x2="12.01" y1="17" y2="17" />
                  </svg>
                }
              />
              <MetricCard
                label="Audit Trail Events"
                value={auditEntries.length}
                detail="Immutably recorded"
                badge="Compliance"
                badgeColor="emerald"
                icon={
                  <svg className="h-5 w-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                  </svg>
                }
              />
            </section>

            {/* Navigation Tabs Bar */}
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-2">
              <button
                type="button"
                onClick={() => setActiveTab("DOCTORS")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${
                  activeTab === "DOCTORS"
                    ? "bg-[#601D49] text-[#FFEBB8] ring-1 ring-[#EA9D9D]/40"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span>Doctor Directory & Authorization</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${activeTab === "DOCTORS" ? "bg-[#FFEBB8]/20 text-[#FFEBB8]" : "bg-slate-800 text-slate-400"}`}>
                  {doctors.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("PATIENTS")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${
                  activeTab === "PATIENTS"
                    ? "bg-[#601D49] text-[#FFEBB8] ring-1 ring-[#EA9D9D]/40"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span>Patient Governance & Access</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${activeTab === "PATIENTS" ? "bg-[#FFEBB8]/20 text-[#FFEBB8]" : "bg-slate-800 text-slate-400"}`}>
                  {accessGrants.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ROLES")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${
                  activeTab === "ROLES"
                    ? "bg-[#601D49] text-[#FFEBB8] ring-1 ring-[#EA9D9D]/40"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span>Role Matrix & Security</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${activeTab === "ROLES" ? "bg-[#FFEBB8]/20 text-[#FFEBB8]" : "bg-slate-800 text-slate-400"}`}>
                  {userRoles.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("AUDIT")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${
                  activeTab === "AUDIT"
                    ? "bg-[#601D49] text-[#FFEBB8] ring-1 ring-[#EA9D9D]/40"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span>Compliance Audit Trail</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${activeTab === "AUDIT" ? "bg-[#FFEBB8]/20 text-[#FFEBB8]" : "bg-slate-800 text-slate-400"}`}>
                  {auditEntries.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("VERSIONS")}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition ${
                  activeTab === "VERSIONS"
                    ? "bg-[#601D49] text-[#FFEBB8] ring-1 ring-[#EA9D9D]/40"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
                }`}
              >
                <span>Plan Versioning History</span>
                <span className={`rounded-full px-2 py-0.5 text-[0.65rem] ${activeTab === "VERSIONS" ? "bg-[#FFEBB8]/20 text-[#FFEBB8]" : "bg-slate-800 text-slate-400"}`}>
                  {versions.length}
                </span>
              </button>
            </div>

            {/* TAB 1: DOCTOR DIRECTORY & AUTHORIZATION */}
            {activeTab === "DOCTORS" && (
              <div className="space-y-6">
                {/* Authorize New Doctor Form */}
                <article className="rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-white">
                        Authorize Doctor Access
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Hospital Admins authorize licensed medical doctors to prescribe care plans and manage recovery pathways.
                      </p>
                    </div>
                    <span className="rounded-full border border-[#EA9D9D]/30 bg-[#601D49]/30 px-3 py-1 text-xs font-semibold text-[#FFEBB8]">
                      Step 1 in Product Hierarchy
                    </span>
                  </div>

                  <form onSubmit={handleAuthorizeDoctor} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        Auth User ID (UUID) *
                      </label>
                      <input
                        name="doctorUserId"
                        required
                        placeholder="e.g. 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#BD5579] focus:outline-none focus:ring-1 focus:ring-[#BD5579]"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Supabase Auth user identifier
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        Doctor Full Name
                      </label>
                      <input
                        name="doctorName"
                        placeholder="e.g. Dr. Jennifer Adams, MD"
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#BD5579] focus:outline-none focus:ring-1 focus:ring-[#BD5579]"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Medical Practitioner Name
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        Specialty & Department
                      </label>
                      <input
                        name="doctorSpecialty"
                        placeholder="e.g. Cardiology / Vascular Surgery"
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#BD5579] focus:outline-none focus:ring-1 focus:ring-[#BD5579]"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Clinical Department assignment
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        License / NPI Number
                      </label>
                      <input
                        name="doctorLicense"
                        placeholder="e.g. NPI-1940284910"
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#BD5579] focus:outline-none focus:ring-1 focus:ring-[#BD5579]"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Medical license verification
                      </p>
                    </div>

                    <div className="md:col-span-2 lg:col-span-4 flex items-center justify-between border-t border-slate-800/80 pt-4">
                      <p className="text-xs text-slate-400">
                        Authorizing will assign the <code className="rounded bg-slate-800 px-1 py-0.5 text-[#FFEBB8]">CLINICIAN</code> role in <code className="text-slate-300">smartcare_user_roles</code>.
                      </p>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-[#BD5579] to-[#9e3e5f] px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-[#BD5579]/25 transition hover:from-[#d67a99] hover:to-[#BD5579] disabled:opacity-50"
                      >
                        {saving ? "Authorizing..." : "Authorize as Clinician"}
                      </button>
                    </div>
                  </form>
                </article>

                {/* Doctor Directory List */}
                <article className="rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-white">
                        Authorized Doctor Directory
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Doctors authorized by MetroHealth Administration to prescribe and monitor care plans.
                      </p>
                    </div>

                    {/* Directory Search & Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        type="text"
                        value={doctorSearch}
                        onChange={(e) => setDoctorSearch(e.target.value)}
                        placeholder="Search doctor, specialty, UUID..."
                        className="rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#BD5579] focus:outline-none"
                      />
                      <select
                        value={doctorStatusFilter}
                        onChange={(e) => setDoctorStatusFilter(e.target.value)}
                        className="rounded-xl border border-slate-700/80 bg-[#140712] px-3 py-2 text-xs text-slate-200 focus:border-[#BD5579] focus:outline-none"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="AUTHORIZED">Authorized / Active</option>
                        <option value="PENDING_APPROVAL">Pending Approval</option>
                        <option value="SUSPENDED">Suspended</option>
                        <option value="REVOKED">Revoked</option>
                      </select>
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          <th className="pb-3 pl-2">Doctor Details</th>
                          <th className="pb-3">Department & Specialty</th>
                          <th className="pb-3">License / NPI</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3">Patients</th>
                          <th className="pb-3">Authorized Date</th>
                          <th className="pb-3 pr-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {filteredDoctors.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                              No doctor records found matching current criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredDoctors.map((doc) => (
                            <tr key={doc.user_id} className="transition hover:bg-slate-800/30">
                              <td className="py-4 pl-2">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#601D49]/40 to-[#BD5579]/30 font-bold text-[#FFEBB8] ring-1 ring-[#EA9D9D]/30">
                                    {doc.name.replace("Dr. ", "").slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-slate-100">{doc.name}</p>
                                    <p className="truncate font-mono text-[10px] text-slate-500" title={doc.user_id}>
                                      {doc.user_id}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4">
                                <p className="text-slate-200">{doc.specialty}</p>
                                <p className="text-[11px] text-slate-400">{doc.department}</p>
                              </td>
                              <td className="py-4 font-mono text-slate-300">
                                {doc.license_number}
                              </td>
                              <td className="py-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase ${
                                    doc.status === "AUTHORIZED"
                                      ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                      : doc.status === "PENDING_APPROVAL"
                                      ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                                      : doc.status === "SUSPENDED"
                                      ? "border border-orange-500/30 bg-orange-500/10 text-orange-400"
                                      : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                                  }`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      doc.status === "AUTHORIZED"
                                        ? "bg-emerald-400"
                                        : doc.status === "PENDING_APPROVAL"
                                        ? "bg-amber-400"
                                        : doc.status === "SUSPENDED"
                                        ? "bg-orange-400"
                                        : "bg-rose-400"
                                    }`}
                                  />
                                  {doc.status.replaceAll("_", " ")}
                                </span>
                              </td>
                              <td className="py-4">
                                <span className="rounded-md bg-slate-800 px-2 py-1 font-semibold text-slate-200">
                                  {doc.assigned_patients_count}
                                </span>
                              </td>
                              <td className="py-4 text-slate-400">
                                {new Date(doc.authorized_at).toLocaleDateString()}
                              </td>
                              <td className="py-4 pr-2 text-right">
                                <div className="inline-flex items-center gap-1.5">
                                  {doc.status !== "AUTHORIZED" && (
                                    <button
                                      type="button"
                                      onClick={() => void handleUpdateDoctorStatus(doc, "AUTHORIZED")}
                                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition hover:bg-emerald-500/20"
                                    >
                                      Activate
                                    </button>
                                  )}
                                  {doc.status === "AUTHORIZED" && (
                                    <button
                                      type="button"
                                      onClick={() => void handleUpdateDoctorStatus(doc, "SUSPENDED")}
                                      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition hover:bg-amber-500/20"
                                    >
                                      Suspend
                                    </button>
                                  )}
                                  {doc.status !== "REVOKED" && (
                                    <button
                                      type="button"
                                      onClick={() => void handleUpdateDoctorStatus(doc, "REVOKED")}
                                      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/20"
                                    >
                                      Revoke
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </article>
              </div>
            )}

            {/* TAB 2: PATIENT GOVERNANCE & ACCESS GRANTS */}
            {activeTab === "PATIENTS" && (
              <div className="grid gap-6 xl:grid-cols-2">
                {/* Grant Patient Access Form */}
                <article className="rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-bold tracking-tight text-white">
                        Grant Patient Access
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        Administers patient record access grants. Enforced by Row-Level Security on Supabase.
                      </p>
                    </div>
                    <span className="rounded-full border border-[#EA9D9D]/30 bg-[#601D49]/30 px-3 py-1 text-xs font-semibold text-[#FFEBB8]">
                      Step 2 in Product Hierarchy
                    </span>
                  </div>

                  <form onSubmit={grantPatientAccess} className="mt-6 space-y-4">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        Patient *
                      </label>
                      <select
                        name="patientId"
                        required
                        defaultValue=""
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 text-xs text-slate-100 focus:border-[#BD5579] focus:outline-none"
                      >
                        <option value="" disabled>Select patient record</option>
                        {patients.map((patient) => (
                          <option key={patient.id} value={patient.id}>
                            {patient.full_name} ({patient.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        User Account (UUID) *
                      </label>
                      <input
                        name="accessUserId"
                        required
                        placeholder="UUID of authorized doctor or patient account"
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#BD5579] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        Access Role *
                      </label>
                      <select
                        name="accessRole"
                        required
                        defaultValue="CLINICIAN"
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 text-xs text-slate-100 focus:border-[#BD5579] focus:outline-none"
                      >
                        <option value="CLINICIAN">CLINICIAN (Prescribing Doctor)</option>
                        <option value="PATIENT">PATIENT (Record Owner)</option>
                        <option value="CAREGIVER">CAREGIVER (Secondary Support)</option>
                      </select>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <p className="text-xs text-slate-500">
                        Grants are tracked in <code className="text-slate-400">smartcare_patient_access</code>.
                      </p>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex min-h-10 items-center rounded-xl bg-gradient-to-r from-[#BD5579] to-[#9e3e5f] px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-[#BD5579]/25 transition hover:from-[#d67a99] hover:to-[#BD5579]"
                      >
                        {saving ? "Saving..." : "Save Patient Access"}
                      </button>
                    </div>
                  </form>
                </article>

                {/* Active Patient Access Grants List */}
                <article className="rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    Active Access Grants
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Existing authorization grants between patients and doctors/caregivers.
                  </p>

                  <div className="mt-5 max-h-[460px] overflow-y-auto pr-1">
                    <ul className="divide-y divide-slate-800/60">
                      {accessGrants.length === 0 ? (
                        <li className="py-6 text-center text-sm text-slate-500">
                          No patient access grants recorded.
                        </li>
                      ) : (
                        accessGrants.map((grant) => (
                          <li
                            key={`${grant.patient_id}-${grant.user_id}-${grant.access_role}`}
                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-slate-200">
                                  {patientName(grant.patient_id)}
                                </p>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                    grant.access_role === "CLINICIAN"
                                      ? "bg-[#601D49]/40 text-[#FFEBB8] border border-[#EA9D9D]/30"
                                      : grant.access_role === "PATIENT"
                                      ? "bg-[#BD5579]/20 text-[#EA9D9D] border border-[#BD5579]/30"
                                      : "bg-slate-700 text-slate-300"
                                  }`}
                                >
                                  {grant.access_role}
                                </span>
                              </div>
                              <p className="mt-1 truncate font-mono text-[11px] text-slate-400">
                                User: {grant.user_id}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                Granted: {new Date(grant.granted_at).toLocaleDateString()}
                              </p>
                            </div>
                            <div>
                              {grant.active ? (
                                <button
                                  type="button"
                                  onClick={() => void revokeAccess(grant)}
                                  className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
                                >
                                  Revoke
                                </button>
                              ) : (
                                <span className="text-xs text-slate-500">Revoked</span>
                              )}
                            </div>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </article>
              </div>
            )}

            {/* TAB 3: ROLE MATRIX & SECURITY */}
            {activeTab === "ROLES" && (
              <div className="grid gap-6 xl:grid-cols-2">
                {/* Role Assignment Form */}
                <article className="rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    Assign SmartCare Role
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Assigns application roles strictly in <code className="text-slate-300">smartcare_user_roles</code>. Managed solely by Hospital Administrators.
                  </p>

                  <form onSubmit={assignRole} className="mt-6 space-y-4">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        Supabase User ID (UUID) *
                      </label>
                      <input
                        name="roleUserId"
                        required
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-[#BD5579] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-slate-300">
                        System Role *
                      </label>
                      <select
                        name="role"
                        required
                        defaultValue="CLINICIAN"
                        className="mt-1.5 w-full rounded-xl border border-slate-700/80 bg-[#140712] px-3.5 py-2.5 text-xs text-slate-100 focus:border-[#BD5579] focus:outline-none"
                      >
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {r} {r === "CLINICIAN" ? "(Doctor)" : r === "ADMIN" ? "(Hospital Admin)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-xl border border-[#601D49]/30 bg-[#140712] p-3 text-xs text-slate-400">
                      <p className="font-semibold text-slate-300">Security Rule</p>
                      <p className="mt-1">
                        Self-role escalation is blocked server-side by Row-Level Security. Non-administrators cannot read or edit another user&apos;s role.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={saving}
                      className="inline-flex min-h-10 items-center rounded-xl bg-gradient-to-r from-[#BD5579] to-[#9e3e5f] px-5 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-[#BD5579]/25 transition hover:from-[#d67a99] hover:to-[#BD5579]"
                    >
                      {saving ? "Saving..." : "Save Role Assignment"}
                    </button>
                  </form>
                </article>

                {/* Role Allocation Matrix & Permissions Overview */}
                <article className="rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md">
                  <h2 className="text-xl font-bold tracking-tight text-white">
                    Role & Permissions Hierarchy
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Product permissions model enforced across SmartCare tables and endpoints.
                  </p>

                  <div className="mt-5 space-y-3">
                    <div className="rounded-xl border border-[#EA9D9D]/30 bg-[#601D49]/20 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#FFEBB8]">HOSPITAL ADMIN</span>
                        <span className="text-xs text-slate-400">Tier 1 Authority</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-300">
                        Authorizes doctors, assigns system roles, governs patient-level access grants, reviews immutable audit logs, and monitors compliance metrics.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#BD5579]/30 bg-[#BD5579]/10 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#EA9D9D]">DOCTOR (CLINICIAN)</span>
                        <span className="text-xs text-slate-400">Tier 2 Authority</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-300">
                        Creates and structures care plans, schedules time-windowed tasks, sets completion criteria, reviews evidence, resolves escalations, and grants assigned patients access.
                      </p>
                    </div>

                    <div className="rounded-xl border border-[#EA9D9D]/20 bg-[#601D49]/10 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#FFEBB8]">PATIENT</span>
                        <span className="text-xs text-slate-400">Tier 3 Authority</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-300">
                        Strictly bounded to their own authorized care plans. Views daily recovery guidance, submits completion reports, and uploads diagnostic verification evidence.
                      </p>
                    </div>

                    <div className="rounded-xl border border-slate-700/50 bg-[#220f1e]/40 p-4">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-300">CAREGIVER</span>
                        <span className="text-xs text-slate-400">Coordinated Support</span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-300">
                        Assists authorized family members or dependents with medication reminders, task confirmation, and secondary safety alerts without clinical prescribing rights.
                      </p>
                    </div>
                  </div>
                </article>
              </div>
            )}

            {/* TAB 4: COMPLIANCE AUDIT TRAIL */}
            {activeTab === "AUDIT" && (
              <article className="rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-white">
                      Immutable Audit Activity
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                      Automated audit log recorded by database triggers ({filteredAudits.length} audit entries, {notifications.length} dispatch logs).
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Filter action:</span>
                    <select
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                      className="rounded-xl border border-slate-700/80 bg-[#140712] px-3 py-1.5 text-xs text-slate-200 focus:border-[#BD5579] focus:outline-none"
                    >
                      <option value="ALL">All Actions</option>
                      <option value="DOCTOR">Doctor Authorizations</option>
                      <option value="ROLE">Role Assignments</option>
                      <option value="ACCESS">Patient Access Grants</option>
                      <option value="CARE_PLAN">Care Plan Changes</option>
                      <option value="ESCALATION">Escalations</option>
                    </select>
                  </div>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        <th className="pb-3 pl-2">Action</th>
                        <th className="pb-3">Object Type</th>
                        <th className="pb-3">Target Object ID</th>
                        <th className="pb-3">Actor ID</th>
                        <th className="pb-3 pr-2 text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {filteredAudits.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                            No audit activity entries available.
                          </td>
                        </tr>
                      ) : (
                        filteredAudits.map((entry) => (
                          <tr key={entry.id} className="transition hover:bg-slate-800/30">
                            <td className="py-3.5 pl-2 font-semibold text-emerald-300">
                              {entry.action}
                            </td>
                            <td className="py-3.5 text-slate-300">
                              {entry.object_type}
                            </td>
                            <td className="py-3.5 font-mono text-[11px] text-slate-400">
                              {entry.object_id || "—"}
                            </td>
                            <td className="py-3.5 font-mono text-[11px] text-slate-400">
                              {entry.actor_id || "System Trigger"}
                            </td>
                            <td className="py-3.5 pr-2 text-right font-mono text-slate-400">
                              {new Date(entry.occurred_at).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            )}

            {/* TAB 5: PLAN VERSIONING HISTORY */}
            {activeTab === "VERSIONS" && (
              <article className="rounded-2xl border border-white/10 bg-[#180a15]/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md">
                <h2 className="text-xl font-bold tracking-tight text-white">
                  Care Plan Versioning History
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Version snapshots captured automatically when care plans are created or updated.
                </p>

                <div className="mt-6 space-y-4">
                  {versions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-500">
                      No plan version snapshots available.
                    </p>
                  ) : (
                    versions.map((ver) => (
                      <div
                        key={ver.id}
                        className="rounded-xl border border-white/10 bg-[#140712]/80 p-4 transition hover:border-[#BD5579]/40"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-bold text-amber-300">
                              v{ver.version}
                            </span>
                            <span className="font-semibold text-slate-200">
                              {carePlanName(ver.care_plan_id)}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-slate-500">
                            {new Date(ver.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-300">
                          {ver.reason || "Care-plan record updated"}
                        </p>
                        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
                          <span>Author: {ver.author_id || "Doctor / Clinician"}</span>
                          <Link
                            href={`/care-plans/${ver.care_plan_id}`}
                            className="font-medium text-[#BD5579] hover:underline"
                          >
                            Inspect Care Plan →
                          </Link>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  badge,
  badgeColor,
  icon,
}: {
  label: string;
  value: number;
  detail: string;
  badge: string;
  badgeColor: "blue" | "indigo" | "violet" | "emerald" | "amber";
  icon: React.ReactNode;
}) {
  const badgeColors = {
    blue: "border-[#EA9D9D]/40 bg-[#601D49]/30 text-[#FFEBB8]",
    indigo: "border-[#BD5579]/40 bg-[#BD5579]/15 text-[#EA9D9D]",
    violet: "border-[#BD5579]/40 bg-[#601D49]/20 text-[#FFEBB8]",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  };

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#180a15]/80 p-5 shadow-lg shadow-black/20 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:border-[#BD5579]/40 hover:shadow-xl">
      <div className="flex items-center justify-between">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeColors[badgeColor]}`}>
          {badge}
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-800/60 ring-1 ring-slate-700/50">
          {icon}
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{detail}</p>
    </article>
  );
}
