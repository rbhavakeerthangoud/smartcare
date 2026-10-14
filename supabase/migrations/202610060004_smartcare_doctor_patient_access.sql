-- SmartCare Migration: Doctor -> Patient Access Governance & Doctor Status Lifecycle
-- 1. Adds doctor lifecycle status tracking to user roles (ACTIVE, SUSPENDED, REVOKED)
-- 2. Enforces active status check in smartcare_user_has_role()
-- 3. Enables authorized clinicians to securely grant & revoke PATIENT and CAREGIVER access for patients in their scope
-- 4. Prevents clinician privilege escalation (clinicians cannot grant CLINICIAN or ADMIN roles)

-- 1. Doctor status column on user roles
alter table public.smartcare_user_roles
  add column if not exists status text not null default 'ACTIVE'
  check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED'));

-- 2. Role check enforcing active doctor status
create or replace function public.smartcare_user_has_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.smartcare_user_roles r
    where r.user_id = auth.uid()
      and r.role = any(required_roles)
      and coalesce(r.status, 'ACTIVE') = 'ACTIVE'
  );
$$;

-- 3. Policies allowing authorized clinicians to manage patient & caregiver access within their treating scope
drop policy if exists smartcare_patient_access_clinician_insert on public.smartcare_patient_access;
create policy smartcare_patient_access_clinician_insert
  on public.smartcare_patient_access
  for insert to authenticated
  with check (
    public.smartcare_user_has_role(array['CLINICIAN'])
    and public.smartcare_can_access_patient(patient_id)
    and access_role in ('PATIENT', 'CAREGIVER')
  );

drop policy if exists smartcare_patient_access_clinician_update on public.smartcare_patient_access;
create policy smartcare_patient_access_clinician_update
  on public.smartcare_patient_access
  for update to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN'])
    and public.smartcare_can_access_patient(patient_id)
    and access_role in ('PATIENT', 'CAREGIVER')
  )
  with check (
    public.smartcare_user_has_role(array['CLINICIAN'])
    and public.smartcare_can_access_patient(patient_id)
    and access_role in ('PATIENT', 'CAREGIVER')
  );

-- 4. Secure RPC function: Grant Patient Access
create or replace function public.smartcare_grant_patient_access(
  target_patient_id uuid,
  target_user_id uuid,
  target_access_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  is_treating_clinician boolean;
  result_row public.smartcare_patient_access%rowtype;
begin
  is_admin := public.smartcare_user_has_role(array['ADMIN']);
  is_treating_clinician := public.smartcare_user_has_role(array['CLINICIAN'])
    and public.smartcare_can_access_patient(target_patient_id);

  if not is_admin and not is_treating_clinician then
    raise exception 'FORBIDDEN: Caller is not authorized to grant access to this patient.';
  end if;

  if not is_admin and target_access_role not in ('PATIENT', 'CAREGIVER') then
    raise exception 'FORBIDDEN: Clinicians can only grant PATIENT or CAREGIVER access roles.';
  end if;

  insert into public.smartcare_patient_access (
    patient_id, user_id, access_role, active, granted_by, granted_at
  )
  values (
    target_patient_id, target_user_id, target_access_role, true, auth.uid(), now()
  )
  on conflict (patient_id, user_id, access_role) do update
    set active = true,
        granted_by = auth.uid(),
        granted_at = now()
  returning * into result_row;

  insert into public.smartcare_audit_log (
    actor_id, action, object_type, object_id, metadata
  )
  values (
    auth.uid(),
    'GRANT_PATIENT_ACCESS',
    'smartcare_patient_access',
    target_patient_id::text,
    jsonb_build_object(
      'patient_id', target_patient_id,
      'granted_to_user_id', target_user_id,
      'access_role', target_access_role
    )
  );

  return jsonb_build_object(
    'success', true,
    'patient_id', target_patient_id,
    'user_id', target_user_id,
    'access_role', target_access_role
  );
end;
$$;

-- 5. Secure RPC function: Revoke Patient Access
create or replace function public.smartcare_revoke_patient_access(
  target_patient_id uuid,
  target_user_id uuid,
  target_access_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_admin boolean;
  is_treating_clinician boolean;
begin
  is_admin := public.smartcare_user_has_role(array['ADMIN']);
  is_treating_clinician := public.smartcare_user_has_role(array['CLINICIAN'])
    and public.smartcare_can_access_patient(target_patient_id);

  if not is_admin and not is_treating_clinician then
    raise exception 'FORBIDDEN: Caller is not authorized to revoke access for this patient.';
  end if;

  update public.smartcare_patient_access
  set active = false
  where patient_id = target_patient_id
    and user_id = target_user_id
    and access_role = target_access_role;

  insert into public.smartcare_audit_log (
    actor_id, action, object_type, object_id, metadata
  )
  values (
    auth.uid(),
    'REVOKE_PATIENT_ACCESS',
    'smartcare_patient_access',
    target_patient_id::text,
    jsonb_build_object(
      'patient_id', target_patient_id,
      'revoked_user_id', target_user_id,
      'access_role', target_access_role
    )
  );

  return jsonb_build_object(
    'success', true,
    'patient_id', target_patient_id,
    'revoked_user_id', target_user_id
  );
end;
$$;

revoke all on function public.smartcare_grant_patient_access(uuid, uuid, text) from public, anon;
grant execute on function public.smartcare_grant_patient_access(uuid, uuid, text) to authenticated;

revoke all on function public.smartcare_revoke_patient_access(uuid, uuid, text) from public, anon;
grant execute on function public.smartcare_revoke_patient_access(uuid, uuid, text) to authenticated;
