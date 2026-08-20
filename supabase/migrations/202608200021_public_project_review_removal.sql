-- Committee reviewers may remove an already published feature as well as
-- reject a pending request. Owner consent remains recorded for transparency.

create or replace function public.reject_public_project_feature(
  p_project_id uuid,
  p_review_note text default ''
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.is_active_member()
    or not public.has_app_role(array['committee', 'administrator'])
  then
    raise exception 'not_authorized';
  end if;

  update public.member_project_feature_requests
  set status = 'rejected',
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      review_note = left(btrim(coalesce(p_review_note, '')), 500),
      updated_at = now()
  where project_id = p_project_id
    and status in ('pending', 'approved')
    and owner_consented_at is not null;

  if not found then
    raise exception 'feature_request_not_reviewable';
  end if;

  delete from public.public_featured_projects where project_id = p_project_id;
  return true;
end;
$$;

revoke all on function public.reject_public_project_feature(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_public_project_feature(uuid, text) to authenticated;
