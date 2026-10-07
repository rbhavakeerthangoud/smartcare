create table if not exists public.smartcare_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('PATIENT', 'CAREGIVER', 'CLINICIAN', 'ADMIN')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.smartcare_patient_access (
  patient_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_role text not null check (access_role in ('PATIENT', 'CAREGIVER', 'CLINICIAN')),
  active boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id) on delete set null,
  primary key (patient_id, user_id, access_role)
);

create table if not exists public.care_plan_versions (
  id uuid primary key default gen_random_uuid(),
  care_plan_id uuid not null references public.care_plans(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  author_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  unique (care_plan_id, version)
);

create table if not exists public.smartcare_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  object_type text not null,
  object_id text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.smartcare_notifications (
  id uuid primary key default gen_random_uuid(),
  escalation_id uuid references public.escalations(id) on delete set null,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('WEB', 'EMAIL', 'SMS', 'VOICE')),
  status text not null check (
    status in ('CREATED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'ACKNOWLEDGED')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  error text
);

alter table public.task_occurrences
  add column if not exists time_zone text;

create index if not exists smartcare_patient_access_user_idx
  on public.smartcare_patient_access (user_id, active);
create index if not exists smartcare_patient_access_patient_idx
  on public.smartcare_patient_access (patient_id, active);
create index if not exists smartcare_audit_log_object_idx
  on public.smartcare_audit_log (object_type, object_id, occurred_at desc);
create index if not exists smartcare_notifications_recipient_idx
  on public.smartcare_notifications (recipient_id, created_at desc);
create unique index if not exists smartcare_notifications_delivery_unique
  on public.smartcare_notifications (escalation_id, recipient_id, channel)
  where escalation_id is not null;

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
  );
$$;

create or replace function public.smartcare_can_access_patient(target_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.smartcare_user_has_role(array['ADMIN'])
    or exists (
      select 1
      from public.smartcare_patient_access a
      where a.patient_id = target_patient_id
        and a.user_id = auth.uid()
        and a.active
    );
$$;

create or replace function public.smartcare_can_access_care_plan(target_care_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.smartcare_user_has_role(array['ADMIN'])
    or exists (
      select 1
      from public.care_plans cp
      where cp.id = target_care_plan_id
        and public.smartcare_can_access_patient(cp.patient_id)
    );
$$;

create or replace function public.smartcare_can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.smartcare_user_has_role(array['ADMIN'])
    or exists (
      select 1
      from public.tasks t
      where t.id = target_task_id
        and public.smartcare_can_access_care_plan(t.care_plan_id)
    );
$$;

create or replace function public.smartcare_can_access_report_path(object_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when split_part(object_path, '/', 1) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.smartcare_can_access_care_plan(
      split_part(object_path, '/', 1)::uuid
    )
    else false
  end;
$$;

create or replace function public.smartcare_can_access_audit_object(
  target_type text,
  target_id text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.smartcare_user_has_role(array['ADMIN']) then
    return true;
  end if;
  if target_id is null or target_id !~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then
    return false;
  end if;

  case target_type
    when 'patients' then
      return public.smartcare_can_access_patient(target_id::uuid);
    when 'care_plans' then
      return public.smartcare_can_access_care_plan(target_id::uuid);
    when 'tasks' then
      return public.smartcare_can_access_task(target_id::uuid);
    when 'task_occurrences' then
      return exists (
        select 1 from public.task_occurrences o
        where o.id = target_id::uuid
          and public.smartcare_can_access_task(o.task_id)
      );
    when 'events' then
      return exists (
        select 1 from public.events e
        where e.id = target_id::uuid
          and public.smartcare_can_access_task(e.task_id)
      );
    when 'documents' then
      return exists (
        select 1 from public.documents d
        where d.id = target_id::uuid
          and public.smartcare_can_access_task(d.task_id)
      );
    when 'dependencies' then
      return exists (
        select 1 from public.dependencies d
        where d.id = target_id::uuid
          and public.smartcare_can_access_care_plan(d.care_plan_id)
      );
    when 'escalations' then
      return exists (
        select 1 from public.escalations e
        where e.id = target_id::uuid
          and public.smartcare_can_access_care_plan(e.care_plan_id)
      );
    else
      return false;
  end case;
end;
$$;

revoke all on function public.smartcare_user_has_role(text[]) from public, anon;
revoke all on function public.smartcare_can_access_patient(uuid) from public, anon;
revoke all on function public.smartcare_can_access_care_plan(uuid) from public, anon;
revoke all on function public.smartcare_can_access_task(uuid) from public, anon;
revoke all on function public.smartcare_can_access_report_path(text) from public, anon;
revoke all on function public.smartcare_can_access_audit_object(text, text) from public, anon;
grant execute on function public.smartcare_user_has_role(text[]) to authenticated;
grant execute on function public.smartcare_can_access_patient(uuid) to authenticated;
grant execute on function public.smartcare_can_access_care_plan(uuid) to authenticated;
grant execute on function public.smartcare_can_access_task(uuid) to authenticated;
grant execute on function public.smartcare_can_access_report_path(text) to authenticated;
grant execute on function public.smartcare_can_access_report_path(text) to anon;
grant execute on function public.smartcare_can_access_audit_object(text, text) to authenticated;

create or replace function public.smartcare_link_patient_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  creator_role text;
begin
  select r.role into creator_role
  from public.smartcare_user_roles r
  where r.user_id = auth.uid()
    and r.role in ('PATIENT', 'CLINICIAN')
  limit 1;

  if creator_role is not null then
    insert into public.smartcare_patient_access (
      patient_id, user_id, access_role, granted_by
    )
    values (new.id, auth.uid(), creator_role, auth.uid())
    on conflict (patient_id, user_id, access_role) do update
      set active = true;
  end if;

  return new;
end;
$$;

drop trigger if exists smartcare_patient_creator_access on public.patients;
create trigger smartcare_patient_creator_access
after insert on public.patients
for each row execute function public.smartcare_link_patient_creator();

create or replace function public.smartcare_snapshot_care_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_version integer;
begin
  select coalesce(max(v.version), 0) + 1
    into next_version
  from public.care_plan_versions v
  where v.care_plan_id = new.id;

  insert into public.care_plan_versions (
    care_plan_id, version, snapshot, author_id, reason
  )
  values (
    new.id,
    next_version,
    to_jsonb(new),
    auth.uid(),
    case
      when tg_op = 'INSERT' then 'Initial care-plan snapshot'
      else 'Care-plan record updated'
    end
  );

  return new;
end;
$$;

create or replace function public.smartcare_record_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data jsonb;
  row_id text;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  row_id := coalesce(
    row_data ->> 'id',
    row_data ->> 'occurrence_id',
    row_data ->> 'patient_id',
    row_data ->> 'care_plan_id',
    row_data ->> 'task_id'
  );

  insert into public.smartcare_audit_log (
    actor_id, action, object_type, object_id, metadata
  )
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    row_id,
    jsonb_strip_nulls(jsonb_build_object(
      'patient_id', row_data -> 'patient_id',
      'care_plan_id', row_data -> 'care_plan_id',
      'task_id', row_data -> 'task_id',
      'occurrence_id', row_data -> 'occurrence_id',
      'status', row_data -> 'status',
      'source', row_data -> 'source',
      'trigger_state', row_data -> 'trigger_state'
    ))
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists smartcare_care_plan_version on public.care_plans;
create trigger smartcare_care_plan_version
after insert or update on public.care_plans
for each row execute function public.smartcare_snapshot_care_plan();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'patients',
    'care_plans',
    'tasks',
    'task_occurrences',
    'events',
    'documents',
    'dependencies',
    'escalations',
    'smartcare_patient_access',
    'smartcare_user_roles'
  ]
  loop
    execute format(
      'drop trigger if exists smartcare_audit_row_change on public.%I',
      table_name
    );
    execute format(
      'create trigger smartcare_audit_row_change after insert or update or delete on public.%I for each row execute function public.smartcare_record_row_change()',
      table_name
    );
  end loop;
end;
$$;

insert into public.care_plan_versions (
  care_plan_id, version, snapshot, author_id, reason
)
select cp.id, 1, to_jsonb(cp), null, 'Baseline snapshot captured during versioning rollout'
from public.care_plans cp
on conflict (care_plan_id, version) do nothing;

alter table public.smartcare_user_roles enable row level security;
alter table public.smartcare_patient_access enable row level security;
alter table public.care_plan_versions enable row level security;
alter table public.smartcare_audit_log enable row level security;
alter table public.smartcare_notifications enable row level security;

drop policy if exists smartcare_roles_read_self on public.smartcare_user_roles;
create policy smartcare_roles_read_self on public.smartcare_user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.smartcare_user_has_role(array['ADMIN']));
drop policy if exists smartcare_roles_admin_manage on public.smartcare_user_roles;
create policy smartcare_roles_admin_manage on public.smartcare_user_roles
  for all to authenticated
  using (public.smartcare_user_has_role(array['ADMIN']))
  with check (public.smartcare_user_has_role(array['ADMIN']));

drop policy if exists smartcare_patient_access_read on public.smartcare_patient_access;
create policy smartcare_patient_access_read on public.smartcare_patient_access
  for select to authenticated
  using (user_id = auth.uid() or public.smartcare_user_has_role(array['ADMIN']));
drop policy if exists smartcare_patient_access_admin_manage on public.smartcare_patient_access;
create policy smartcare_patient_access_admin_manage on public.smartcare_patient_access
  for all to authenticated
  using (public.smartcare_user_has_role(array['ADMIN']))
  with check (public.smartcare_user_has_role(array['ADMIN']));

drop policy if exists smartcare_versions_read_authorized on public.care_plan_versions;
create policy smartcare_versions_read_authorized on public.care_plan_versions
  for select to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_care_plan(care_plan_id)
  );

drop policy if exists smartcare_audit_read_authorized on public.smartcare_audit_log;
create policy smartcare_audit_read_authorized on public.smartcare_audit_log
  for select to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_audit_object(object_type, object_id)
  );
drop policy if exists smartcare_audit_insert_actor on public.smartcare_audit_log;
create policy smartcare_audit_insert_actor on public.smartcare_audit_log
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and action in ('LOGIN', 'LOGOUT')
    and object_type = 'user'
    and object_id = auth.uid()::text
  );

drop policy if exists smartcare_notifications_recipient_read on public.smartcare_notifications;
create policy smartcare_notifications_recipient_read on public.smartcare_notifications
  for select to authenticated
  using (
    recipient_id = auth.uid()
    or public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
  );
drop policy if exists smartcare_notifications_admin_manage on public.smartcare_notifications;
create policy smartcare_notifications_admin_manage on public.smartcare_notifications
  for all to authenticated
  using (public.smartcare_user_has_role(array['ADMIN']))
  with check (public.smartcare_user_has_role(array['ADMIN']));

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'patients',
        'care_plans',
        'tasks',
        'task_occurrences',
        'events',
        'documents',
        'dependencies',
        'escalations'
      )
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end;
$$;

alter table public.patients enable row level security;
alter table public.care_plans enable row level security;
alter table public.tasks enable row level security;
alter table public.task_occurrences enable row level security;
alter table public.events enable row level security;
alter table public.documents enable row level security;
alter table public.dependencies enable row level security;
alter table public.escalations enable row level security;

create policy smartcare_patients_read on public.patients
  for select to authenticated
  using (public.smartcare_can_access_patient(id));
create policy smartcare_patients_create on public.patients
  for insert to authenticated
  with check (public.smartcare_user_has_role(array['PATIENT', 'CLINICIAN', 'ADMIN']));
create policy smartcare_patients_update on public.patients
  for update to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_patient(id)
  )
  with check (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_patient(id)
  );
create policy smartcare_patients_delete on public.patients
  for delete to authenticated
  using (public.smartcare_user_has_role(array['ADMIN']));

create policy smartcare_care_plans_read on public.care_plans
  for select to authenticated
  using (public.smartcare_can_access_patient(patient_id));
create policy smartcare_care_plans_create on public.care_plans
  for insert to authenticated
  with check (
    public.smartcare_user_has_role(array['PATIENT', 'CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_patient(patient_id)
  );
create policy smartcare_care_plans_update on public.care_plans
  for update to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_patient(patient_id)
  )
  with check (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_patient(patient_id)
  );
create policy smartcare_care_plans_delete on public.care_plans
  for delete to authenticated
  using (public.smartcare_user_has_role(array['ADMIN']));

create policy smartcare_tasks_read on public.tasks
  for select to authenticated
  using (public.smartcare_can_access_care_plan(care_plan_id));
create policy smartcare_tasks_manage on public.tasks
  for all to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_care_plan(care_plan_id)
  )
  with check (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_care_plan(care_plan_id)
  );

create policy smartcare_occurrences_read on public.task_occurrences
  for select to authenticated
  using (
    exists (
      select 1 from public.tasks t
      where t.id = task_id
        and public.smartcare_can_access_care_plan(t.care_plan_id)
    )
  );
create policy smartcare_occurrences_manage on public.task_occurrences
  for all to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_task(task_id)
  )
  with check (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_task(task_id)
  );

create policy smartcare_events_read on public.events
  for select to authenticated
  using (public.smartcare_can_access_task(task_id));
create policy smartcare_events_create on public.events
  for insert to authenticated
  with check (public.smartcare_can_access_task(task_id));
create policy smartcare_events_update on public.events
  for update to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_task(task_id)
  )
  with check (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_task(task_id)
  );

create policy smartcare_documents_read on public.documents
  for select to authenticated
  using (public.smartcare_can_access_task(task_id));
create policy smartcare_documents_create on public.documents
  for insert to authenticated
  with check (public.smartcare_can_access_task(task_id));
create policy smartcare_documents_delete on public.documents
  for delete to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_task(task_id)
  );

create policy smartcare_dependencies_read on public.dependencies
  for select to authenticated
  using (public.smartcare_can_access_care_plan(care_plan_id));
create policy smartcare_dependencies_manage on public.dependencies
  for all to authenticated
  using (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_care_plan(care_plan_id)
  )
  with check (
    public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_care_plan(care_plan_id)
  );

create policy smartcare_escalations_read on public.escalations
  for select to authenticated
  using (public.smartcare_can_access_care_plan(care_plan_id));
create policy smartcare_escalations_create on public.escalations
  for insert to authenticated
  with check (public.smartcare_can_access_care_plan(care_plan_id));
create policy smartcare_escalations_update on public.escalations
  for update to authenticated
  using (
    public.smartcare_user_has_role(array['CAREGIVER', 'CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_care_plan(care_plan_id)
  )
  with check (
    public.smartcare_user_has_role(array['CAREGIVER', 'CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_care_plan(care_plan_id)
  );

create table if not exists public.smartcare_escalation_keys (
  occurrence_id uuid not null,
  trigger_state text not null check (
    trigger_state in ('MISSED', 'UNCONFIRMED', 'CONFLICTING', 'LATE')
  ),
  escalation_id uuid references public.escalations(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (occurrence_id, trigger_state)
);
alter table public.smartcare_escalation_keys enable row level security;

insert into public.smartcare_escalation_keys (
  occurrence_id, trigger_state, escalation_id
)
select distinct on (e.occurrence_id, e.trigger_state)
  e.occurrence_id, e.trigger_state, e.id
from public.escalations e
where e.occurrence_id is not null
  and e.trigger_state in ('MISSED', 'UNCONFIRMED', 'CONFLICTING', 'LATE')
order by e.occurrence_id, e.trigger_state, e.created_at asc
on conflict (occurrence_id, trigger_state) do nothing;

create or replace function public.smartcare_create_escalation(
  p_care_plan_id uuid,
  p_task_id uuid,
  p_occurrence_id uuid,
  p_trigger_state text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_task public.tasks%rowtype;
  selected_priority text;
  selected_recipient text;
  selected_escalation_id uuid;
  inserted_rows integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    and not public.smartcare_can_access_care_plan(p_care_plan_id)
  then
    raise exception 'Not authorized to access this care plan'
      using errcode = '42501';
  end if;

  if p_trigger_state not in ('MISSED', 'UNCONFIRMED', 'CONFLICTING', 'LATE') then
    raise exception 'Unsupported escalation trigger state'
      using errcode = '22023';
  end if;

  select t.* into selected_task
  from public.tasks t
  join public.task_occurrences o on o.task_id = t.id
  where t.id = p_task_id
    and t.care_plan_id = p_care_plan_id
    and o.id = p_occurrence_id;
  if not found then
    raise exception 'Task occurrence does not belong to the care plan'
      using errcode = '22023';
  end if;

  selected_priority := case p_trigger_state
    when 'MISSED' then 'HIGH'
    when 'UNCONFIRMED' then 'NORMAL'
    when 'CONFLICTING' then 'HIGH'
    when 'LATE' then 'NORMAL'
  end;
  selected_recipient := case p_trigger_state
    when 'CONFLICTING' then 'HEALTHCARE_PROFESSIONAL'
    else 'CAREGIVER'
  end;

  insert into public.smartcare_escalation_keys (
    occurrence_id, trigger_state
  )
  values (p_occurrence_id, p_trigger_state)
  on conflict (occurrence_id, trigger_state) do nothing;
  get diagnostics inserted_rows = row_count;

  if inserted_rows = 0 then
    select k.escalation_id into selected_escalation_id
    from public.smartcare_escalation_keys k
    where k.occurrence_id = p_occurrence_id
      and k.trigger_state = p_trigger_state;
    insert into public.smartcare_notifications (
      escalation_id, recipient_id, channel, status
    )
    select
      selected_escalation_id,
      a.user_id,
      'WEB',
      'QUEUED'
    from public.care_plans cp
    join public.smartcare_patient_access a
      on a.patient_id = cp.patient_id
     and a.active
     and a.access_role = case
       when selected_recipient = 'HEALTHCARE_PROFESSIONAL' then 'CLINICIAN'
       else 'CAREGIVER'
     end
    where cp.id = p_care_plan_id
    on conflict (escalation_id, recipient_id, channel)
      where escalation_id is not null
      do nothing;
    return jsonb_build_object(
      'escalation_id', selected_escalation_id,
      'created', false
    );
  end if;

  insert into public.escalations (
    care_plan_id,
    task_id,
    occurrence_id,
    trigger_state,
    priority,
    recipient_type,
    status,
    message
  )
  values (
    p_care_plan_id,
    p_task_id,
    p_occurrence_id,
    p_trigger_state,
    selected_priority,
    selected_recipient,
    'CREATED',
    format('Task "%s" requires review because its execution state is %s.',
      selected_task.name, p_trigger_state)
  )
  returning id into selected_escalation_id;

  update public.smartcare_escalation_keys
  set escalation_id = selected_escalation_id
  where occurrence_id = p_occurrence_id
    and trigger_state = p_trigger_state;

  insert into public.smartcare_notifications (
    escalation_id, recipient_id, channel, status
  )
  select
    selected_escalation_id,
    a.user_id,
    'WEB',
    'QUEUED'
  from public.care_plans cp
  join public.smartcare_patient_access a
    on a.patient_id = cp.patient_id
   and a.active
   and a.access_role = case
     when selected_recipient = 'HEALTHCARE_PROFESSIONAL' then 'CLINICIAN'
     else 'CAREGIVER'
   end
  where cp.id = p_care_plan_id
  on conflict (escalation_id, recipient_id, channel)
    where escalation_id is not null
    do nothing;

  return jsonb_build_object(
    'escalation_id', selected_escalation_id,
    'created', true
  );
end;
$$;

create or replace function public.smartcare_mark_notification(
  p_notification_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
begin
  if p_status not in ('DELIVERED', 'ACKNOWLEDGED') then
    raise exception 'Unsupported notification status'
      using errcode = '22023';
  end if;

  select n.status into current_status
  from public.smartcare_notifications n
  where n.id = p_notification_id
    and n.recipient_id = auth.uid()
  for update;
  if not found then
    raise exception 'Notification not found'
      using errcode = 'P0002';
  end if;

  if p_status = 'DELIVERED' and current_status in ('CREATED', 'QUEUED', 'SENT') then
    update public.smartcare_notifications
    set status = 'DELIVERED', updated_at = now()
    where id = p_notification_id;
  elsif p_status = 'DELIVERED' and current_status = 'DELIVERED' then
    return;
  elsif p_status = 'ACKNOWLEDGED'
    and current_status in ('DELIVERED', 'SENT')
  then
    update public.smartcare_notifications
    set status = 'ACKNOWLEDGED', updated_at = now()
    where id = p_notification_id;
  elsif p_status = 'ACKNOWLEDGED' and current_status = 'ACKNOWLEDGED' then
    return;
  else
    raise exception 'Invalid notification state transition'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.smartcare_create_escalation(uuid, uuid, uuid, text)
  from public, anon;
grant execute on function public.smartcare_create_escalation(uuid, uuid, uuid, text)
  to authenticated, service_role;
revoke all on function public.smartcare_mark_notification(uuid, text)
  from public, anon;
grant execute on function public.smartcare_mark_notification(uuid, text)
  to authenticated;

update storage.buckets
set public = false
where id = 'reports';

drop policy if exists smartcare_reports_restriction on storage.objects;
create policy smartcare_reports_restriction on storage.objects
  as restrictive
  for all to public
  using (
    bucket_id <> 'reports'
    or (
      auth.uid() is not null
      and public.smartcare_can_access_report_path(name)
    )
  )
  with check (
    bucket_id <> 'reports'
    or (
      auth.uid() is not null
      and public.smartcare_can_access_report_path(name)
    )
  );

drop policy if exists smartcare_reports_read on storage.objects;
create policy smartcare_reports_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'reports'
    and public.smartcare_can_access_report_path(name)
  );
drop policy if exists smartcare_reports_upload on storage.objects;
create policy smartcare_reports_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reports'
    and public.smartcare_can_access_report_path(name)
  );
drop policy if exists smartcare_reports_delete on storage.objects;
create policy smartcare_reports_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reports'
    and public.smartcare_user_has_role(array['CLINICIAN', 'ADMIN'])
    and public.smartcare_can_access_report_path(name)
  );
