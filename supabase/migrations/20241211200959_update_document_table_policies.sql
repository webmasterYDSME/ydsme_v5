drop policy "Insert, update and delete access to authenticated  flreew_0" on "storage"."objects";

drop policy "Insert, update and delete access to authenticated  flreew_1" on "storage"."objects";

drop policy "Insert, update and delete access to authenticated  flreew_2" on "storage"."objects";

create policy "Allow committees and admin to upload flreew_0"
on "storage"."objects"
as permissive
for insert
to authenticated
with check (((bucket_id = 'documents'::text) AND (authorize('moderator.create'::app_permission) OR authorize('committee.create'::app_permission) OR authorize('read-only-committee.create'::app_permission) OR authorize('administrator.create'::app_permission))));


create policy "Allow committees and admin to upload flreew_1"
on "storage"."objects"
as permissive
for update
to authenticated
using (((bucket_id = 'documents'::text) AND (authorize('moderator.create'::app_permission) OR authorize('committee.create'::app_permission) OR authorize('read-only-committee.create'::app_permission) OR authorize('administrator.create'::app_permission))));


create policy "Allow committees and admin to upload flreew_2"
on "storage"."objects"
as permissive
for delete
to authenticated
using (((bucket_id = 'documents'::text) AND (authorize('moderator.create'::app_permission) OR authorize('committee.create'::app_permission) OR authorize('read-only-committee.create'::app_permission) OR authorize('administrator.create'::app_permission))));



