-- Publish the exact railway entrance address requested for visitor navigation.
alter table public.configs
  alter column club_address set default jsonb_build_object(
    'address_line_one', 'Rear of The Pastures',
    'address_line_two', 'North Lane',
    'city', 'York',
    'postcode', 'YO24 2JE',
    'country', 'United Kingdom'
  );

update public.configs
set club_address = jsonb_build_object(
  'address_line_one', 'Rear of The Pastures',
  'address_line_two', 'North Lane',
  'city', 'York',
  'postcode', 'YO24 2JE',
  'country', 'United Kingdom'
);
