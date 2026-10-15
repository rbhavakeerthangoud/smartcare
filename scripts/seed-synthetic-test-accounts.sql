-- ==============================================================================
-- SMARTCARE SYNTHETIC TEST ACCOUNTS SEED SCRIPT
-- For Staging & Development Verification Only
-- DO NOT RUN DIRECTLY IN PRODUCTION
-- ==============================================================================
-- This script provisions the 6 synthetic test accounts representing the
-- role hierarchy, isolation boundaries, and cross-patient controls.
--
-- Accounts Prepared:
-- 1. smartcare.admin@example.com      (ADMIN role)
-- 2. smartcare.clinician@example.com  (CLINICIAN role - Treating Doctor 1)
-- 3. smartcare.doctor2@example.com    (CLINICIAN role - Unrelated Doctor 2)
-- 4. smartcare.patient@example.com    (PATIENT role - Patient Alpha)
-- 5. smartcare.patient2@example.com   (PATIENT role - Patient Beta / Cross-Tenant Check)
-- 6. smartcare.caregiver@example.com  (CAREGIVER role - Assigned to Patient Alpha)
-- ==============================================================================

-- 1. Setup Synthetic Patient Records
insert into public.patients (id, name, created_at)
values
  ('11111111-0000-0000-0000-000000000001', 'Alex Mercer (Synthetic Patient Alpha)', now()),
  ('22222222-0000-0000-0000-000000000002', 'Jordan Hayes (Synthetic Patient Beta)', now())
on conflict (id) do update set name = excluded.name;

-- 2. Setup Synthetic Care Plans for Scoping Verification
insert into public.care_plans (id, patient_id, name, description, start_date, end_date, created_at)
values
  (
    'aaaaaaaa-1111-1111-1111-111111111111',
    '11111111-0000-0000-0000-000000000001',
    'Alpha Post-Discharge Cardiac Recovery',
    'Clinician-approved recovery protocol for Patient Alpha.',
    current_date,
    current_date + interval '30 days',
    now()
  ),
  (
    'bbbbbbbb-2222-2222-2222-222222222222',
    '22222222-0000-0000-0000-000000000002',
    'Beta Orthopedic Rehabilitation Plan',
    'Clinician-approved protocol for Patient Beta (Isolated from Doctor 1 & Patient Alpha).',
    current_date,
    current_date + interval '30 days',
    now()
  )
on conflict (id) do update set name = excluded.name;

-- 3. Provision User Roles and Status for Synthetic Accounts
-- Note: Replace '<AUTH_USER_UUID>' with the corresponding auth.users id after auth user creation.
-- Example role mapping pattern:
-- insert into public.smartcare_user_roles (user_id, role, status, created_at)
-- values
--   ('ADMIN_USER_UUID',     'ADMIN',     'ACTIVE', now()),
--   ('CLINICIAN1_USER_UUID', 'CLINICIAN', 'ACTIVE', now()),
--   ('CLINICIAN2_USER_UUID', 'CLINICIAN', 'ACTIVE', now()),
--   ('PATIENT1_USER_UUID',   'PATIENT',   'ACTIVE', now()),
--   ('PATIENT2_USER_UUID',   'PATIENT',   'ACTIVE', now()),
--   ('CAREGIVER1_USER_UUID', 'CAREGIVER', 'ACTIVE', now())
-- on conflict (user_id, role) do update set status = excluded.status;

-- 4. Clinical & Patient Access Grants (Treating Scope Mapping)
-- Doctor 1 (Clinician 1) treats Patient Alpha only:
-- insert into public.smartcare_patient_access (patient_id, user_id, access_role, active, granted_at)
-- values
--   ('11111111-0000-0000-0000-000000000001', 'CLINICIAN1_USER_UUID', 'CLINICIAN', true, now()),
--   ('11111111-0000-0000-0000-000000000001', 'PATIENT1_USER_UUID',   'PATIENT',   true, now()),
--   ('11111111-0000-0000-0000-000000000001', 'CAREGIVER1_USER_UUID', 'CAREGIVER', true, now()),
--   ('22222222-0000-0000-0000-000000000002', 'CLINICIAN2_USER_UUID', 'CLINICIAN', true, now()),
--   ('22222222-0000-0000-0000-000000000002', 'PATIENT2_USER_UUID',   'PATIENT',   true, now())
-- on conflict (patient_id, user_id, access_role) do update set active = excluded.active;
