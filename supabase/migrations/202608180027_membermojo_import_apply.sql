-- Register a short-lived, non-raw preview and apply its normalized membership
-- fields atomically. Both functions are service-role-only and independently
-- verify that the actor is an active website administrator.

create or replace function public.register_membermojo_import_preview(
  p_file_sha256 text,
  p_import_mode text,
  p_source_encoding text,
  p_row_count integer,
  p_summary jsonb,
  p_actor_id uuid
)
returns table (
  import_id uuid,
  import_status text,
  import_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import public.membership_imports%rowtype;
begin
  if p_file_sha256 is null or p_file_sha256 !~ '^[0-9a-f]{64}$'
    or p_import_mode is null or p_import_mode not in ('update_only', 'complete_active_snapshot')
    or p_source_encoding is null or p_source_encoding not in ('utf-8', 'windows-1252')
    or p_row_count is null or p_row_count not between 1 and 1000
    or p_summary is null or jsonb_typeof(p_summary) <> 'object'
    or octet_length(p_summary::text) > 20000 then
    raise exception 'membermojo_preview_invalid';
  end if;

  if not exists (
    select 1
    from public.users u
    join public.user_roles r on r.user_id = u.id
    where u.id = p_actor_id
      and u.membership_status = 'active'
      and r.role = 'administrator'
  ) then
    raise exception 'membermojo_actor_not_administrator';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_file_sha256, 0));

  select * into v_import
  from public.membership_imports
  where file_sha256 = p_file_sha256
  for update;

  if found and v_import.status = 'applied' then
    return query select v_import.id, v_import.status, v_import.expires_at;
    return;
  end if;

  if found then
    update public.membership_imports
    set import_mode = p_import_mode,
        status = 'previewed',
        source_encoding = p_source_encoding,
        row_count = p_row_count,
        summary = p_summary,
        created_by = p_actor_id,
        created_at = now(),
        expires_at = now() + interval '24 hours',
        applied_at = null
    where id = v_import.id
    returning * into v_import;
  else
    insert into public.membership_imports (
      file_sha256,
      import_mode,
      source_encoding,
      row_count,
      summary,
      created_by
    ) values (
      p_file_sha256,
      p_import_mode,
      p_source_encoding,
      p_row_count,
      p_summary,
      p_actor_id
    )
    returning * into v_import;
  end if;

  return query select v_import.id, v_import.status, v_import.expires_at;
end;
$$;

create or replace function public.apply_membermojo_membership_import(
  p_import_id uuid,
  p_actor_id uuid,
  p_file_sha256 text,
  p_records jsonb
)
returns table (
  processed_count integer,
  created_count integer,
  refreshed_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import public.membership_imports%rowtype;
  v_processed integer;
  v_created integer;
  v_now timestamptz := now();
begin
  if not exists (
    select 1
    from public.users u
    join public.user_roles r on r.user_id = u.id
    where u.id = p_actor_id
      and u.membership_status = 'active'
      and r.role = 'administrator'
  ) then
    raise exception 'membermojo_actor_not_administrator';
  end if;

  select * into v_import
  from public.membership_imports
  where id = p_import_id
  for update;

  if not found or v_import.created_by is distinct from p_actor_id then
    raise exception 'membermojo_preview_not_found';
  end if;
  if v_import.status = 'applied' then
    raise exception 'membermojo_import_already_applied';
  end if;
  if v_import.status <> 'previewed' or v_import.expires_at <= v_now then
    raise exception 'membermojo_preview_expired';
  end if;
  if p_file_sha256 is distinct from v_import.file_sha256 then
    raise exception 'membermojo_file_changed';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'membermojo_records_invalid';
  end if;
  if jsonb_array_length(p_records) <> v_import.row_count then
    raise exception 'membermojo_records_invalid';
  end if;

  select count(*), count(distinct record.external_id)
  into v_processed, v_created
  from jsonb_to_recordset(p_records) as record(external_id text);
  if v_processed <> v_created
    or exists (
      select 1
      from jsonb_to_recordset(p_records) as record(external_id text)
      where record.external_id is null
        or record.external_id !~ '^[0-9]{1,20}$'
    ) then
    raise exception 'membermojo_records_invalid';
  end if;

  select count(*) into v_created
  from jsonb_to_recordset(p_records) as record(external_id text)
  where not exists (
    select 1
    from public.membership_records current
    where current.source = 'membermojo'
      and current.external_id = record.external_id
  );

  insert into public.membership_records (
    source,
    external_id,
    title,
    first_name,
    last_name,
    contact_email,
    membership_type,
    source_state,
    source_expires_on,
    source_renewed_on,
    source_member_since,
    source_rules_agreement,
    last_seen_import_id,
    last_seen_at,
    updated_at
  )
  select
    'membermojo',
    record.external_id,
    record.title,
    record.first_name,
    record.last_name,
    nullif(lower(btrim(record.contact_email)), ''),
    record.membership_type,
    record.source_state,
    record.source_expires_on,
    record.source_renewed_on,
    record.source_member_since,
    record.source_rules_agreement,
    v_import.id,
    v_now,
    v_now
  from jsonb_to_recordset(p_records) as record(
    external_id text,
    title text,
    first_name text,
    last_name text,
    contact_email text,
    membership_type text,
    source_state text,
    source_expires_on date,
    source_renewed_on date,
    source_member_since date,
    source_rules_agreement boolean
  )
  on conflict (source, external_id) do update
  set title = excluded.title,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      contact_email = excluded.contact_email,
      membership_type = excluded.membership_type,
      source_state = excluded.source_state,
      source_expires_on = excluded.source_expires_on,
      source_renewed_on = excluded.source_renewed_on,
      source_member_since = excluded.source_member_since,
      source_rules_agreement = excluded.source_rules_agreement,
      last_seen_import_id = excluded.last_seen_import_id,
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at;

  update public.membership_imports
  set status = 'applied',
      applied_at = v_now,
      summary = summary || jsonb_build_object(
        'application', jsonb_build_object(
          'processed', v_processed,
          'created', v_created,
          'refreshed', v_processed - v_created,
          'portal_accounts_changed', 0,
          'website_roles_changed', 0
        )
      )
  where id = v_import.id;

  insert into public.audit_logs (
    actor_user_id,
    actor_role,
    action,
    entity_type,
    entity_id,
    summary,
    after_state
  ) values (
    p_actor_id,
    'administrator',
    'membermojo.import-applied',
    'membership_import',
    v_import.id::text,
    format(
      'Applied %s MemberMojo membership records: %s created and %s refreshed. Portal accounts and website roles were unchanged.',
      v_processed,
      v_created,
      v_processed - v_created
    ),
    jsonb_build_object(
      'file_fingerprint', left(v_import.file_sha256, 12),
      'mode', v_import.import_mode,
      'processed', v_processed,
      'created', v_created,
      'refreshed', v_processed - v_created,
      'portal_accounts_changed', 0,
      'website_roles_changed', 0
    )
  );

  return query select v_processed, v_created, v_processed - v_created;
end;
$$;

revoke all on function public.register_membermojo_import_preview(text, text, text, integer, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.apply_membermojo_membership_import(uuid, uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.register_membermojo_import_preview(text, text, text, integer, jsonb, uuid)
  to service_role;
grant execute on function public.apply_membermojo_membership_import(uuid, uuid, text, jsonb)
  to service_role;

comment on function public.apply_membermojo_membership_import(uuid, uuid, text, jsonb) is
  'Atomically applies allowlisted MemberMojo membership fields and audit evidence without changing portal accounts or roles.';
