revoke all on function public.smartcare_create_escalation(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.smartcare_create_escalation(uuid, uuid, uuid, text)
  to service_role;

drop policy if exists smartcare_notifications_recipient_read
  on public.smartcare_notifications;
create policy smartcare_notifications_recipient_read
  on public.smartcare_notifications
  for select to authenticated
  using (
    recipient_id = auth.uid()
    or public.smartcare_user_has_role(array['ADMIN'])
    or (
      public.smartcare_user_has_role(array['CLINICIAN'])
      and escalation_id is not null
      and exists (
        select 1
        from public.escalations e
        where e.id = smartcare_notifications.escalation_id
          and public.smartcare_can_access_care_plan(e.care_plan_id)
      )
    )
  );
