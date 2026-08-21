begin;

do $$
declare
  first_member uuid;
  second_member uuid;
  workshop_id uuid := gen_random_uuid();
  reservation_id bigint;
  event_id bigint;
  abuse_event_id bigint;
  retention_event_id bigint;
  visible_announcement_count integer;
  second_reservation_rejected boolean := false;
  second_booking_rejected boolean := false;
  oversized_booking_rejected boolean := false;
  booking_outcome text;
  booking_count integer;
  block_count integer;
  device_hash text := repeat('a', 64);
  ip_hash text := repeat('b', 64);
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
  if has_column_privilege('authenticated', 'public.users', 'membership_status', 'UPDATE')
    or has_column_privilege('authenticated', 'public.users', 'legal_hold', 'UPDATE')
    or has_column_privilege('authenticated', 'public.users', 'full_name', 'UPDATE') then
    raise exception 'Member profile column privileges are incorrect';
  end if;
  if not has_function_privilege('authenticated', 'public.update_own_member_profile(text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.update_own_member_profile(text,text,text)', 'EXECUTE') then
    raise exception 'Atomic member profile RPC privileges are incorrect';
  end if;
  if has_function_privilege('authenticated', 'public.update_users(uuid,text,text,text,text,text,text,jsonb,boolean)', 'EXECUTE') then
    raise exception 'A legacy security-definer function is exposed as an RPC';
  end if;
  if has_table_privilege('anon', 'public.configs', 'SELECT') then
    raise exception 'Anonymous config access is still granted';
  end if;
  if has_table_privilege('anon', 'public.donation_campaigns', 'SELECT')
    or not has_table_privilege('anon', 'public.public_site_links', 'SELECT')
    or not has_table_privilege('anon', 'public.public_site_config', 'SELECT') then
    raise exception 'Normalized public configuration privileges are incorrect';
  end if;
  if has_table_privilege('anon', 'public.events', 'SELECT')
    or not has_table_privilege('anon', 'public.public_events', 'SELECT')
    or has_table_privilege('anon', 'public.announcements', 'SELECT')
    or not has_table_privilege('anon', 'public.public_announcements', 'SELECT')
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

  insert into public.announcements (title, body, lifecycle_status, created_by, published_at)
  values
    ('Contract draft note', 'This must remain private.', 'draft', first_member, null),
    ('Contract public note', 'This must be publicly visible.', 'published', first_member, now());
  select count(*)::integer into visible_announcement_count
  from public.public_announcements
  where title like 'Contract % note';
  if visible_announcement_count <> 1 then
    raise exception 'Public announcement projection leaked a draft or hid a published record';
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

  begin
    insert into public.event_bookings (event_id, reference_code, lead_name, email, party_size)
    values (event_id, 'YME-TOO-LARGE', 'Large group', 'large@example.invalid', 7);
  exception when others then
    if sqlerrm like '%invalid_party_size%' then oversized_booking_rejected := true; else raise; end if;
  end;
  if not oversized_booking_rejected then raise exception 'Database insert protection accepted more than six visitors'; end if;

  insert into public.events (name, descriptions, start_date, end_date, start_time, end_time, host, event_type, booking_enabled, booking_capacity, booking_mode)
  values ('Abuse contract event', 'Contract test', current_date + 2, current_date + 2, '10:00', '11:00', first_member, 'public', true, 100, 'website')
  returning id into abuse_event_id;

  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'First group', 'group-one@example.invalid', 6, 'YME-ABUSE-1', device_hash, ip_hash
  );
  if booking_outcome <> 'accepted' then raise exception 'First six-person group was not accepted'; end if;
  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Second group', 'group-two@example.invalid', 6, 'YME-ABUSE-2', device_hash, ip_hash
  );
  if booking_outcome <> 'accepted' then raise exception 'Second six-person group was not accepted'; end if;
  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Blocked group', 'group-three@example.invalid', 1, 'YME-ABUSE-3', device_hash, ip_hash
  );
  if booking_outcome <> 'blocked' then raise exception 'Rapid booking above 12 places was not blocked'; end if;

  select count(*)::integer into booking_count from public.event_bookings eb where eb.event_id = abuse_event_id;
  if booking_count <> 2 then raise exception 'Blocked booking stored visitor details or consumed capacity'; end if;
  select browser_blocks + ip_blocks + both_blocks into block_count
  from public.event_booking_abuse_summary summary where summary.event_id = abuse_event_id;
  if block_count <> 1 then raise exception 'Blocked booking aggregate was not recorded'; end if;

  update public.event_bookings
  set status = 'cancelled'
  where event_bookings.event_id = abuse_event_id and email = 'group-one@example.invalid';
  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Replacement group', 'replacement@example.invalid', 6, 'YME-ABUSE-4', device_hash, ip_hash
  );
  if booking_outcome <> 'accepted' then raise exception 'Cancelled bookings still counted toward the rapid limit'; end if;

  update public.event_bookings
  set created_at = now() - interval '11 minutes'
  where event_bookings.event_id = abuse_event_id and status in ('confirmed', 'checked_in');
  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Later group', 'later@example.invalid', 6, 'YME-ABUSE-5', device_hash, ip_hash
  );
  if booking_outcome <> 'accepted' then raise exception 'Bookings older than ten minutes still counted toward the rapid limit'; end if;

  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Same network group', 'same-network@example.invalid', 6, 'YME-ABUSE-IP-1', repeat('c', 64), ip_hash
  );
  if booking_outcome <> 'accepted' then raise exception 'The twelfth rapid place from one IP was not accepted'; end if;
  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Network blocked group', 'network-blocked@example.invalid', 1, 'YME-ABUSE-IP-2', repeat('d', 64), ip_hash
  );
  if booking_outcome <> 'blocked' then raise exception 'IP-only rapid history above 12 places was not blocked'; end if;

  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Browser group one', 'browser-one@example.invalid', 6, 'YME-ABUSE-BROWSER-1', repeat('e', 64), repeat('f', 64)
  );
  if booking_outcome <> 'accepted' then raise exception 'First browser-only group was not accepted'; end if;
  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Browser group two', 'browser-two@example.invalid', 6, 'YME-ABUSE-BROWSER-2', repeat('e', 64), repeat('0', 64)
  );
  if booking_outcome <> 'accepted' then raise exception 'The twelfth rapid place from one browser was not accepted'; end if;
  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Browser blocked group', 'browser-blocked@example.invalid', 1, 'YME-ABUSE-BROWSER-3', repeat('e', 64), repeat('1', 64)
  );
  if booking_outcome <> 'blocked' then raise exception 'Browser-only rapid history above 12 places was not blocked'; end if;

  select outcome into booking_outcome from public.create_event_booking_v2(
    abuse_event_id, 'Different identifiers', 'different@example.invalid', 6, 'YME-ABUSE-6', repeat('2', 64), repeat('3', 64)
  );
  if booking_outcome <> 'accepted' then raise exception 'Different browser and IP identifiers were incorrectly blocked'; end if;
  if not exists (
    select 1 from public.event_booking_abuse_summary summary
    where summary.event_id = abuse_event_id
      and summary.browser_blocks = 1
      and summary.ip_blocks = 1
      and summary.both_blocks = 1
  ) then raise exception 'Booking block reason aggregates are incorrect'; end if;

  insert into public.events (name, descriptions, start_date, end_date, start_time, end_time, host, event_type, booking_enabled, booking_capacity, booking_mode)
  values ('Retention contract event', 'Contract test', current_date - 100, current_date - 100, '10:00', '11:00', first_member, 'public', false, 10, 'none')
  returning id into retention_event_id;
  insert into public.event_bookings (event_id, reference_code, lead_name, email, party_size, booking_device_hash, booking_ip_hash)
  values (retention_event_id, 'YME-RETENTION', 'Retention visitor', 'retention@example.invalid', 1, device_hash, ip_hash);
  insert into public.event_booking_abuse_summary (event_id, both_blocks)
  values (retention_event_id, 1);
  perform public.run_dashboard_retention();
  if exists (
    select 1 from public.event_bookings
    where event_bookings.event_id = retention_event_id and (booking_device_hash is not null or booking_ip_hash is not null)
  ) then raise exception 'Expired booking hashes were not removed'; end if;
  if exists (select 1 from public.event_booking_abuse_summary summary where summary.event_id = retention_event_id) then
    raise exception 'Expired booking abuse aggregate was not removed';
  end if;

  if not public.consume_rate_limit('contract-test', 'subject', 1, 60) then raise exception 'First throttle attempt was rejected'; end if;
  if public.consume_rate_limit('contract-test', 'subject', 1, 60) then raise exception 'Throttle limit was not enforced'; end if;
end;
$$;

rollback;
