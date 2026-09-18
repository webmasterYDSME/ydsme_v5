import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import { readLocalSupabaseEnvironment } from '../local-supabase.mjs';
const local = readLocalSupabaseEnvironment('Simplified membership browser journeys');
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY);
const email='journey.membership.adult@example.test';
test.describe.configure({mode:'serial'});
test.skip(process.env.JOURNEY_MEMBERSHIP_TESTS !== 'true', 'Run with npm run test:membership-journeys.');
async function codeFor(email) {
  const list=await (await fetch('http://127.0.0.1:55324/api/v1/messages')).json();
  for(const item of list.messages ?? []) {
    if(!item.To?.some(to=>to.Address===email)) continue;
    const message=await (await fetch(`http://127.0.0.1:55324/api/v1/message/${item.ID}`)).json();
    const match=message.Text?.match(/code is (\d{6})/);
    if(match) return match[1];
  }
  return null;
}
async function begin(page, name, address, junior=false, age=null, student=false, contactNumber='', existingApplication=false) {
  await page.goto('/membership/apply');
  // DatePicker submits display dates; the visible input accepts DD/MM/YYYY.
  const dob=page.locator('input[name="date_of_birth"]');
  await dob.fill(age ? `01/01/${new Date().getUTCFullYear()-age}` : junior?'01/01/2010':'02/04/1980');
  if(student) await page.getByRole('radio',{name:/Student/}).check();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  if(junior) {
    await expect(page.getByRole('heading',{name:'Tell us who’s joining.'})).toBeVisible();
    await page.locator('[name="guardian_name"]').fill('Journey Guardian');
    await page.locator('[name="guardian_email"]').fill(address);
    await page.locator('[name="guardian_consent"]').check();
  }
  await page.locator('[name="full_name"]').fill(name);
  if(!junior) {
    await page.locator('[name="contact_email"]').fill(address);
    if(contactNumber) await page.locator('[name="contact_number"]').fill(contactNumber);
  }
  await page.getByRole('button',{name:'Get code',exact:true}).click();
  await expect(page.getByText(/Code sent/)).toBeVisible();
  await expect.poll(()=>codeFor(address)).toMatch(/^\d{6}$/);
  await page.getByLabel('Six-digit verification code').fill(await codeFor(address));
  await expect(page.getByRole('button',{name:'Verify email',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  if(existingApplication) {
    await expect(page.getByRole('status')).toContainText('already saved');
    await expect(page.getByRole('heading',{name:'How can we reach you?'})).toBeVisible();
  } else if(junior) {
    await expect(page.getByRole('heading',{name:'Check and confirm.'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Get code',exact:true})).toHaveCount(0);
  } else {
    await expect(page.getByRole('heading',{name:'Check and confirm.'})).toBeVisible();
  }
}
async function submitCash(page) {
  if(await page.getByRole('heading',{name:'How can we reach you?'}).isVisible()) {
    await page.getByRole('button',{name:'Continue',exact:true}).click();
  }
  await page.locator('[name="terms"]').check();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('[name="payment_method"][value="cash"]').check();
  await page.getByRole('button',{name:'Submit application'}).click();
  await expect(page).toHaveURL(/awaiting-cash/);
}
test('email is verified within the form and Adult submits directly for payment',async({page})=>{
  await begin(page,'Journey Membership Adult',email);
  await submitCash(page);
  const {data,error}=await admin.from('membership_applications').select('id,status,email_verified_at,auto_renew,created_at,expires_at').eq('contact_email',email).single();
  expect(error).toBeNull();expect(data.status).toBe('awaiting_cash');expect(data.email_verified_at).toBeTruthy();expect(data.auto_renew).toBe(false);
  const {data:reminder,error:reminderError}=await admin.from('membership_notifications').select('title,body,scheduled_for,email_status').eq('application_id',data.id).eq('kind','membership.application-payment-reminder').single();
  expect(reminderError).toBeNull();
  expect(reminder).toMatchObject({title:'Reminder: complete Journey Membership Adult’s Society membership payment',email_status:'queued'});
  expect(reminder.body).toContain('If you have already paid, no action is needed.');
  expect(reminder.body).toContain('This application will remain open until');
  expect(new Date(reminder.scheduled_for).getTime()-new Date(data.created_at).getTime()).toBeGreaterThan(6.99*86400000);
  expect(new Date(data.expires_at).getTime()-new Date(data.created_at).getTime()).toBeGreaterThan(29.99*86400000);
});
test('guardian-led Junior verifies only the guardian mailbox and awaits payment, not approval',async({page})=>{
  await begin(page,'Journey Membership Junior','journey.membership.junior@example.test',true);
  await submitCash(page);
  const {data,error}=await admin.from('membership_applications').select('status,guardian_led,manual_verification,guardian_contact_number,guardian_consent_version').eq('contact_email','journey.membership.junior@example.test').single();
  expect(error).toBeNull();expect(data).toMatchObject({status:'awaiting_cash',guardian_led:true,manual_verification:'pending',guardian_contact_number:null,guardian_consent_version:'2026-09-17'});
});
test('a code cannot be guessed more than five times',async({page})=>{
  await page.goto('/membership/apply');
  await page.locator('[name="date_of_birth"]').fill('02/04/1980');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('[name="full_name"]').fill('Journey Membership Guess');
  await page.locator('[name="contact_email"]').fill('journey.membership.guess@example.test');
  await page.getByRole('button',{name:'Get code',exact:true}).click();
  await expect(page.getByText(/Code sent/)).toBeVisible();
  const real=await codeFor('journey.membership.guess@example.test');
  for(let i=0;i<5;i++) {
    await page.getByLabel('Six-digit verification code').fill(real==='000000'?'111111':'000000');
    await page.getByRole('button',{name:'Continue',exact:true}).click();
    await expect(page.getByRole('status')).toContainText('incorrect');
    await expect(page.locator('.membership-verification-message')).toHaveCSS('color','rgb(165, 43, 31)');
    await expect(page.getByRole('heading',{name:'How can we reach you?'})).toBeVisible();
  }
  await page.getByLabel('Six-digit verification code').fill(real);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('incorrect');
});
test('verified drafts return without another email check',async({page})=>{
  await begin(page,'Journey Membership Draft','journey.membership.draft@example.test',false,null,false,'01904000999');
  await expect.poll(async()=>{
    const {data}=await admin.from('membership_signup_sessions').select('draft').eq('email','journey.membership.draft@example.test').single();
    return data?.draft.contact_number;
  }).toBe('01904000999');
  await page.reload();
  await expect(page.locator('[name="date_of_birth"]')).toHaveValue('02/04/1980');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.locator('[name="full_name"]')).toHaveValue('Journey Membership Draft');
  await expect(page.locator('[name="contact_number"]')).toHaveValue('01904000999');
  await expect(page.getByRole('status')).toContainText('saved application');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check and confirm.'})).toBeVisible();
});
test('same person is stopped at the saved application while a family member can proceed',async({page})=>{
  await admin.from('rate_limits').delete().in('scope',['signup-code-cooldown']);
  await begin(page,'Journey Membership Adult',email,false,null,false,'',true);
  await admin.from('rate_limits').delete().in('scope',['signup-code-cooldown']);
  await page.context().clearCookies();
  await begin(page,'Journey Membership Family',email);
  await expect(page.getByRole('heading',{name:'Check and confirm.'})).toBeVisible();
});
for (const tier of [{name:'Student',age:21,student:true},{name:'Concession',age:82,student:false}]) {
 test(tier.name+' can submit for payment without officer approval',async({page})=>{
  const address='journey.membership.'+tier.name.toLowerCase()+'@example.test';
  await begin(page,'Journey Membership '+tier.name,address,false,tier.age,tier.student);
  await submitCash(page);
  expect((await admin.from('membership_applications').select('status,manual_verification').eq('contact_email',address).single()).data).toMatchObject({status:'awaiting_cash',manual_verification:'pending'});
 });
}
test('officer records payment first and confirms Junior guardian consent afterwards',async({page})=>{
  const officer='journey.membership.officer@example.test';
  const password=process.env.JOURNEY_TEST_PASSWORD;
  const {data:created,error}=await admin.auth.admin.createUser({email:officer,password,email_confirm:true,user_metadata:{full_name:'Journey Membership Officer'}});
  expect(error).toBeNull();
  expect((await admin.from('user_roles').update({role:'administrator'}).eq('user_id',created.user.id)).error).toBeNull();
  await page.goto('/signin?method=password&next=%2Fadmin%2Fmemberships%3Fkind%3Dpayment');
  const login=page.locator('.auth-flip-back form');
  await login.locator('[name="email"]').fill(officer);await login.locator('[name="password"]').fill(password);
  await login.getByRole('button',{name:/Sign in securely/}).click();await page.waitForURL(/\/admin\/memberships/);
  await page.goto('/admin/memberships?kind=payment');
  await page.locator('article').filter({hasText:'Journey Membership Junior'}).getByRole('link').click();
  const payment=page.getByRole('dialog').locator('form').filter({hasText:'Mark paid and activate'});
  await payment.locator('[name="payment_reference"]').fill('JOURNEY-JUNIOR-CASH');
  await payment.getByRole('button',{name:'Mark paid and activate'}).click();
  await page.waitForURL(/notice=offline-payment-confirmed/);
  const {data:application}=await admin.from('membership_applications').select('id,converted_member_id,manual_verification').eq('contact_email','journey.membership.junior@example.test').single();
  expect(application.manual_verification).toBe('pending');
  const {data:cancelledReminder}=await admin.from('membership_notifications').select('email_status').eq('application_id',application.id).eq('kind','membership.application-payment-reminder').single();
  expect(cancelledReminder.email_status).toBe('cancelled');
  const {data:member}=await admin.from('members').select('effective_state,auth_user_id').eq('id',application.converted_member_id).single();
  expect(member).toMatchObject({effective_state:'active',auth_user_id:null});
  await page.goto('/admin/memberships?kind=verify');
  await page.locator('article').filter({hasText:'Journey Membership Junior'}).getByRole('link').click();
  const review=page.getByRole('dialog');
  await review.locator('[name="reason"]').fill('Spoke to guardian and confirmed consent.');
  await review.getByRole('button',{name:'Record verification'}).click();
  await page.waitForURL(/notice=verification-recorded/);
  expect((await admin.from('membership_applications').select('manual_verification').eq('contact_email','journey.membership.junior@example.test').single()).data.manual_verification).toBe('approved');
});

test('officer opens annual renewal once and guardian can use a personal link without login',async({page})=>{
 const year=new Date().getUTCFullYear()+1;
 expect((await admin.from('membership_renewal_campaigns').select('membership_year').eq('membership_year',year).maybeSingle()).data).toBeNull();
 await page.goto('/signin?method=password&next=%2Fadmin%2Fmemberships%3Fview%3Dpayments');
 const login=page.locator('.auth-flip-back form');
 await login.locator('[name="email"]').fill('journey.membership.officer@example.test');
 await login.locator('[name="password"]').fill(process.env.JOURNEY_TEST_PASSWORD);
 await login.getByRole('button',{name:/Sign in securely/}).click();await page.waitForURL(/\/admin\/memberships/);
 await page.getByRole('button',{name:'Open renewals and send invitations'}).click();
 await page.waitForURL(/notice=renewals-opened/);
 const {data:member}=await admin.from('members').select('id').eq('full_name','Journey Membership Junior').single();
 const {data:notice,error}=await admin.from('membership_notifications').select('action_href').eq('member_id',member.id).eq('kind','membership.renewal-invitation').single();
 expect(error).toBeNull();
 await page.getByRole('button',{name:'Open renewals and send invitations'}).click();await page.waitForURL(/notice=renewals-opened/);
 expect((await admin.from('membership_notifications').select('id').eq('member_id',member.id).eq('kind','membership.renewal-invitation')).data).toHaveLength(1);
 await page.context().clearCookies();await page.goto(notice.action_href);
 await expect(page.getByRole('heading',{name:'Renew your membership'})).toBeVisible();
 await expect(page.getByText('Journey Membership Junior · Membership for '+year)).toBeVisible();
 await expect(page.getByRole('button',{name:'Pay membership renewal'})).toBeVisible();
 await page.goto('/membership/renew?token='+ 'invalid'.repeat(10));
 await expect(page.getByRole('heading',{name:'This renewal link has expired'})).toBeVisible();
});
