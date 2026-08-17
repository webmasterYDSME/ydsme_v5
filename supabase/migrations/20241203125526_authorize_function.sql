set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission app_permission)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  bind_permissions int;
  user_role public.app_role;
begin
  -- Fetch user role once and store it to reduce number of calls
  select (auth.jwt() ->> 'user_role')::public.app_role into user_role;

  select count(*)
  into bind_permissions
  from public.role_permissions
  where role_permissions.permission = requested_permission
    and role_permissions.role = user_role;

  return bind_permissions > 0;
end;
$function$
;

--authorize committee and administrator to update member's role
create policy "Enable update for committee and administrator"
on "public"."user_roles"
as permissive
for update
to authenticated
using ((authorize('committee.update'::app_permission) OR authorize('administrator.update'::app_permission)));

create policy "Enable select for committee and administrator"
on "public"."user_roles"
as permissive
for select
to authenticated
using ((authorize('committee.select'::app_permission) OR authorize('administrator.select'::app_permission) OR authorize('read-only-committee.select'::app_permission)));


create policy "Enable select for committee and administrator"
on "public"."users"
as permissive
for select
to authenticated
using ((authorize('committee.select'::app_permission) OR authorize('administrator.select'::app_permission) OR authorize('read-only-committee.select'::app_permission)));

