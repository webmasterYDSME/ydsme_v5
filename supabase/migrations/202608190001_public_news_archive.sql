-- The News page keeps a short public history of announcements after staff
-- archive them. Drafts and announcements that were never published stay
-- private, and the homepage continues to use public_announcements.

create or replace view public.public_news_announcements
with (security_barrier = true)
as
select id, title, body, published_at, updated_at
from public.announcements
where published_at is not null
  and published_at <= now()
  and lifecycle_status in ('published', 'archived');

revoke all on public.public_news_announcements from public, anon, authenticated;
grant select on public.public_news_announcements to anon, authenticated;
