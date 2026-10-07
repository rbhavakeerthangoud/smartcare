export type ApplicationRole =
  | "PATIENT"
  | "CAREGIVER"
  | "CLINICIAN"
  | "ADMIN";

export function dashboardPathForRole(role: ApplicationRole) {
  switch (role) {
    case "PATIENT":
      return "/";
    case "CAREGIVER":
      return "/caregiver";
    case "CLINICIAN":
      return "/clinical";
    case "ADMIN":
      return "/admin";
  }
}

export function canAccessRolePath(role: ApplicationRole, pathname: string) {
  if (pathname.startsWith("/admin")) return role === "ADMIN";
  if (pathname.startsWith("/caregiver")) {
    return role === "CAREGIVER" || role === "ADMIN";
  }
  if (pathname.startsWith("/clinical")) {
    return role === "CLINICIAN" || role === "ADMIN";
  }
  if (pathname.startsWith("/research")) {
    return role === "CLINICIAN" || role === "ADMIN";
  }
  if (pathname.startsWith("/care-plans/new") || pathname.startsWith("/tasks/new")) {
    return role === "CLINICIAN" || role === "ADMIN";
  }
  return true;
}
