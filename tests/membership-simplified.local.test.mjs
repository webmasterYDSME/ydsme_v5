import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readLocalSupabaseEnvironment } from './local-supabase.mjs';

test('codes, paid provisional membership, shared email, manual denial and retention are enforced locally',()=>{
 readLocalSupabaseEnvironment('simplified membership security tests');
 const sql=String.raw`
begin;
do $test$
declare
 actor uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); app uuid; app2 uuid; mem uuid; mem2 uuid;
 plan uuid; price uuid; amount integer; c integer; age_member uuid; next_year integer:=extract(year from current_date)::integer+1; claim text:=gen_random_uuid()::text;
begin
 insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at)
 values(actor,'authenticated','authenticated','simple-officer-'||actor||'@example.invalid',now(),'{"full_name":"Simplified Officer"}',now(),now());
 update public.user_roles set role='administrator' where user_id=actor;
 insert into public.membership_signup_sessions(session_hash,email,full_name,code_hash,code_expires_at)
 values(claim,'simple@example.invalid','simple','correct',now()+interval '10 minutes');
 for c in 1..5 loop
  if public.verify_membership_signup_code(claim,'wrong') then raise exception 'bad code accepted'; end if;
 end loop;
 if public.verify_membership_signup_code(claim,'correct') then raise exception 'sixth guess accepted'; end if;
 update public.membership_signup_sessions set attempts=0,code_expires_at=now()-interval '1 second' where session_hash=claim;
 if public.verify_membership_signup_code(claim,'correct') then raise exception 'expired code accepted'; end if;
 update public.membership_signup_sessions set code_expires_at=now()+interval '1 minute' where session_hash=claim;
 if not public.verify_membership_signup_code(claim,'correct') or public.verify_membership_signup_code(claim,'correct') then raise exception 'code single use failed'; end if;
 select p.id,f.id,public.prorated_membership_fee_pence(f.amount_pence,current_date) into plan,price,amount
 from public.membership_plans p join public.membership_plan_prices f on f.plan_id=p.id
 where p.slug='concession' and f.active and f.membership_year=public.membership_billing_year(current_date);
 insert into public.membership_applications(requested_plan_id,full_name,contact_email,date_of_birth,payment_method,status,email_verified_at,verification_token_hash,verification_expires_at,terms_version,terms_accepted_at,manual_verification,portal_invitation_status)
 values(plan,'First Family Member','family-'||claim||'@example.invalid','1940-01-01','stripe','awaiting_payment',now(),repeat('a',64),now()+interval '7 days','test',now(),'pending','eligible') returning id into app;
 insert into public.membership_notifications(application_id,recipient_email,kind,title,body,scheduled_for,deduplication_key)
 values(app,'family-'||claim||'@example.invalid','membership.application-payment-reminder','Pay','Pay',now()+interval '1 day',claim);
 select member_id into mem from public.activate_membership_application(app,price,'stripe',amount,
 p_stripe_checkout_session_id=>'cs_'||claim,p_stripe_customer_id=>'cus_'||claim,p_stripe_payment_intent_id=>'pi_'||claim);
 if (select effective_state from public.members where id=mem)<>'active' or (select manual_verification from public.membership_applications where id=app)<>'pending' then raise exception 'paid provisional member not active'; end if;
 if exists(select 1 from public.membership_subscriptions where member_id=mem) then raise exception 'Billing subscription created'; end if;
 if exists(select 1 from public.membership_notifications where application_id=app and email_status='queued') then raise exception 'paid applicant reminder not cancelled'; end if;
 if not public.claim_membership_portal_email(mem) then raise exception 'first member cannot claim portal'; end if;
 insert into public.membership_applications(requested_plan_id,full_name,contact_email,date_of_birth,payment_method,status,email_verified_at,verification_token_hash,verification_expires_at,terms_version,terms_accepted_at,manual_verification,portal_invitation_status)
 values(plan,'Second Family Member','family-'||claim||'@example.invalid','1940-01-01','stripe','awaiting_payment',now(),repeat('b',64),now()+interval '7 days','test',now(),'pending','eligible') returning id into app2;
 select member_id into mem2 from public.activate_membership_application(app2,price,'stripe',amount,
 p_stripe_checkout_session_id=>'cs_2'||claim,p_stripe_customer_id=>'cus_2'||claim,p_stripe_payment_intent_id=>'pi_2'||claim);
 if public.claim_membership_portal_email(mem2) then raise exception 'shared mailbox got second portal'; end if;
 begin
  perform public.review_paid_membership(app,outsider,'denied','Not authorised');
  raise exception 'outsider accepted';
 exception when others then if sqlerrm<>'membership_review_forbidden' then raise; end if; end;
 perform public.review_paid_membership(app,actor,'approved','Evidence confirmed');
 if (select effective_state from public.members where id=mem)<>'active' then raise exception 'approval removed access'; end if;
 perform public.review_paid_membership(app2,actor,'denied','Evidence was invalid');
 if (select effective_state from public.members where id=mem2)<>'suspended' then raise exception 'denied membership still active'; end if;
 if not exists(select 1 from public.membership_notifications where member_id=mem2 and kind='membership.manual-refund-officer') then raise exception 'manual refund follow-up missing'; end if;
 if not exists(select 1 from public.membership_payments where term_id in(select id from public.membership_terms where member_id=mem2) and status='paid') then raise exception 'denial fabricated an automatic refund'; end if;
 insert into public.membership_renewal_campaigns(membership_year,opened_by) values(next_year,actor)
 on conflict (membership_year) do update set open=true;
 insert into public.members(full_name,contact_role,date_of_birth,current_plan_id,effective_state,source)
 values('Junior aging into Adult','self',make_date(next_year-18,1,1),(select id from public.membership_plans where slug='junior'),'active','website') returning id into age_member;
 if not public.queue_membership_renewal_invitation(age_member,next_year,actor,claim,repeat('c',64)) then raise exception 'renewal invitation not queued'; end if;
 if public.queue_membership_renewal_invitation(age_member,next_year,actor,claim,repeat('d',64)) then raise exception 'renewal invitation duplicated'; end if;
 if not exists(select 1 from public.membership_plan_transitions t join public.membership_plans p on p.id=t.to_plan_id where t.member_id=age_member and p.slug='adult' and t.membership_year=next_year) then raise exception 'early campaign missed age-related fee transition'; end if;
 if not exists(select 1 from public.membership_notifications where member_id=age_member and kind='membership.manual-contact-officer') then raise exception 'email-less member missing manual renewal contact'; end if;
 update public.membership_signup_sessions set expires_at=now()-interval '1 second' where session_hash=claim;
 perform public.cleanup_membership_signup_drafts();
 if exists(select 1 from public.membership_signup_sessions where session_hash=claim) then raise exception 'expired draft retained'; end if;
 if not exists(select 1 from public.membership_applications where id=app) then raise exception 'paid application erased'; end if;
end $test$;
rollback;`;
 const result=spawnSync('docker',['exec','-i','supabase_db_ydsme_v5','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

test('simultaneous applications cannot duplicate one person but can share a family mailbox',async()=>{
 const {createClient}=await import('@supabase/supabase-js');
 const {randomUUID}=await import('node:crypto');
 const local=readLocalSupabaseEnvironment('membership duplicate race');
 const admin=createClient(local.API_URL,local.SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const address=`duplicate-race-${randomUUID()}@example.test`;
 const {data:plan,error}=await admin.from('membership_plans').select('id').eq('slug','adult').single();assert.equal(error,null);
 const application=(name,dob='1980-01-01')=>({requested_plan_id:plan.id,full_name:name,contact_email:address,date_of_birth:dob,payment_method:'cash',status:'awaiting_cash',email_verified_at:new Date().toISOString(),verification_token_hash:randomUUID().replaceAll('-','').repeat(2),verification_expires_at:new Date(Date.now()+86400000).toISOString(),terms_version:'test',terms_accepted_at:new Date().toISOString(),auto_renew:false});
 try {
  const results=await Promise.all([admin.from('membership_applications').insert(application('Same Person')),admin.from('membership_applications').insert(application('  same   PERSON  '))]);
  assert.equal(results.filter(result=>!result.error).length,1);
  assert.match(results.find(result=>result.error).error.message,/membership_identity_already_exists/);
  const differentBirth=await admin.from('membership_applications').insert(application('Same Person','1981-02-02'));
  assert.match(differentBirth.error?.message ?? '',/membership_identity_already_exists/);
  assert.equal((await admin.from('membership_applications').insert(application('Other Family Member'))).error,null);
 } finally { assert.equal((await admin.from('membership_applications').delete().eq('contact_email',address)).error,null); }
});
