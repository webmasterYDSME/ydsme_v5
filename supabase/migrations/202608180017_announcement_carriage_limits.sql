alter table public.announcements
  drop constraint if exists announcements_title_check,
  drop constraint if exists announcements_body_check,
  drop constraint if exists announcements_title_length_check,
  drop constraint if exists announcements_body_length_check;

-- Preserve older announcements in full while enforcing carriage-safe limits
-- on every new or updated record.
alter table public.announcements
  add constraint announcements_title_length_check
    check (char_length(btrim(title)) between 2 and 26) not valid,
  add constraint announcements_body_length_check
    check (char_length(btrim(body)) between 2 and 120) not valid;
