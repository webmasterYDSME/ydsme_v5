-- The server-only data-access layer manages membership profiles. RLS bypass is
-- not itself a table privilege, so grant the service role the required DML.
grant select, insert, update, delete on public.users to service_role;
