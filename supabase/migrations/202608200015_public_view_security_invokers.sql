-- Public projections must enforce the caller's table privileges and RLS
-- policies. Grant only the columns required by each projection so switching
-- the views to security_invoker does not expose operational fields.

alter view public.public_site_links set (security_invoker = true);
alter view public.public_events set (security_invoker = true);
alter view public.public_committee_roster set (security_invoker = true);
alter view public.public_announcements set (security_invoker = true);
alter view public.public_site_config set (security_invoker = true);
alter view public.public_member_event_teasers set (security_invoker = true);
alter view public.public_news_announcements set (security_invoker = true);
alter view public.public_membership_plans set (security_invoker = true);

grant select (name, url, position)
  on public.site_social_links to anon, authenticated;
grant select (name, url, logo_path, position)
  on public.site_affiliates to anon, authenticated;

grant select (
  id, name, descriptions, file_url, start_date, end_date, start_time, end_time,
  event_type, display_in_homepage, is_ticket_required, reservation_link,
  booking_enabled, booking_mode, booking_capacity, lifecycle_status,
  public_teaser_enabled
) on public.events to anon, authenticated;

drop policy if exists ydsme_events_public_read on public.events;
create policy ydsme_events_public_read
on public.events
for select
to anon, authenticated
using (
  (event_type = 'public' and lifecycle_status = 'published')
  or (
    event_type = 'member_only'
    and lifecycle_status = 'published'
    and public_teaser_enabled = true
  )
);

grant select (id, name, title, file_url, email)
  on public.committees to anon, authenticated;

grant select (id, title, body, published_at, updated_at, lifecycle_status)
  on public.announcements to anon, authenticated;

create policy ydsme_announcements_public_read
on public.announcements
for select
to anon, authenticated
using (
  published_at is not null
  and published_at <= now()
  and lifecycle_status in ('published', 'archived')
);

-- Replace the legacy authenticated table-wide grant with the deliberately
-- public configuration fields used by public_site_config.
revoke all on public.configs from anon, authenticated;
grant select (
  id, short_name, full_name, registered_name, company_no, website, email,
  telephone, club_address, registered_address
) on public.configs to anon, authenticated;

create policy ydsme_configs_public_read
on public.configs
for select
to anon, authenticated
using (true);

grant select (
  id, slug, name, description, minimum_age, maximum_age, requires_approval,
  active
) on public.membership_plans to anon, authenticated;
grant select (
  plan_id, membership_year, amount_pence, currency, active
) on public.membership_plan_prices to anon, authenticated;

create policy ydsme_membership_plans_public_read
on public.membership_plans
for select
to anon, authenticated
using (active);

create policy ydsme_membership_plan_prices_public_read
on public.membership_plan_prices
for select
to anon, authenticated
using (
  active
  and membership_year = public.membership_billing_year(current_date)
);
