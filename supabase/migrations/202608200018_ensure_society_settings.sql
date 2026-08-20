-- A fresh database has the configuration schema but no row because the
-- original project populated it manually. Ensure every environment has the
-- singleton record required by the settings editor and public projections.

do $$
declare
  inserted_count integer;
begin
insert into public.configs (
  short_name,
  full_name,
  registered_name,
  company_no,
  website,
  email,
  telephone,
  club_address,
  registered_address,
  settings,
  socials,
  affiliates,
  contacts
)
select
  'YCDSME',
  'York City & District Society of Model Engineers',
  'York City & District Society of Model Engineers Limited',
  '26478R',
  'https://www.yorkmodelengineers.co.uk',
  'secretary@yorkmodelengineers.co.uk',
  '',
  jsonb_build_object(
    'address_line_one', 'Rear of The Pastures',
    'address_line_two', 'North Lane',
    'city', 'York',
    'postcode', 'YO24 2JE',
    'country', 'United Kingdom'
  ),
  jsonb_build_object(
    'address_line_one', 'Hill House',
    'address_line_two', 'Stocks Hill, Huggate',
    'city', 'York',
    'postcode', 'YO42 1YQ',
    'country', 'United Kingdom'
  ),
  jsonb_build_object(
    'donations', jsonb_build_object(
      'generic', jsonb_build_object(
        'enabled', false,
        'title', 'Help keep steam in motion.',
        'description', 'Every gift helps us care for the railway, maintain the grounds and share model engineering with the next generation.',
        'buttonLabel', 'Make a donation'
      ),
      'target', jsonb_build_object(
        'enabled', false,
        'title', 'Help us reach our next milestone.',
        'description', 'Support a focused Society project and watch the campaign move closer to its goal.',
        'buttonLabel', 'Support this project',
        'targetPence', 500000
      )
    )
  ),
  array[jsonb_build_object(
    'name', 'Facebook',
    'link', 'https://www.facebook.com/YorkModelEngineers'
  )],
  array[]::jsonb[],
  array[]::jsonb[]
where not exists (select 1 from public.configs);

get diagnostics inserted_count = row_count;

if inserted_count = 1 then
insert into public.site_social_links (name, url, position)
select 'Facebook', 'https://www.facebook.com/YorkModelEngineers', 0
where not exists (select 1 from public.site_social_links);

insert into public.donation_campaigns (
  kind,
  enabled,
  title,
  description,
  button_label,
  target_pence
)
values
  (
    'generic',
    false,
    'Help keep steam in motion.',
    'Every gift helps us care for the railway, maintain the grounds and share model engineering with the next generation.',
    'Make a donation',
    0
  ),
  (
    'target',
    false,
    'Help us reach our next milestone.',
    'Support a focused Society project and watch the campaign move closer to its goal.',
    'Support this project',
    500000
  )
on conflict (kind) do nothing;
end if;
end;
$$;

comment on table public.configs is
  'Singleton Society configuration. The settings editor expects at least one row.';
