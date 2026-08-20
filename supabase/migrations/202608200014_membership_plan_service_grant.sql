-- Server-rendered public membership pages use the server-only service client;
-- the projection remains the only plan surface exposed to browser roles.
grant select on public.public_membership_plans to service_role;
