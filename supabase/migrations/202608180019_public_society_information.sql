-- Keep the railway site and registered office distinct, and publish only the
-- Society fields that are intended to appear on the public website.
alter table public.configs
  add column if not exists email text not null default 'secretary@yorkmodelengineers.co.uk',
  add column if not exists club_address jsonb not null default jsonb_build_object(
    'address_line_one', 'Rear of The Pastures',
    'address_line_two', 'North Lane',
    'city', 'York',
    'postcode', 'YO24 2JE',
    'country', 'United Kingdom'
  );

create or replace view public.public_site_config
with (security_invoker = false, security_barrier = true)
as
  select
    short_name,
    full_name,
    registered_name,
    company_no,
    website,
    email,
    telephone,
    club_address,
    registered_address
  from public.configs
  order by id
  limit 1;

revoke all on public.configs from anon;
grant select on public.public_site_config to anon, authenticated;
