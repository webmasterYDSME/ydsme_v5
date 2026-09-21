import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { readLocalSupabaseEnvironment } from "./local-supabase.mjs";

/** Runs a block of SQL inside a transaction that is always rolled back, so nothing is left in the local database. */
function runRolledBack(purpose, body) {
  readLocalSupabaseEnvironment(purpose);
  const sql = `begin;\n${body}\nrollback;`;
  const result = spawnSync("docker", ["exec", "-i", "supabase_db_ydsme_v5", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("a returning member pays the part-year fee, the same as a new member, and only for the current year", () => {
  runRolledBack("Returning member fee database test", String.raw`
do $test$
declare
  adult uuid; lapsed uuid; grace uuid;
begin
  select id into adult from public.membership_plans where slug='adult';
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Returning Lapsed','ret-lapsed@example.test',adult,'lapsed','officer') returning id into lapsed;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Returning Grace','ret-grace@example.test',adult,'grace','officer') returning id into grace;

  -- Lapsed and paying for the current year: the annual fee times the months left, and December is a full year.
  if public.membership_returning_member_fee_pence(lapsed,2026,6000,date '2026-09-15')<>2000 then raise exception 'September should be four twelfths'; end if;
  if public.membership_returning_member_fee_pence(lapsed,2026,6000,date '2026-02-01')<>5500 then raise exception 'February should be eleven twelfths'; end if;
  if public.membership_returning_member_fee_pence(lapsed,2026,6000,date '2026-01-05')<>6000 then raise exception 'January is the full fee'; end if;
  if public.membership_returning_member_fee_pence(lapsed,2026,6000,date '2026-12-10')<>6000 then raise exception 'December is the full fee'; end if;
  -- It is the same rule new members are charged by.
  if public.membership_returning_member_fee_pence(lapsed,2026,6000,date '2026-09-15')<>public.prorated_membership_fee_pence(6000,date '2026-09-15') then raise exception 'not the new-member rule'; end if;
  -- A member still in grace, or paying for a different year than the one they are in, pays the full fee.
  if public.membership_returning_member_fee_pence(grace,2026,6000,date '2026-09-15')<>6000 then raise exception 'a member in grace pays the full fee'; end if;
  if public.membership_returning_member_fee_pence(lapsed,2027,6000,date '2026-09-15')<>6000 then raise exception 'next year is the full fee'; end if;
  if public.membership_returning_member_fee_pence(lapsed,2025,6000,date '2026-09-15')<>6000 then raise exception 'a past year is the full fee'; end if;
end $test$;`);
});

test("an officer can send a lapsed member a new 30 day link, and only in the cases the rules allow", () => {
  runRolledBack("New renewal link database test", String.raw`
do $test$
declare
  adult uuid; officer uuid:=gen_random_uuid(); plain uuid:=gen_random_uuid(); lapsed uuid; active_m uuid; noemail uuid; paid uuid; y integer; today date:=(now() at time zone 'Europe/London')::date;
  expires timestamptz; email_body text; notice record; old_hash text:=md5('old-link')||md5('old-link'); failed boolean; code text;
begin
  y:=public.membership_billing_year(today);
  select id into adult from public.membership_plans where slug='adult';
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
   (officer,'authenticated','authenticated','link-officer-'||officer||'@example.invalid',now(),'{"full_name":"Link Officer"}',now(),now()),
   (plain,'authenticated','authenticated','link-plain-'||plain||'@example.invalid',now(),'{"full_name":"Link Member"}',now(),now());
  update public.user_roles set role='administrator' where user_id=officer;
  if not exists(select 1 from public.membership_plan_prices p where p.plan_id=adult and p.membership_year=y and p.active) then
    insert into public.membership_plan_prices(plan_id,membership_year,version,amount_pence,active)
     select adult,y,coalesce(max(version),0)+1,6000,true from public.membership_plan_prices where plan_id=adult and membership_year=y;
  end if;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Link Lapsed','link-lapsed@example.test',adult,'lapsed','officer') returning id into lapsed;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Link Active','link-active@example.test',adult,'active','officer') returning id into active_m;
  insert into public.members(full_name,current_plan_id,effective_state,source) values('Link No Email',adult,'lapsed','officer') returning id into noemail;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Link Paid','link-paid@example.test',adult,'lapsed','officer') returning id into paid;

  -- Renewals not open yet.
  delete from public.membership_renewal_campaigns where membership_year=y;
  failed:=false; begin perform public.reissue_membership_renewal_link(lapsed,y,officer,'tok-'||md5('a')||md5('a'),md5('a')||md5('a')); exception when others then failed:=true; code:=sqlerrm; end;
  if not failed or code not like '%membership_link_campaign_closed%' then raise exception 'closed renewals were not refused: %',code; end if;
  insert into public.membership_renewal_campaigns(membership_year,open,opened_by) values(y,true,officer);

  -- Refusals.
  failed:=false; begin perform public.reissue_membership_renewal_link(lapsed,y,plain,'tok-'||md5('b')||md5('b'),md5('b')||md5('b')); exception when others then failed:=true; code:=sqlerrm; end;
  if not failed or code not like '%membership_link_not_allowed%' then raise exception 'a non-officer was allowed: %',code; end if;
  failed:=false; begin perform public.reissue_membership_renewal_link(lapsed,y+1,officer,'tok-'||md5('c')||md5('c'),md5('c')||md5('c')); exception when others then failed:=true; code:=sqlerrm; end;
  if not failed or code not like '%membership_link_year_invalid%' then raise exception 'the wrong year was allowed: %',code; end if;
  failed:=false; begin perform public.reissue_membership_renewal_link(active_m,y,officer,'tok-'||md5('d')||md5('d'),md5('d')||md5('d')); exception when others then failed:=true; code:=sqlerrm; end;
  if not failed or code not like '%membership_link_member_unavailable%' then raise exception 'an active member was allowed: %',code; end if;
  failed:=false; begin perform public.reissue_membership_renewal_link(noemail,y,officer,'tok-'||md5('e')||md5('e'),md5('e')||md5('e')); exception when others then failed:=true; code:=sqlerrm; end;
  if not failed or code not like '%membership_link_no_email%' then raise exception 'a member with no email was allowed: %',code; end if;
  insert into public.membership_terms(member_id,plan_price_id,membership_year,starts_on,ends_on,grace_ends_on,status,amount_due_pence,amount_paid_pence,source)
   values(paid,(select id from public.membership_plan_prices where plan_id=adult and membership_year=y and active limit 1),y,make_date(y,1,1),make_date(y,12,31),make_date(y+1,3,1),'paid',100,100,'officer');
  failed:=false; begin perform public.reissue_membership_renewal_link(paid,y,officer,'tok-'||md5('f')||md5('f'),md5('f')||md5('f')); exception when others then failed:=true; code:=sqlerrm; end;
  if not failed or code not like '%membership_link_member_unavailable%' then raise exception 'a member who has paid was allowed: %',code; end if;

  -- The member's old link ended with the grace period, and an old invitation email is still waiting in the queue.
  insert into public.membership_renewal_invitations(member_id,membership_year,token_hash,expires_at) values(lapsed,y,old_hash,now()-interval '5 days');
  insert into public.membership_notifications(member_id,recipient_email,kind,title,body,action_href,portal_visible,deduplication_key)
   values(lapsed,'link-lapsed@example.test','membership.renewal-invitation','Renew','Please renew','/membership/renew?token=oldtoken',false,'renewal-invitation-'||lapsed||'-'||y);

  expires:=public.reissue_membership_renewal_link(lapsed,y,officer,'the-new-token-'||md5('g')||md5('g'),md5('g')||md5('g'));

  -- 30 days, counting today: the link works through the whole of the 30th day, then stops at the start of the 31st.
  if expires<>((today+31)::timestamp) at time zone 'Europe/London' then raise exception 'unexpected expiry %',expires; end if;
  if (select expires_at from public.membership_renewal_invitations where member_id=lapsed and membership_year=y)<>expires then raise exception 'invitation expiry not stored'; end if;
  if (select token_hash from public.membership_renewal_invitations where member_id=lapsed and membership_year=y)<>md5('g')||md5('g') then raise exception 'the link was not replaced'; end if;
  if (select count(*) from public.membership_renewal_invitations where member_id=lapsed and membership_year=y)<>1 then raise exception 'more than one invitation'; end if;
  if (select email_status from public.membership_notifications where deduplication_key='renewal-invitation-'||lapsed||'-'||y)<>'cancelled' then raise exception 'the old invitation email was not cancelled'; end if;

  select * into notice from public.membership_notifications where member_id=lapsed and deduplication_key like 'renewal-link-%';
  if notice.id is null then raise exception 'no email was queued'; end if;
  if notice.delivery_class<>'immediate' then raise exception 'the new link email should not wait in the bulk queue: %',notice.delivery_class; end if;
  if notice.recipient_email<>'link-lapsed@example.test' or notice.action_href<>'/membership/renew?token=the-new-token-'||md5('g')||md5('g') then raise exception 'wrong address or link'; end if;
  if notice.body not like '%has lapsed%' or notice.body not like '%The link works until '||extract(day from today+30)::integer||' %' then raise exception 'the email does not explain or give the last day: %',notice.body; end if;
  if not exists(select 1 from public.audit_logs where action='membership.renewal-link-reissued' and entity_id=lapsed::text and actor_user_id=officer) then raise exception 'not audited'; end if;

  -- Sending again replaces the link again, and never shortens it.
  update public.membership_renewal_invitations set expires_at=expires+interval '400 days' where member_id=lapsed and membership_year=y;
  perform public.reissue_membership_renewal_link(lapsed,y,officer,'a-later-token-'||md5('h')||md5('h'),md5('h')||md5('h'));
  if (select expires_at from public.membership_renewal_invitations where member_id=lapsed and membership_year=y)<>expires+interval '400 days' then raise exception 'a longer link was shortened'; end if;

  if has_function_privilege('authenticated','public.reissue_membership_renewal_link(uuid,integer,uuid,text,text)','execute') then raise exception 'signed-in users can send links'; end if;
end $test$;`);
});

test("both ways of recording a renewal expect the returning member's part-year fee, and the card payment uses the checkout's month", () => {
  runRolledBack("Returning member payment database test", String.raw`
do $test$
declare
  adult uuid; officer uuid:=gen_random_uuid(); lapsed uuid; grace uuid; card uuid; price uuid; annual integer; prorated integer;
  y integer:=extract(year from (now() at time zone 'Europe/London'))::integer; today date:=(now() at time zone 'Europe/London')::date;
  failed boolean; code text; quote_fee integer; body text; attempt uuid; oct_fee integer;
begin
  select id into adult from public.membership_plans where slug='adult';
  insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
   values(officer,'authenticated','authenticated','pay-officer-'||officer||'@example.invalid',now(),'{"full_name":"Pay Officer"}',now(),now());
  update public.user_roles set role='administrator' where user_id=officer;
  select id,amount_pence into price,annual from public.membership_plan_prices where plan_id=adult and membership_year=y and active order by version desc limit 1;
  if price is null then
    insert into public.membership_plan_prices(plan_id,membership_year,version,amount_pence,active)
     select adult,y,coalesce(max(version),0)+1,6000,true from public.membership_plan_prices where plan_id=adult and membership_year=y returning id,amount_pence into price,annual;
  end if;
  prorated:=public.prorated_membership_fee_pence(annual,today);
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Pay Lapsed','pay-lapsed@example.test',adult,'lapsed','officer') returning id into lapsed;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Pay Grace','pay-grace@example.test',adult,'grace','officer') returning id into grace;
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Pay Card','pay-card@example.test',adult,'lapsed','officer') returning id into card;

  -- The email quotes the part-year fee and says why.
  select fee_pence into quote_fee from public.membership_renewal_quote(lapsed,y);
  if quote_fee<>prorated then raise exception 'the quote is % not %',quote_fee,prorated; end if;
  body:=public.membership_renewal_fee_text(lapsed,y);
  if (prorated<annual) <> (body like '%part-year fee for a returning member%') then raise exception 'the fee text does not explain the part-year fee: %',body; end if;
  if (select fee_pence from public.membership_renewal_quote(grace,y))<>annual then raise exception 'a member in grace was quoted a part-year fee'; end if;
  if (select fee_pence from public.membership_renewal_quote(lapsed,y+1)) is not null and (select fee_pence from public.membership_renewal_quote(lapsed,y+1))<>(select amount_pence from public.membership_plan_prices where plan_id=adult and membership_year<=y+1 and active order by membership_year desc,version desc limit 1) then raise exception 'next year is not the full fee'; end if;

  -- Cash, cheque or bank transfer: the full fee is refused for a lapsed member (when there is a discount) and the part-year fee is accepted.
  if prorated<annual then
    failed:=false; begin perform * from public.activate_offline_membership_renewal(lapsed,price,y,'cash',annual,today,'CASH-1',officer); exception when others then failed:=true; code:=sqlerrm; end;
    if not failed or code not like '%membership_renewal_amount_invalid%' then raise exception 'the full fee was accepted from a lapsed member: %',code; end if;
  end if;
  perform * from public.activate_offline_membership_renewal(lapsed,price,y,'cash',prorated,today,'CASH-2',officer);
  if (select effective_state from public.members where id=lapsed)<>'active' then raise exception 'the returning member was not reinstated'; end if;
  if (select amount_paid_pence from public.membership_terms where member_id=lapsed and membership_year=y)<>prorated then raise exception 'the term does not hold the amount paid'; end if;

  -- A member still in grace pays the full fee.
  failed:=false; begin perform * from public.activate_offline_membership_renewal(grace,price,y,'cash',prorated,today,'CASH-3',officer); exception when others then failed:=true; code:=sqlerrm; end;
  if prorated<annual and (not failed or code not like '%membership_renewal_amount_invalid%') then raise exception 'a member in grace was allowed the part-year fee: %',code; end if;
  perform * from public.activate_offline_membership_renewal(grace,price,y,'cash',annual,today,'CASH-4',officer);

  -- Card: the amount is checked against the month the checkout was created, not the month the payment arrives.
  oct_fee:=public.prorated_membership_fee_pence(annual,make_date(y,10,15));
  insert into public.membership_checkout_attempts(purpose,member_id,membership_year,plan_price_id,amount_pence,auto_renew,status,stripe_checkout_session_id,created_at)
   values('renewal',card,y,price,oct_fee,false,'open','cs_returning_'||card,make_timestamptz(y,10,15,12,0,0,'Europe/London')) returning id into attempt;
  failed:=false;
  begin perform * from public.activate_membership_renewal(card,price,y,'stripe',oct_fee+1,today,null,null,'cs_returning_'||card,'pi_returning_'||card,null,'cus_returning_'||card);
  exception when others then failed:=true; code:=sqlerrm; end;
  if not failed or code not like '%membership_renewal_amount_invalid%' then raise exception 'a wrong card amount was accepted: %',code; end if;
  perform * from public.activate_membership_renewal(card,price,y,'stripe',oct_fee,today,null,null,'cs_returning_'||card,'pi_returning_'||card,null,'cus_returning_'||card);
  if (select effective_state from public.members where id=card)<>'active' then raise exception 'the card payer was not reinstated'; end if;
  if (select amount_paid_pence from public.membership_terms where member_id=card and membership_year=y)<>oct_fee then raise exception 'wrong amount stored for the card payment'; end if;
end $test$;`);
});

test("the lapsed notice tells the member what to do next and has no dead button", () => {
  runRolledBack("Lapsed notice database test", String.raw`
do $test$
declare adult uuid; m uuid; n record;
begin
  select id into adult from public.membership_plans where slug='adult';
  insert into public.members(full_name,contact_email,current_plan_id,effective_state,source) values('Notice Lapsed','notice-lapsed@example.test',adult,'grace','officer') returning id into m;
  update public.members set effective_state='lapsed' where id=m;
  select * into n from public.membership_notifications where member_id=m and kind='membership.lapsed';
  if n.id is null then raise exception 'no lapsed notice'; end if;
  if n.body not like '%contact the membership officer, who will send you a new renewal link%' then raise exception 'the notice gives no next step: %',n.body; end if;
  if n.body like '%online or offline renewal can reinstate%' then raise exception 'the notice still promises an online renewal that a lapsed member cannot start'; end if;
  if n.action_href is not null then raise exception 'the notice has a button to an account the member cannot open'; end if;
end $test$;`);
});
