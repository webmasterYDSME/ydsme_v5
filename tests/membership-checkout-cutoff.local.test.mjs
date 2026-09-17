import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {readLocalSupabaseEnvironment} from './local-supabase.mjs';

test('delayed paid November checkout retains its quoted fee/year and is idempotent',()=>{
 readLocalSupabaseEnvironment('December cutoff database test');
 const sql=String.raw`
begin;
do $test$
declare p uuid; price uuid; app uuid; member uuid; term uuid; paid uuid; year integer:=extract(year from now())::integer-1;
 quoted_at timestamptz; paid_at timestamptz; session text:='cs_cutoff_'||replace(gen_random_uuid()::text,'-','');
begin
 quoted_at:=make_timestamptz(year,11,30,22,0,0,'Europe/London');
 paid_at:=make_timestamptz(year,11,30,23,59,59,'Europe/London');
 select id into p from public.membership_plans where slug='adult';
 insert into public.membership_plan_prices(plan_id,membership_year,version,amount_pence,active)
 values(p,year,(select coalesce(max(version),0)+1 from public.membership_plan_prices where plan_id=p and membership_year=year),6000,false) returning id into price;
 insert into public.membership_applications(requested_plan_id,full_name,contact_email,date_of_birth,payment_method,status,auto_renew,email_verified_at,verification_token_hash,verification_expires_at,expires_at,terms_version,terms_accepted_at,created_at)
 values(p,'Cutoff test member',session||'@example.test','1980-01-01','stripe','expired',false,quoted_at,repeat('e',64),quoted_at+interval '7 days',quoted_at+interval '30 days','test',quoted_at,quoted_at) returning id into app;
 insert into public.membership_checkout_attempts(purpose,application_id,membership_year,plan_price_id,amount_pence,auto_renew,status,stripe_checkout_session_id,created_at,expires_at)
 values('application',app,year,price,1000,false,'expired',session,quoted_at,make_timestamptz(year,12,1,0,0,0,'Europe/London'));
 begin
  perform public.activate_membership_application_checkout(app,price,'stripe',6000,p_stripe_checkout_session_id=>session,p_stripe_payment_intent_id=>'pi_cutoff',p_stripe_customer_id=>'cus_cutoff',p_stripe_event_created_at=>paid_at);
  raise exception 'mismatched quote accepted';
 exception when others then if sqlerrm<>'membership_checkout_quote_mismatch' then raise; end if; end;
 select member_id,term_id,payment_id into member,term,paid from public.activate_membership_application_checkout(app,price,'stripe',1000,p_stripe_checkout_session_id=>session,p_stripe_payment_intent_id=>'pi_cutoff',p_stripe_customer_id=>'cus_cutoff',p_stripe_event_created_at=>paid_at);
 if not exists(select 1 from public.membership_terms where id=term and membership_year=year and amount_paid_pence=1000 and starts_on=paid_at::date and ends_on=make_date(year,12,31)) then raise exception 'late event repriced the paid term'; end if;
 perform public.activate_membership_application_checkout(app,price,'stripe',1000,p_stripe_checkout_session_id=>session,p_stripe_payment_intent_id=>'pi_cutoff',p_stripe_customer_id=>'cus_cutoff',p_stripe_event_created_at=>paid_at);
 if (select count(*) from public.membership_payments where term_id=term)<>1 then raise exception 'late replay duplicated payment'; end if;
 if current_date>=make_date(year+1,3,1) and (select effective_state from public.members where id=member)<>'lapsed' then raise exception 'late delivery extended expired coverage'; end if;
 if (select status from public.membership_applications where id=app)<>'converted' then raise exception 'paid expired application not recovered'; end if;
 if has_function_privilege('authenticated','public.activate_membership_application_checkout(uuid,uuid,text,integer,uuid,text,text,text,text,text,text,text,boolean,timestamptz,timestamptz)','execute') then raise exception 'public activation allowed'; end if;
end $test$;
rollback;`;
 const result=spawnSync('docker',['exec','-i','supabase_db_ydsme_v5','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});
