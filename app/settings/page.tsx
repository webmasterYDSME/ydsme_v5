import { Banknote, Settings as SettingsIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  saveSiteConfig,
} from "@/lib/actions/content";
import { saveMembershipPaymentSettings } from "@/lib/actions/membership";
import { EditableLinkLists } from "@/app/components/EditableLinkLists";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { PortalTabs } from "@/app/components/PortalTabs";
import { membershipAdministrationEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; tab?: string; page?: string }>;
}) {
  const [query] = await Promise.all([searchParams, requireCapability("settings.manage")]);
  if (query.tab === "donations" || query.notice === "donations-saved") redirect("/admin/donations?view=appeals");
  if (query.tab === "committee") redirect("/admin/people?tab=committee");
  const admin = createAdminClient();
  const membershipEnabled = membershipAdministrationEnabled();
  const availableTabs = [...(membershipEnabled ? ["membership"] : []), "site"];
  const requestedTab = availableTabs.includes(query.tab || "") ? query.tab! : "site";
  const tab = query.notice === "membership-payment-settings-saved" && membershipEnabled ? "membership"
      : query.notice === "config-saved" ? "site" : requestedTab;
  const [configResult, socialResult, affiliateResult, membershipPaymentResult] = await Promise.all([
    admin
      .from("configs")
      .select("id,short_name,full_name,registered_name,company_no,website,email,telephone,club_address,registered_address")
      .limit(1)
      .single(),
    tab === "site" ? admin.from("site_social_links").select("name,url,position").order("position") : Promise.resolve({ data: [], error: null }),
    tab === "site" ? admin.from("site_affiliates").select("name,url,logo_path,position").order("position") : Promise.resolve({ data: [], error: null }),
    membershipEnabled && tab === "membership"
      ? admin.from("membership_payment_settings_versions")
        .select("id,version,configured,treasurer_name,treasurer_email,treasurer_phone,bank_account_name,bank_sort_code,bank_account_number,bank_transfer_instructions,cheque_payee,cheque_delivery_instructions,cash_instructions")
        .eq("active", true).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (configResult.error || socialResult.error || affiliateResult.error || membershipPaymentResult.error || !configResult.data || (membershipEnabled && tab === "membership" && !membershipPaymentResult.data)) {
    throw new Error("Unable to load Society settings.");
  }
  const config = configResult.data;
  const clubAddress = config.club_address as Record<string, string>;
  const registeredAddress = config.registered_address as Record<string, string>;
  const socialData = (socialResult.data ?? []) as Array<{ name: string; url: string; position: number }>;
  const affiliateData = (affiliateResult.data ?? []) as Array<{ name: string; url: string; logo_path: string; position: number }>;
  const socials = socialData.map(item => ({ name: item.name, link: item.url }));
  const affiliates = affiliateData.map(item => ({ name: item.name, website: item.url, logo: item.logo_path }));
  const membershipPayment = membershipPaymentResult.data;

  return (
    <div className="portal-content">
      <header className="portal-heading">
        <div>
          <p className="eyebrow dark">Administrator only</p>
          <h1>Site settings</h1>
          <p>Maintain Society information, public links and payment settings.</p>
        </div>
        <span className="count-badge"><SettingsIcon/>Site administration</span>
      </header>

      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {query.notice ? <p className="form-message success">{query.notice === "membership-payment-settings-saved" ? "Membership payment instructions saved as a new version."
          : "Society settings saved."}</p> : null}

      <PortalTabs label="Site settings" tabs={[
        ...(membershipEnabled ? [{ href: "/settings?tab=membership", label: "Membership payments", current: tab === "membership" }] : []),
        { href: "/settings?tab=site", label: "Society & links", current: tab === "site" },
      ]}/>

      {membershipEnabled && tab === "membership" && membershipPayment ? <section className="settings-tab-panel">
        <header className="settings-panel-heading"><div><span>Membership administration</span><h2>Treasurer and offline payments</h2><p>These versioned details are used in verified bank-transfer, cheque and cash instructions. Existing applications retain the version they received.</p></div><Banknote/></header>
        {!membershipPayment.configured ? <p className="form-message error">Bank transfer remains unavailable to applicants until real Society account details are saved.</p> : null}
        <form action={saveMembershipPaymentSettings} className="editor-form">
          <fieldset className="wide settings-fieldset">
            <legend>Treasurer contact</legend>
            <div className="settings-field-grid">
              <label>Name or role<input name="treasurer_name" defaultValue={membershipPayment.treasurer_name} required/></label>
              <label>Email<input type="email" name="treasurer_email" defaultValue={membershipPayment.treasurer_email} required/></label>
              <label>Telephone <span className="sr-only">optional</span><input name="treasurer_phone" defaultValue={membershipPayment.treasurer_phone || ""}/></label>
            </div>
          </fieldset>
          <fieldset className="wide settings-fieldset">
            <legend>Bank transfer</legend>
            <p className="form-help">Bank details are sent only after email verification and any required approval.</p>
            <div className="settings-field-grid">
              <label>Account name<input name="bank_account_name" defaultValue={membershipPayment.bank_account_name} required/></label>
              <label>Sort code<input name="bank_sort_code" inputMode="numeric" pattern="[0-9]{2}-[0-9]{2}-[0-9]{2}" defaultValue={membershipPayment.bank_sort_code} required/></label>
              <label>Account number<input name="bank_account_number" inputMode="numeric" pattern="[0-9]{8}" defaultValue={membershipPayment.bank_account_number} required/></label>
              <label className="wide">Additional instructions<textarea name="bank_transfer_instructions" rows={3} defaultValue={membershipPayment.bank_transfer_instructions} required/></label>
            </div>
          </fieldset>
          <fieldset className="wide settings-fieldset">
            <legend>Cheque and cash</legend>
            <div className="settings-field-grid">
              <label>Cheque payee<input name="cheque_payee" defaultValue={membershipPayment.cheque_payee} required/></label>
              <label className="wide">Cheque delivery instructions<textarea name="cheque_delivery_instructions" rows={3} defaultValue={membershipPayment.cheque_delivery_instructions} required/></label>
              <label className="wide">Cash instructions<textarea name="cash_instructions" rows={3} defaultValue={membershipPayment.cash_instructions} required/></label>
            </div>
          </fieldset>
          <PendingSubmitButton className="button dark">Save a new payment-settings version</PendingSubmitButton>
        </form>
      </section> : null}

      {tab === "site" ? <section className="settings-tab-panel">
        <header className="settings-panel-heading"><div><span>Public Society record</span><h2>Society information &amp; links</h2><p>Details saved here are used across the public website and legal information.</p></div><SettingsIcon/></header>
        <form action={saveSiteConfig} className="editor-form">
          <input type="hidden" name="id" value={config.id} />
          <label>Short name<input name="short_name" defaultValue={config.short_name} required /></label>
          <label>Full name<input name="full_name" defaultValue={config.full_name} required /></label>
          <label>Registered name<input name="registered_name" defaultValue={config.registered_name} required /></label>
          <label>Company number<input name="company_no" defaultValue={config.company_no} required /></label>
          <label>Website<input type="url" name="website" defaultValue={config.website} required /></label>
          <label>Public email<input type="email" name="email" defaultValue={config.email} required /></label>
          <label>Telephone<input name="telephone" defaultValue={config.telephone} /></label>
          <fieldset className="wide settings-fieldset">
            <legend>Club / railway address</legend>
            <p className="form-help">Shown to visitors as the place to visit.</p>
            <div className="settings-field-grid">
              <label>Address line 1<input name="club_address_line_one" defaultValue={clubAddress.address_line_one} required /></label>
              <label>Address line 2<input name="club_address_line_two" defaultValue={clubAddress.address_line_two} /></label>
              <label>City<input name="club_city" defaultValue={clubAddress.city} required /></label>
              <label>Postcode<input name="club_postcode" defaultValue={clubAddress.postcode} required /></label>
              <label>Country<input name="club_country" defaultValue={clubAddress.country} required /></label>
            </div>
          </fieldset>
          <fieldset className="wide settings-fieldset">
            <legend>Registered office address</legend>
            <p className="form-help">The legal address at which the Society is registered.</p>
            <div className="settings-field-grid">
              <label>Address line 1<input name="registered_address_line_one" defaultValue={registeredAddress.address_line_one} required /></label>
              <label>Address line 2<input name="registered_address_line_two" defaultValue={registeredAddress.address_line_two} /></label>
              <label>City<input name="registered_city" defaultValue={registeredAddress.city} required /></label>
              <label>Postcode<input name="registered_postcode" defaultValue={registeredAddress.postcode} required /></label>
              <label>Country<input name="registered_country" defaultValue={registeredAddress.country} required /></label>
            </div>
          </fieldset>
          <EditableLinkLists initialSocials={socials} initialAffiliates={affiliates} />
          <PendingSubmitButton className="button dark">Save Society settings</PendingSubmitButton>
        </form>
      </section> : null}


    </div>
  );
}
