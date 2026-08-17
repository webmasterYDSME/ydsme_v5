/* drop function if exists "storage"."operation"();

alter table "storage"."objects" drop column "user_metadata";

alter table "storage"."s3_multipart_uploads" drop column "user_metadata"; */

create policy "Allow all to access the images 1ffg0oo_0"
on "storage"."objects"
as permissive
for select
to public
using ((bucket_id = 'images'::text));


create policy "Only authenticated user can upload 1ffg0oo_0"
on "storage"."objects"
as permissive
for insert
to authenticated
with check ((bucket_id = 'images'::text));


create policy "Only authenticated user can upload 1ffg0oo_1"
on "storage"."objects"
as permissive
for update
to authenticated
using ((bucket_id = 'images'::text));


create policy "Only authenticated user can upload 1ffg0oo_2"
on "storage"."objects"
as permissive
for delete
to authenticated
using ((bucket_id = 'images'::text));



