-- Reduce dashboard request fan-out without widening direct table access.
-- Feed reads remain security-invoker/RLS filtered; aggregate and archive reads
-- expose only narrow DTOs after checking active application membership.

create or replace function public.dashboard_feed_snapshot(p_limit integer default 12)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with ranked as (
    select
      f.id,
      f.type,
      f.title,
      f.message,
      f.url,
      f.author_name,
      f.author_id,
      f.created_at,
      row_number() over (order by f.created_at desc, f.id desc) as recent_rank,
      row_number() over (partition by f.type order by f.created_at desc, f.id desc) as type_rank
    from public.feeds as f
    where f.lifecycle_status = 'published'
      and public.is_active_member()
  ),
  payload as (
    select jsonb_build_object(
      'id', id,
      'type', type,
      'title', title,
      'message', message,
      'url', url,
      'author_name', author_name,
      'author_id', author_id,
      'created_at', created_at
    ) as item, *
    from ranked
  )
  select jsonb_build_object(
    'recent', coalesce(
      (select jsonb_agg(item order by created_at desc, id desc)
       from payload
       where recent_rank <= greatest(1, least(coalesce(p_limit, 12), 50))),
      '[]'::jsonb
    ),
    'latest_document', (select item from payload where type = 'document' and type_rank = 1),
    'latest_message', (select item from payload where type = 'message' and type_rank = 1),
    'latest_user', (select item - 'url' - 'author_name' - 'author_id' from payload where type = 'user' and type_rank = 1)
  );
$$;

create or replace function public.workshop_reservation_counts(p_workshop_ids uuid[])
returns table(reference_id uuid, reserved_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.reference_id, count(*)::bigint as reserved_count
  from public.participants as p
  where public.is_active_member()
    and coalesce(cardinality(p_workshop_ids), 0) between 1 and 50
    and p.reference_id = any(p_workshop_ids)
    and p.reservation_status = 'reserved'
  group by p.reference_id;
$$;

create or replace function public.own_archived_notices(p_limit integer default 10)
returns table(id bigint, title text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.title
  from public.feeds as f
  where public.is_active_member()
    and f.author_id = (select auth.uid())
    and f.lifecycle_status = 'archived'
  order by f.archived_at desc, f.id desc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.dashboard_feed_snapshot(integer) from public, anon, authenticated;
revoke all on function public.workshop_reservation_counts(uuid[]) from public, anon, authenticated;
revoke all on function public.own_archived_notices(integer) from public, anon, authenticated;

grant execute on function public.dashboard_feed_snapshot(integer) to authenticated, service_role;
grant execute on function public.workshop_reservation_counts(uuid[]) to authenticated, service_role;
grant execute on function public.own_archived_notices(integer) to authenticated, service_role;
