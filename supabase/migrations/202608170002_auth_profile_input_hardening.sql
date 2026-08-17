create or replace function public.handle_new_user()
returns trigger
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  birthday_text text := nullif(btrim(metadata->>'birthday'), '');
  agreement_text text := lower(nullif(btrim(metadata->>'club_rules_agreement'), ''));
begin
  insert into public.users (
    id,
    title,
    full_name,
    email,
    birthday,
    contact_number,
    avatar_url,
    billing_address,
    club_rules_agreement
  )
  values (
    new.id,
    coalesce(metadata->>'title', ''),
    nullif(btrim(metadata->>'full_name'), ''),
    new.email,
    case when birthday_text is null then null else birthday_text::date end,
    nullif(btrim(metadata->>'contact_number'), ''),
    nullif(btrim(metadata->>'avatar_url'), ''),
    case
      when jsonb_typeof(metadata->'billing_address') = 'object'
        then metadata->'billing_address'
      else null
    end,
    case
      when agreement_text in ('true', 'false') then agreement_text::boolean
      else false
    end
  );

  return new;
end;
$$ language plpgsql security definer;
