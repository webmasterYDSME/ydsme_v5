import { Banknote, HeartHandshake, Pencil, Plus, Settings as SettingsIcon, Trash2, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteCommittee,
  saveCommittee,
  saveDonationSettings,
  saveSiteConfig,
} from "@/lib/actions/content";
import { defaultDonationSettings } from "@/lib/donations";
import { saveMembershipPaymentSettings } from "@/lib/actions/membership";
import { SignedUploadField } from "@/app/components/SignedUploadField";
import { EditableLinkLists } from "@/app/components/EditableLinkLists";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { PortalPagination } from "@/app/components/PortalPagination";
import { PortalTabs } from "@/app/components/PortalTabs";
import { membershipAdministrationEnabled } from "@/lib/features";

export const dynamic = "force-dynamic";

type Committee = {
  id: number;
  name: string;
  title: string;
  email: string;
  file_url: string;
};

function CommitteeForm({ person }: { person?: Committee }) {
  return (
    <form action={saveCommittee} className="editor-form">
      {person ? <input type="hidden" name="id" value={person.id} /> : null}
      <label>Name (blank if vacant)<input name="name" defaultValue={person?.name} /></label>
      <label>Position<input name="title" defaultValue={person?.title} required /></label>
      <label>Email<input type="email" name="email" defaultValue={person?.email} required /></label>
      <SignedUploadField kind="committee-image" label={person ? "Replace portrait (optional)" : "Portrait (optional)"} />
      <input type="hidden" name="file_url" value={person?.file_url || ""} />
      <PendingSubmitButton className="button dark">Save committee record</PendingSubmitButton>
    </form>
  );
}

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; tab?: string; page?: string }>;
}) {
  const [query] = await Promise.all([searchParams, requireCapability("settings.manage")]);
  const admin = createAdminClient();
  const membershipEnabled = membershipAdministrationEnabled();
  const availableTabs = ["committee", "donations", ...(membershipEnabled ? ["membership"] : []), "site"];
  const requestedTab = availableTabs.includes(query.tab || "") ? query.tab! : "committee";
  const tab = query.notice === "donations-saved" ? "donations"
    : query.notice === "membership-payment-settings-saved" && membershipEnabled ? "membership"
      : query.notice === "config-saved" ? "site" : requestedTab;
  const committeePageSize = 8;
  const requestedPage = Number.parseInt(query.page || "1", 10);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const committeeQuery = tab === "committee"
    ? admin.from("committees").select("id,name,title,email,file_url", { count: "exact" }).order("id").range((currentPage - 1) * committeePageSize, currentPage * committeePageSize - 1)
    : admin.from("committees").select("id", { count: "exact", head: true });
  const [committeeResult, configResult, socialResult, affiliateResult, campaignResult, membershipPaymentResult] = await Promise.all([
    committeeQuery,
    admin
      .from("configs")
      .select("id,short_name,full_name,registered_name,company_no,website,email,telephone,club_address,registered_address")
      .limit(1)
      .single(),
    tab === "site" ? admin.from("site_social_links").select("name,url,position").order("position") : Promise.resolve({ data: [], error: null }),
    tab === "site" ? admin.from("site_affiliates").select("name,url,logo_path,position").order("position") : Promise.resolve({ data: [], error: null }),
    tab === "donations" ? admin.from("donation_campaigns").select("kind,enabled,title,description,button_label,target_pence") : Promise.resolve({ data: [], error: null }),
    membershipEnabled
      ? admin.from("membership_payment_settings_versions")
        .select("id,version,configured,treasurer_name,treasurer_email,treasurer_phone,bank_account_name,bank_sort_code,bank_account_number,bank_transfer_instructions,cheque_payee,cheque_delivery_instructions,cash_instructions")
        .eq("active", true).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (committeeResult.error || configResult.error || socialResult.error || affiliateResult.error || campaignResult.error || membershipPaymentResult.error || !configResult.data || (membershipEnabled && !membershipPaymentResult.data)) {
    throw new Error("Unable to load Society settings.");
  }
  const config = configResult.data;
  const people = ((committeeResult.data ?? []) as unknown) as Committee[];
  const committeeCount = committeeResult.count ?? 0;
  const committeePages = Math.max(1, Math.ceil(committeeCount / committeePageSize));
  if (tab === "committee" && currentPage > committeePages) redirect(`/settings?tab=committee&page=${committeePages}`);
  const clubAddress = config.club_address as Record<string, string>;
  const registeredAddress = config.registered_address as Record<string, string>;
  const socialData = (socialResult.data ?? []) as Array<{ name: string; url: string; position: number }>;
  const affiliateData = (affiliateResult.data ?? []) as Array<{ name: string; url: string; logo_path: string; position: number }>;
  const campaignData = (campaignResult.data ?? []) as Array<{ kind: string; enabled: boolean; title: string; description: string; button_label: string; target_pence: number }>;
  const socials = socialData.map(item => ({ name: item.name, link: item.url }));
  const affiliates = affiliateData.map(item => ({ name: item.name, website: item.url, logo: item.logo_path }));
  const generic = campaignData?.find(item => item.kind === "generic");
  const target = campaignData?.find(item => item.kind === "target");
  const donations = {
    generic: generic ? { enabled: generic.enabled, title: generic.title, description: generic.description, buttonLabel: generic.button_label } : defaultDonationSettings.generic,
    target: target ? { enabled: target.enabled, title: target.title, description: target.description, buttonLabel: target.button_label, targetPence: Number(target.target_pence), raisedPence: 0 } : defaultDonationSettings.target,
  };
  const membershipPayment = membershipPaymentResult.data;

  return (
    <div className="portal-content">
      <header className="portal-heading">
        <div>
          <p className="eyebrow dark">Administrator only</p>
          <h1>Committee &amp; site</h1>
          <p>Maintain the Society record, public links, donation appeals and committee roster in focused workspaces.</p>
        </div>
        <span className="count-badge"><SettingsIcon />Site administration</span>
      </header>

      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {query.notice ? <p className="form-message success">{query.notice === "donations-saved" ? "Donation appeals saved."
        : query.notice === "membership-payment-settings-saved" ? "Membership payment instructions saved as a new version."
          : "Society settings saved."}</p> : null}

      <PortalTabs label="Committee and site settings" tabs={[
        { href: "/settings?tab=committee", label: "Committee roster", count: committeeCount, current: tab === "committee" },
        { href: "/settings?tab=donations", label: "Donation appeals", current: tab === "donations" },
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

      {tab === "donations" ? <section className="settings-tab-panel donation-manager">
        <header className="settings-panel-heading"><div><span>Public fundraising</span><h2>Donation appeals</h2><p>Control which appeals visitors see and the message used for each one.</p></div><HeartHandshake/></header>
        <form action={saveDonationSettings} className="editor-form">
          <input type="hidden" name="id" value={config.id} />
          <p className="wide form-help donation-manager-help">
            Each component stays hidden until it is enabled. Donation amounts are collected here, then visitors complete payment on a secure Stripe Checkout page.
          </p>

          <fieldset className="wide donation-settings-card">
            <legend>General donation</legend>
            <label className="check donation-toggle">
              <input type="checkbox" name="generic_enabled" defaultChecked={donations.generic.enabled} />
              Show the general donation component near the end of the visitors page
            </label>
            <div className="donation-settings-grid">
              <label>Heading<input name="generic_title" defaultValue={donations.generic.title} required /></label>
              <label>Button label<input name="generic_button_label" defaultValue={donations.generic.buttonLabel} required /></label>
              <label className="wide">Description<textarea name="generic_description" rows={4} defaultValue={donations.generic.description} required /></label>
            </div>
          </fieldset>

          <fieldset className="wide donation-settings-card target-settings-card">
            <legend>Target campaign</legend>
            <label className="check donation-toggle">
              <input type="checkbox" name="target_enabled" defaultChecked={donations.target.enabled} />
              Show the target campaign after the main railway image on the homepage
            </label>
            <div className="donation-settings-grid">
              <label>Heading<input name="target_title" defaultValue={donations.target.title} required /></label>
              <label>Button label<input name="target_button_label" defaultValue={donations.target.buttonLabel} required /></label>
              <label className="wide">Description<textarea name="target_description" rows={4} defaultValue={donations.target.description} required /></label>
              <label>Campaign target (£)<input type="number" name="target_pounds" min="1" max="10000000" step="0.01" defaultValue={donations.target.targetPence / 100} required /></label>
              <p className="donation-total-note">Raised funds update automatically from verified Stripe payments and refunds.</p>
            </div>
          </fieldset>

          <PendingSubmitButton className="button dark">Save donation components</PendingSubmitButton>
        </form>
      </section> : null}

      {tab === "committee" ? <section className="committee-settings-panel">
        <div className="settings-panel-heading committee-panel-heading"><div><span>Public officers</span><h2>Committee roster</h2><p>Maintain the people and vacant positions shown on the public committee page.</p></div><span className="count-badge"><UsersRound/>{committeeCount} positions</span></div>
        <details className="manager-panel">
          <summary><Plus />Add a committee position</summary>
          <CommitteeForm />
        </details>

        <div className="admin-list committee-admin-list">
        {people.map((person) => (
          <article key={person.id}>
            <div>
              <span>{person.title}</span>
              <h2>{person.name || "Position vacant"}</h2>
              <p>{person.email}</p>
            </div>
            <div className="admin-list-actions">
              <details>
                <summary><Pencil />Edit</summary>
                <div className="popover-editor"><CommitteeForm person={person} /></div>
              </details>
              <form action={deleteCommittee}>
                <input type="hidden" name="id" value={person.id} />
                <PendingSubmitButton pendingLabel="Deleting…"><Trash2 />Delete</PendingSubmitButton>
              </form>
            </div>
          </article>
        ))}
        </div>
        {!people.length ? <div className="empty-state"><UsersRound/><h2>No committee positions</h2><p>Add the first public Society position above.</p></div> : null}
        <PortalPagination currentPage={currentPage} totalPages={committeePages} totalItems={committeeCount} itemLabel="positions" href={(page) => `/settings?tab=committee&page=${page}`} ariaLabel="Committee roster pages"/>
      </section> : null}
    </div>
  );
}
