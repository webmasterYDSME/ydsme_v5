-- Public featuring needs a second pair of eyes: committee members cannot
-- approve or reject their own project submissions.

create or replace function public.prevent_public_project_self_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('approved', 'rejected')
    and new.reviewed_by is not null
    and exists (
      select 1
      from public.member_projects project
      where project.id = new.project_id
        and project.owner_id = new.reviewed_by
    )
  then
    raise exception 'public_feature_requires_independent_review';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_public_project_self_review() from public, anon, authenticated;

create trigger member_project_feature_requests_independent_review
before insert or update on public.member_project_feature_requests
for each row execute function public.prevent_public_project_self_review();
