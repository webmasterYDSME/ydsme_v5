-- All application table mutations flow through authorised Server Actions or
-- narrowly scoped RPCs. RLS remains defence in depth, while table grants stop
-- clients from changing columns that are not exposed by those interfaces.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke insert, update, delete on tables from anon, authenticated;

-- Read grants are deliberately narrow; RLS further filters these records.
grant select on public.events, public.committees, public.products, public.prices to anon;
grant select on public.events, public.committees, public.products, public.prices,
  public.documents, public.feeds, public.participants, public.workshops,
  public.subscriptions, public.users to authenticated;
