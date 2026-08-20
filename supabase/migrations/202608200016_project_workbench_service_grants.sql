-- The Workbench data layer uses the server-only Supabase client after
-- application-level authentication and ownership checks. RLS bypass does not
-- imply table privileges, so grant only the CRUD operations those actions use.
grant select, insert, update, delete on table
  public.member_projects,
  public.member_project_updates,
  public.member_project_photos,
  public.member_project_comments,
  public.member_project_follows
to service_role;
