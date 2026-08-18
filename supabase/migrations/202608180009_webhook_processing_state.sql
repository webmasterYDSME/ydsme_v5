-- Make webhook claims recoverable: a concurrent replay must not acknowledge an
-- event until the first worker has completed its idempotent domain writes.
alter table public.stripe_webhook_events
  add column if not exists processing_status text,
  add column if not exists claimed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists last_error text;

update public.stripe_webhook_events
set processing_status = 'processed',
    claimed_at = coalesce(claimed_at, processed_at),
    completed_at = coalesce(completed_at, processed_at)
where processing_status is null;

alter table public.stripe_webhook_events
  alter column processing_status set default 'processing',
  alter column processing_status set not null,
  alter column claimed_at set default now();

alter table public.stripe_webhook_events
  drop constraint if exists stripe_webhook_events_processing_status_check;
alter table public.stripe_webhook_events
  add constraint stripe_webhook_events_processing_status_check
  check (processing_status in ('processing', 'processed', 'failed'));

comment on column public.stripe_webhook_events.processing_status is
  'A replay receives success only after the original verified event is fully processed.';
