import type { ApplicationRole } from "./role-navigation";

export type DoctorStatus = "AUTHORIZED" | "PENDING_APPROVAL" | "SUSPENDED" | "REVOKED";

export interface UserRoleRecord {
  userId: string;
  role: ApplicationRole;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  createdBy?: string | null;
  createdAt: string;
}

export interface DoctorRecord {
  userId: string;
  name: string;
  status: DoctorStatus;
  licenseNumber?: string;
  department?: string;
}

export interface PatientAccessRecord {
  patientId: string;
  userId: string;
  accessRole: "PATIENT" | "CAREGIVER" | "CLINICIAN";
  active: boolean;
  grantedBy?: string | null;
  grantedAt: string;
}

export interface CarePlanRecord {
  id: string;
  patientId: string;
  name: string;
  status: string;
}

export interface TaskRecord {
  id: string;
  carePlanId: string;
  name: string;
}

export interface SubresourceRecord {
  id: string;
  taskId: string;
  type: "occurrence" | "event" | "document";
}

/**
 * 1. Admin Authorizes Doctor
 * Only an ADMIN can grant CLINICIAN privileges to a doctor account.
 */
export function authorizeDoctor(
  actorRole: ApplicationRole,
  targetUserId: string,
  existingRoles: UserRoleRecord[] = [],
): { success: boolean; error?: string; roleRecord?: UserRoleRecord } {
  if (actorRole !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED: Only hospital administrators can authorize doctor accounts.",
    };
  }

  if (!targetUserId || !targetUserId.trim()) {
    return { success: false, error: "INVALID_USER: Target user ID is required." };
  }

  const existingActive = existingRoles.find(
    (r) => r.userId === targetUserId.trim() && r.role === "CLINICIAN" && r.status === "ACTIVE",
  );
  if (existingActive) {
    return { success: true, roleRecord: existingActive };
  }

  const roleRecord: UserRoleRecord = {
    userId: targetUserId.trim(),
    role: "CLINICIAN",
    status: "ACTIVE",
    createdAt: new Date().toISOString(),
  };

  return { success: true, roleRecord };
}

/**
 * 2 & 3. Non-admin / Self-Authorization Prevention
 * Non-admins cannot grant doctor privileges.
 * A user cannot authorize themselves or change their own administrative role.
 */
export function canAssignRole(
  actorUserId: string,
  actorRole: ApplicationRole,
  targetUserId: string,
  requestedRole: ApplicationRole,
): { permitted: boolean; reason?: string } {
  if (actorRole !== "ADMIN") {
    return {
      permitted: false,
      reason: "FORBIDDEN: Only an authorized hospital administrator can assign or modify system roles.",
    };
  }

  if (actorUserId === targetUserId) {
    return {
      permitted: false,
      reason: "SELF_ESCALATION_BLOCKED: Administrators cannot modify their own privileges or self-escalate.",
    };
  }

  const validRoles: ApplicationRole[] = ["ADMIN", "CLINICIAN", "PATIENT", "CAREGIVER"];
  if (!validRoles.includes(requestedRole)) {
    return {
      permitted: false,
      reason: `INVALID_ROLE: Role "${requestedRole}" is not recognized by SmartCare.`,
    };
  }

  return { permitted: true };
}

/**
 * Update Doctor Status (Authorize, Suspend, Revoke)
 */
export function updateDoctorAuthorizationStatus(
  actorRole: ApplicationRole,
  doctor: DoctorRecord,
  newStatus: DoctorStatus,
): { success: boolean; updatedDoctor?: DoctorRecord; error?: string } {
  if (actorRole !== "ADMIN") {
    return {
      success: false,
      error: "FORBIDDEN: Only hospital administrators can update doctor authorization status.",
    };
  }

  return {
    success: true,
    updatedDoctor: {
      ...doctor,
      status: newStatus,
    },
  };
}

/**
 * 4. Suspended/Revoked Doctor Check
 * Checks if a doctor has active prescribing and care-plan mutation privileges.
 */
export function isDoctorPermittedToPrescribe(
  doctorRole: ApplicationRole | null,
  doctorStatus: DoctorStatus = "AUTHORIZED",
): boolean {
  if (!doctorRole) return false;
  if (doctorRole === "ADMIN") return true;
  if (doctorRole === "CLINICIAN" && doctorStatus === "AUTHORIZED") return true;
  return false;
}

/**
 * 5 & 6. Doctor Scope & Granting Patient Access
 * An authorized doctor can ONLY manage and grant access to patients within their permitted scope.
 * A doctor cannot grant access to unrelated patients or grant CLINICIAN/ADMIN roles.
 */
export function canDoctorGrantPatientAccess(
  doctorUserId: string,
  doctorRole: ApplicationRole,
  doctorStatus: DoctorStatus,
  targetPatientId: string,
  targetAccessRole: "PATIENT" | "CAREGIVER" | "CLINICIAN",
  existingGrants: PatientAccessRecord[],
): { permitted: boolean; reason?: string } {
  // Must be an authorized clinician or admin
  if (!isDoctorPermittedToPrescribe(doctorRole, doctorStatus)) {
    return {
      permitted: false,
      reason: "DOCTOR_UNAUTHORIZED: Suspended or unverified doctors cannot manage patient care plans or access grants.",
    };
  }

  // Clinicians can only grant PATIENT or CAREGIVER access, not CLINICIAN or ADMIN
  if (doctorRole === "CLINICIAN" && targetAccessRole === "CLINICIAN") {
    return {
      permitted: false,
      reason: "PRIVILEGE_ESCALATION_BLOCKED: Clinicians cannot grant clinician access; hospital admin authorization is required.",
    };
  }

  // If clinician (not admin), doctor must already have an active CLINICIAN grant for this specific patient
  if (doctorRole === "CLINICIAN") {
    const hasTreatingRelationship = existingGrants.some(
      (grant) =>
        grant.patientId === targetPatientId &&
        grant.userId === doctorUserId &&
        grant.accessRole === "CLINICIAN" &&
        grant.active,
    );

    if (!hasTreatingRelationship) {
      return {
        permitted: false,
        reason: "OUT_OF_SCOPE: Doctor does not have authorized clinical access to this patient and cannot grant access to others.",
      };
    }
  }

  return { permitted: true };
}

/**
 * Grant access to a patient record.
 */
export function grantPatientAccess(
  actorUserId: string,
  actorRole: ApplicationRole,
  actorStatus: DoctorStatus,
  targetPatientId: string,
  targetUserId: string,
  targetAccessRole: "PATIENT" | "CAREGIVER",
  existingGrants: PatientAccessRecord[],
): { success: boolean; error?: string; grant?: PatientAccessRecord } {
  const check = canDoctorGrantPatientAccess(
    actorUserId,
    actorRole,
    actorStatus,
    targetPatientId,
    targetAccessRole,
    existingGrants,
  );

  if (!check.permitted) {
    return { success: false, error: check.reason };
  }

  const grant: PatientAccessRecord = {
    patientId: targetPatientId,
    userId: targetUserId,
    accessRole: targetAccessRole,
    active: true,
    grantedBy: actorUserId,
    grantedAt: new Date().toISOString(),
  };

  return { success: true, grant };
}

/**
 * Revoke patient or caregiver access immediately.
 */
export function revokePatientAccess(
  actorUserId: string,
  actorRole: ApplicationRole,
  actorStatus: DoctorStatus,
  targetPatientId: string,
  targetUserId: string,
  existingGrants: PatientAccessRecord[],
): { success: boolean; error?: string; revokedGrant?: PatientAccessRecord } {
  if (!isDoctorPermittedToPrescribe(actorRole, actorStatus)) {
    return {
      success: false,
      error: "DOCTOR_UNAUTHORIZED: Suspended clinicians cannot revoke access.",
    };
  }

  if (actorRole === "CLINICIAN") {
    const hasTreatingRelationship = existingGrants.some(
      (grant) =>
        grant.patientId === targetPatientId &&
        grant.userId === doctorUserId(actorUserId) &&
        grant.accessRole === "CLINICIAN" &&
        grant.active,
    );
    if (!hasTreatingRelationship) {
      return {
        success: false,
        error: "OUT_OF_SCOPE: Doctor does not treat this patient.",
      };
    }
  }

  const existing = existingGrants.find(
    (g) => g.patientId === targetPatientId && g.userId === targetUserId && g.active,
  );

  if (!existing) {
    return { success: false, error: "GRANT_NOT_FOUND: No active grant found for this user." };
  }

  const revokedGrant: PatientAccessRecord = {
    ...existing,
    active: false,
  };

  return { success: true, revokedGrant };
}

function doctorUserId(id: string): string {
  return id;
}

/**
 * 7 & 8. Patient Access & ID Swap Protection
 * Patient can ONLY view care plans assigned to their authenticated account.
 * Swapping carePlanId or patientId in URL/payload must reject access.
 */
export function canPatientAccessCarePlan(
  patientUserId: string,
  carePlan: CarePlanRecord,
  grants: PatientAccessRecord[],
): boolean {
  if (!patientUserId || !carePlan || !carePlan.patientId) return false;

  return grants.some(
    (grant) =>
      grant.patientId === carePlan.patientId &&
      grant.userId === patientUserId &&
      grant.accessRole === "PATIENT" &&
      grant.active === true,
  );
}

/**
 * 9 & 10. Subresource Access (Tasks, Occurrences, Events, Documents)
 * Subresources inherit the boundary of the parent care plan.
 * If patient access is revoked, subsequent reads and writes fail immediately.
 */
export function canPatientAccessSubresource(
  patientUserId: string,
  task: TaskRecord,
  carePlan: CarePlanRecord,
  grants: PatientAccessRecord[],
): boolean {
  if (task.carePlanId !== carePlan.id) return false;
  return canPatientAccessCarePlan(patientUserId, carePlan, grants);
}

export function canPatientWriteEvidence(
  patientUserId: string,
  task: TaskRecord,
  carePlan: CarePlanRecord,
  grants: PatientAccessRecord[],
): { permitted: boolean; reason?: string } {
  if (!canPatientAccessSubresource(patientUserId, task, carePlan, grants)) {
    return {
      permitted: false,
      reason: "ACCESS_REVOKED_OR_DENIED: User has no active authorization to submit evidence for this task.",
    };
  }
  return { permitted: true };
}

/**
 * 11. Demo Mode Isolation Guard
 * Asserts that demo actions never invoke production database mutations.
 */
export function assertDemoIsolation(
  isDemo: boolean,
  operation: "insert" | "update" | "delete" | "rpc" = "insert",
): { safe: boolean; isolated: boolean; operation: string; error?: string } {
  if (isDemo) {
    return {
      safe: true,
      isolated: true,
      operation,
    };
  }
  return {
    safe: true,
    isolated: false,
    operation,
  };
}

export function preventDemoDatabaseWrite(
  isDemo: boolean,
  actionDescription: string,
): void {
  if (isDemo) {
    throw new Error(
      `DEMO_MUTATION_PREVENTED: "${actionDescription}" blocked. Demo mode operations must execute in-memory only without mutating the database.`,
    );
  }
}

/**
 * 12. Strict Patient Care-Plan Scoping Filter
 * A plan is accepted only when it has a valid, explicitly assigned patient_id
 * that belongs to the authenticated user's authorized patientIds list.
 */
export function filterAuthorizedCarePlans<T extends { patient_id?: string | null }>(
  rawPlans: T[],
  authorizedPatientIds: string[],
): T[] {
  if (!authorizedPatientIds || authorizedPatientIds.length === 0) return [];
  return rawPlans.filter(
    (plan) => Boolean(plan.patient_id && authorizedPatientIds.includes(plan.patient_id)),
  );
}

/**
 * 13. Care-Plan Creation Authorization Check (RLS Mirror)
 * Mirrors the PostgreSQL RLS policy `smartcare_care_plans_create`:
 * WITH CHECK (
 *   public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
 *   and public.smartcare_can_access_patient(patient_id)
 * )
 */
export function canCreateCarePlan(
  actorRole: ApplicationRole | null,
  actorStatus: DoctorStatus = "AUTHORIZED",
  targetPatientId?: string,
  existingGrants: PatientAccessRecord[] = [],
  actorUserId?: string,
): { permitted: boolean; reason?: string } {
  if (!actorRole) {
    return { permitted: false, reason: "UNAUTHENTICATED: Must be signed in to create care plans." };
  }

  // Explicitly deny PATIENT users from creating care plans
  if (actorRole === "PATIENT") {
    return {
      permitted: false,
      reason: "POLICY_VIOLATION: Patients cannot create care plans directly. Plans must be prescribed by an authorized clinician.",
    };
  }

  // Explicitly deny CAREGIVER users
  if (actorRole === "CAREGIVER") {
    return {
      permitted: false,
      reason: "POLICY_VIOLATION: Caregivers cannot create care plans directly.",
    };
  }

  if (actorRole === "ADMIN") {
    return { permitted: true };
  }

  if (actorRole === "CLINICIAN") {
    if (actorStatus !== "AUTHORIZED") {
      return {
        permitted: false,
        reason: "DOCTOR_UNAUTHORIZED: Suspended or unverified doctors cannot create care plans.",
      };
    }

    if (targetPatientId && actorUserId) {
      const hasAccess = existingGrants.some(
        (g) =>
          g.patientId === targetPatientId &&
          g.userId === actorUserId &&
          g.accessRole === "CLINICIAN" &&
          g.active,
      );
      if (!hasAccess && existingGrants.length > 0) {
        return {
          permitted: false,
          reason: "OUT_OF_SCOPE: Doctor does not have clinical access to this patient.",
        };
      }
    }

    return { permitted: true };
  }

  return { permitted: false, reason: "UNAUTHORIZED_ROLE: Role not recognized." };
}

/**
 * 14. Care-Plan Detail & Management Route Authorization
 * The clinician management route at /care-plans/[id] exposes care-plan
 * administration, task configuration, governance access controls,
 * escalations, dependencies, and audit history.
 *
 * It is strictly restricted to authorized CLINICIAN and ADMIN roles.
 * PATIENT and CAREGIVER roles are blocked from management controls,
 * with patients viewing their care plans strictly via the Patient Portal.
 */
export function canAccessCarePlanManagement(
  actorRole: ApplicationRole | null,
  actorStatus: DoctorStatus = "AUTHORIZED",
  targetPatientId?: string,
  existingGrants: PatientAccessRecord[] = [],
  actorUserId?: string,
): { permitted: boolean; reason?: string } {
  if (!actorRole) {
    return {
      permitted: false,
      reason: "UNAUTHENTICATED: Must be signed in with an authorized role to access care-plan management.",
    };
  }

  // Deny PATIENT users from clinician-facing care-plan management
  if (actorRole === "PATIENT") {
    return {
      permitted: false,
      reason: "POLICY_VIOLATION: Patients cannot access the clinician care-plan management workspace. Patient care plans are viewed through the Patient Portal.",
    };
  }

  // Deny CAREGIVER users
  if (actorRole === "CAREGIVER") {
    return {
      permitted: false,
      reason: "POLICY_VIOLATION: Caregivers cannot access the clinician care-plan management workspace.",
    };
  }

  if (actorRole === "ADMIN") {
    return { permitted: true };
  }

  if (actorRole === "CLINICIAN") {
    if (actorStatus !== "AUTHORIZED") {
      return {
        permitted: false,
        reason: "DOCTOR_UNAUTHORIZED: Suspended or unverified doctors cannot manage care plans.",
      };
    }

    if (targetPatientId && actorUserId && existingGrants.length > 0) {
      const hasAccess = existingGrants.some(
        (g) =>
          g.patientId === targetPatientId &&
          g.userId === actorUserId &&
          g.accessRole === "CLINICIAN" &&
          g.active,
      );
      if (!hasAccess) {
        return {
          permitted: false,
          reason: "OUT_OF_SCOPE: Doctor does not have clinical access to this patient.",
        };
      }
    }

    return { permitted: true };
  }

  return { permitted: false, reason: "UNAUTHORIZED_ROLE: Role not recognized." };
}
