create type "public"."file_category" as enum ('publication', 'minute', 'insurance-policy', 'club-rule', 'calendar', 'boiler-guide');

drop trigger if exists "trigger_delete_banner_url" on "public"."events";

drop function if exists "public"."delete_banner_url"();

create table "public"."documents" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null default ''::text,
    "descriptions" text not null default ''::text,
    "category" file_category not null,
    "file_url" text not null default ''::text,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid()
);


alter table "public"."documents" enable row level security;

alter table "public"."events" drop column "banner_url";

alter table "public"."events" add column "file_url" text not null default ''::text;

CREATE UNIQUE INDEX documents_name_key ON public.documents USING btree (name);

CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id);

alter table "public"."documents" add constraint "documents_pkey" PRIMARY KEY using index "documents_pkey";

alter table "public"."documents" add constraint "documents_name_key" UNIQUE using index "documents_name_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.delete_file_url()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Extract the bucket_id and file path from the file_url
    DECLARE bucket_name TEXT;
    DECLARE file_path TEXT;
BEGIN
    -- Extract the bucket_id (first part) and the file_path (remaining part)
    bucket_name := split_part(OLD.file_url, '/', 1);
    file_path := substring(OLD.file_url from length(bucket_name) + 2); -- Remove "bucket/"

    -- Dynamically construct the DELETE command for your storage
    DELETE FROM storage.objects
    WHERE bucket_id = bucket_name AND name = file_path;

    RETURN OLD;
END;
END;
$function$
;

grant delete on table "public"."documents" to "anon";

grant insert on table "public"."documents" to "anon";

grant references on table "public"."documents" to "anon";

grant select on table "public"."documents" to "anon";

grant trigger on table "public"."documents" to "anon";

grant truncate on table "public"."documents" to "anon";

grant update on table "public"."documents" to "anon";

grant delete on table "public"."documents" to "authenticated";

grant insert on table "public"."documents" to "authenticated";

grant references on table "public"."documents" to "authenticated";

grant select on table "public"."documents" to "authenticated";

grant trigger on table "public"."documents" to "authenticated";

grant truncate on table "public"."documents" to "authenticated";

grant update on table "public"."documents" to "authenticated";

grant delete on table "public"."documents" to "service_role";

grant insert on table "public"."documents" to "service_role";

grant references on table "public"."documents" to "service_role";

grant select on table "public"."documents" to "service_role";

grant trigger on table "public"."documents" to "service_role";

grant truncate on table "public"."documents" to "service_role";

grant update on table "public"."documents" to "service_role";

create policy "Enable delete for committees and admin"
on "public"."documents"
as permissive
for delete
to authenticated
using ((authorize('committee.create'::app_permission) OR authorize('read-only-committee.create'::app_permission) OR authorize('administrator.create'::app_permission)));


create policy "Enable insert for committees and admin"
on "public"."documents"
as permissive
for insert
to authenticated
with check ((authorize('committee.create'::app_permission) OR authorize('read-only-committee.create'::app_permission) OR authorize('administrator.create'::app_permission)));


create policy "Enable read access for all members"
on "public"."documents"
as permissive
for select
to authenticated
using (true);


CREATE TRIGGER on_delete_document AFTER DELETE ON public.documents FOR EACH ROW EXECUTE FUNCTION delete_file_url();

CREATE TRIGGER on_delete_event AFTER DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION delete_file_url();


