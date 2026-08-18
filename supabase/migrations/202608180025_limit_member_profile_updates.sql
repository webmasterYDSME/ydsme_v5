-- RLS limits rows, while column grants limit which parts of an own-profile row
-- can be changed through the public authenticated API.
revoke update on public.users from authenticated;
grant update (title, full_name, contact_number) on public.users to authenticated;
