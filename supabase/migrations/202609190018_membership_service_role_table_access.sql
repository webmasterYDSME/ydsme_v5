-- Two tables added earlier today were created without the server's own access to them, so the
-- website could not read them: the Old records page failed, and the Inbox check for a stopped
-- daily job silently saw nothing. The website's server role now has the access it needs.
grant select on public.membership_daily_runs to service_role;
grant select, update on public.membership_retention_settings to service_role;
