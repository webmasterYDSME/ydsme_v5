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
  delete from public.site_social_links;
  insert into public.site_social_links (name, url, position)
  select item->>'name', coalesce(item->>'link', ''), ordinal::integer - 1
  from jsonb_array_elements(p_socials) with ordinality as link(item, ordinal);

  delete from public.site_affiliates;
  insert into public.site_affiliates (name, url, logo_path, position)
  select item->>'name', coalesce(item->>'website', ''), coalesce(item->>'logo', ''), ordinal::integer - 1
  from jsonb_array_elements(p_affiliates) with ordinality as affiliate(item, ordinal);
end;
$$;

create or replace function public.replace_donation_campaigns(
  p_generic jsonb,
  p_target jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.donation_campaigns (kind, enabled, title, description, button_label, target_pence, updated_at)
  values
    ('generic', coalesce((p_generic->>'enabled')::boolean, false), p_generic->>'title', p_generic->>'description', p_generic->>'buttonLabel', 0, now()),
    ('target', coalesce((p_target->>'enabled')::boolean, false), p_target->>'title', p_target->>'description', p_target->>'buttonLabel', coalesce((p_target->>'targetPence')::bigint, 0), now())
  on conflict (kind) do update set
    enabled = excluded.enabled,
    title = excluded.title,
    description = excluded.description,
    button_label = excluded.button_label,
    target_pence = excluded.target_pence,
    updated_at = now();
end;
$$;

revoke all on function public.replace_public_site_links(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.replace_donation_campaigns(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_public_site_links(jsonb, jsonb) to service_role;
grant execute on function public.replace_donation_campaigns(jsonb, jsonb) to service_role;
