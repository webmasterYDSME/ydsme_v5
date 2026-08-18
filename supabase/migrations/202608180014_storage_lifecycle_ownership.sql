-- Storage now rejects direct SQL deletion by design. File lifecycle is owned by
-- authorised server actions using the Storage API, so these legacy triggers
-- both fail and duplicate the application cleanup path.
drop trigger if exists on_delete_document on public.documents;
drop trigger if exists on_delete_event on public.events;
drop function if exists public.delete_file_url();
