set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.new_document_feeds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.feeds (type, title, message, url, author_name, author_id)
  VALUES (
    'document',
    CONCAT('A new ', 
           INITCAP(
               CASE 
                   WHEN NEW.category = 'others' THEN 'Document' 
                   ELSE REPLACE(NEW.category::text, '-', ' ') 
               END
           ), 
           ' is uploaded. 📜'
    ),
    NEW.name,
    NEW.file_url,
    NULL,
    NEW.created_by
  );
  RETURN NEW;
END;
$function$
;

create policy "Enable delete for admin, mod and committees"
on "public"."feeds"
as permissive
for delete
to public
using ((authorize('moderator.delete'::app_permission) OR authorize('committee.delete'::app_permission) OR authorize('read-only-committee.delete'::app_permission) OR authorize('administrator.delete'::app_permission)));



