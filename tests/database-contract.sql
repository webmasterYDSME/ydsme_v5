begin;

do $$
declare
  first_member uuid;
  second_member uuid;
  workshop_id uuid := gen_random_uuid();
  reservation_id bigint;
  event_id bigint;
  second_reservation_rejected boolean := false;
  second_booking_rejected boolean := false;
begin
  select id into first_member from public.users where membership_status = 'active' order by id limit 1;
  select id into second_member from public.users where membership_status = 'active' and id <> first_member order by id limit 1;
  if first_member is null or second_member is null then raise exception 'Two active test members are required'; end if;

  if has_table_privilege('authenticated', 'public.participants', 'INSERT')
    or has_table_privilege('authenticated', 'public.participants', 'UPDATE')
    or has_table_privilege('authenticated', 'public.feeds', 'INSERT')
    or has_table_privilege('authenticated', 'public.users', 'UPDATE')
    or has_table_privilege('authenticated', 'public.events', 'TRUNCATE')
    or has_table_privilege('anon', 'public.events', 'TRUNCATE') then
    raise exception 'Sensitive direct-write privilege is still granted';
  end if;
  if has_function_privilege('authenticated', 'public.update_users(uuid,text,text,text,text,text,text,jsonb,boolean)', 'EXECUTE') then
    raise exception 'A legacy security-definer function is exposed as an RPC';
  end if;
  if has_table_privilege('anon', 'public.configs', 'SELECT') then
    raise exception 'Anonymous config access is still granted';
  end if;
  if has_table_privilege('anon', 'public.donation_campaigns', 'SELECT')
    or not has_table_privilege('anon', 'public.public_site_links', 'SELECT') then
    raise exception 'Normalized public configuration privileges are incorrect';
  end if;
  if has_table_privilege('anon', 'public.events', 'SELECT')
    or not has_table_privilege('anon', 'public.public_events', 'SELECT')
    or has_column_privilege('authenticated', 'public.events', 'host', 'SELECT')
    or not has_column_privilege('authenticated', 'public.events', 'id', 'SELECT') then
    raise exception 'Public or member event projections expose operational columns';
  end if;
  if exists (
    select 1 from pg_trigger
    where not tgisinternal and tgname in ('on_delete_document', 'on_delete_event')
  ) then
    raise exception 'Blocked direct-SQL storage deletion trigger is still installed';
  end if;
  if has_table_privilege('service_role', 'public.audit_logs', 'UPDATE')
    or has_table_privilege('service_role', 'public.audit_logs', 'DELETE') then
    raise exception 'Audit history is mutable';
  end if;

  insert into public.workshops (id, title, descriptions, date, start_time, end_time, host_name, created_by, maximum_participants)
  values (workshop_id, 'Contract test', 'Contract test', current_date + 1, '10:00', '11:00', 'Test', first_member, 1);
  perform set_config('request.jwt.claim.sub', first_member::text, true);
  perform public.reserve_workshop_place(workshop_id);
  select id into reservation_id
  from public.participants
  where reference_id = workshop_id and participant_id = first_member;
  if not public.record_workshop_email_attempt(reservation_id, false, 'Delivery failed.') then
    raise exception 'Workshop delivery attempt was not recorded';
  end if;
  if not exists (
    select 1 from public.participants
    where id = reservation_id
      and notification_email_attempts = 1
      and notification_email_error = 'Delivery failed.'
  ) then
    raise exception 'Workshop delivery state is incorrect';
  end if;
  perform set_config('request.jwt.claim.sub', second_member::text, true);
  begin
    perform public.reserve_workshop_place(workshop_id);
  exception when others then
    if sqlerrm like '%workshop_full%' then second_reservation_rejected := true; else raise; end if;
  end;
  if not second_reservation_rejected then raise exception 'Workshop overbooking was not rejected'; end if;

  insert into public.events (name, descriptions, start_date, end_date, start_time, end_time, host, event_type, booking_enabled, booking_capacity, booking_mode)
  values ('Contract event', 'Contract test', current_date + 1, current_date + 1, '10:00', '11:00', first_member, 'public', true, 1, 'website')
  returning id into event_id;
  perform public.create_event_booking(event_id, 'First visitor', 'first@example.invalid', 1, 'YME-TEST1');
  begin
    perform public.create_event_booking(event_id, 'Second visitor', 'second@example.invalid', 1, 'YME-TEST2');
  exception when others then
    if sqlerrm like '%insufficient_capacity%' then second_booking_rejected := true; else raise; end if;
  end;
  if not second_booking_rejected then raise exception 'Event overbooking was not rejected'; end if;

  if not public.consume_rate_limit('contract-test', 'subject', 1, 60) then raise exception 'First throttle attempt was rejected'; end if;
  if public.consume_rate_limit('contract-test', 'subject', 1, 60) then raise exception 'Throttle limit was not enforced'; end if;
end;
$$;

rollback;
