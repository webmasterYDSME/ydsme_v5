alter table public.announcements
  drop constraint if exists announcements_body_check,
  drop constraint if exists announcements_body_length_check;

-- The compact three-line carriage safely accommodates a longer description.
alter table public.announcements
  add constraint announcements_body_length_check
    check (char_length(btrim(body)) between 2 and 120) not valid;
