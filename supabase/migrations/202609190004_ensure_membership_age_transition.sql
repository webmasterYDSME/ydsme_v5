-- Records one member's age-related membership change (Junior or Student to Adult,
-- Adult to Concession) for a year on demand. Until now the change was only recorded
-- when renewals were opened for that member or by the November job, so an officer
-- taking a cash or cheque payment earlier was offered the old type's fee.
-- It never changes or replaces a change that already exists (for example one that is
-- awaiting a Student decision or has been approved), and sends no notification.
create or replace function public.ensure_membership_age_transition(p_member_id uuid, p_year integer)
returns void language plpgsql security invoker set search_path='' as $$
declare m public.members; target_plan uuid; age integer;
begin
 if p_year not between 2020 and 2200 then raise exception 'membership_transition_year_invalid'; end if;
 select * into m from public.members where id=p_member_id;
 if not found or m.date_of_birth is null or m.current_plan_id is null
  or m.effective_state not in ('active','grace','payment_review','lapsed') then return; end if;
 age:=public.membership_age_on(m.date_of_birth,make_date(p_year,1,1));
 select target.id into target_plan from public.membership_plans current_plan
  join public.membership_plans target on target.slug=case
   when current_plan.slug='junior' and age>=18 then 'adult'
   when current_plan.slug='student' and age>=25 then 'adult'
   when current_plan.slug='adult' and age>=80 then 'concession'
   else null end and target.active
  where current_plan.id=m.current_plan_id;
 if target_plan is null then return; end if;
 insert into public.membership_plan_transitions(member_id,membership_year,from_plan_id,to_plan_id,reason,status,effective_on)
 values(m.id,p_year,m.current_plan_id,target_plan,'age','scheduled',make_date(p_year,1,1))
 on conflict(member_id,membership_year) do nothing;
end $$;
revoke all on function public.ensure_membership_age_transition(uuid,integer) from public,anon,authenticated;
grant execute on function public.ensure_membership_age_transition(uuid,integer) to service_role;
