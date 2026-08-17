create policy "Insert, update and delete access to authenticated  flreew_0"
on "storage"."objects"
as permissive
for insert
to authenticated
with check ((bucket_id = 'documents'::text));


create policy "Insert, update and delete access to authenticated  flreew_1"
on "storage"."objects"
as permissive
for update
to authenticated
using ((bucket_id = 'documents'::text));


create policy "Insert, update and delete access to authenticated  flreew_2"
on "storage"."objects"
as permissive
for delete
to authenticated
using ((bucket_id = 'documents'::text));


create policy "Select access to authenticated members flreew_0"
on "storage"."objects"
as permissive
for select
to authenticated
using ((bucket_id = 'documents'::text));



