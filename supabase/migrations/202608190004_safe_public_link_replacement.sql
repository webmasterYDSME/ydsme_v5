-- The local and hosted projects enable the safe-update guard, which rejects
-- DELETE statements without an explicit predicate even inside definer RPCs.
-- Keep the replacement atomic while making the intentional full-table delete
-- explicit.
create or replace function public.replace_public_site_links(
  p_socials jsonb,
  p_affiliates jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.site_social_links where true;
  insert into public.site_social_links (name, url, position)
  select item->>'name', coalesce(item->>'link', ''), ordinal::integer - 1
  from jsonb_array_elements(p_socials) with ordinality as link(item, ordinal);

  delete from public.site_affiliates where true;
  insert into public.site_affiliates (name, url, logo_path, position)
  select item->>'name', coalesce(item->>'website', ''), coalesce(item->>'logo', ''), ordinal::integer - 1
  from jsonb_array_elements(p_affiliates) with ordinality as affiliate(item, ordinal);
end;
$$;

revoke all on function public.replace_public_site_links(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_public_site_links(jsonb, jsonb) to service_role;
