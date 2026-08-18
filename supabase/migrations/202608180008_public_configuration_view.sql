-- The public view intentionally exposes fewer columns than its protected
-- source tables. It executes with the view owner's read privilege so callers
-- never need direct table grants.
create or replace view public.public_site_links
with (security_invoker = false, security_barrier = true)
as
  select 'social'::text as link_type, name, url, ''::text as logo_path, position
  from public.site_social_links
  union all
  select 'affiliate'::text, name, url, logo_path, position
  from public.site_affiliates;

revoke all on public.site_social_links, public.site_affiliates from anon, authenticated;
grant select on public.public_site_links to anon, authenticated;
