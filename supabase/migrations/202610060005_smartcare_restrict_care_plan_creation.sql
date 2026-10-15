-- SmartCare Migration 202610060005: Restrict Care-Plan Creation with RLS
-- Security Fix 002: Enforce that only authorized CLINICIAN and ADMIN roles can insert records into care_plans.
-- PATIENT users are explicitly excluded from care-plan creation (clinician-prescribed model).

-- Drop existing permissive insert policy that previously allowed PATIENT role
drop policy if exists smartcare_care_plans_create on public.care_plans;

-- Recreate policy permitting inserts only for authorized CLINICIAN and ADMIN accounts
-- who have active status and valid access to the target patient record
create policy smartcare_care_plans_create
  on public.care_plans
  for insert to authenticated
  with check (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_patient(patient_id)
  );
