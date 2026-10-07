create or replace function public.smartcare_is_patient_owner(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.smartcare_patient_access a
    where a.patient_id = target_patient_id
      and a.user_id = auth.uid()
      and a.access_role = 'PATIENT'
      and a.active
  );
$$;

revoke all on function public.smartcare_is_patient_owner(uuid) from public, anon;
grant execute on function public.smartcare_is_patient_owner(uuid) to authenticated;

drop policy if exists smartcare_patient_access_read
  on public.smartcare_patient_access;
create policy smartcare_patient_access_read
  on public.smartcare_patient_access
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.smartcare_user_has_role(array['ADMIN'])
    or (
      public.smartcare_user_has_role(array['PATIENT'])
      and public.smartcare_is_patient_owner(patient_id)
    )
  );
