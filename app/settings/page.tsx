import { HeartHandshake, Pencil, Plus, Settings as SettingsIcon, Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  deleteCommittee,
  saveCommittee,
  saveDonationSettings,
  saveSiteConfig,
} from "@/lib/actions/content";
import { defaultDonationSettings } from "@/lib/donations";
import { SignedUploadField } from "@/app/components/SignedUploadField";
import { EditableLinkLists } from "@/app/components/EditableLinkLists";

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
      <button type="submit" className="button dark">Save committee record</button>
    </form>
  );
}

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const admin = createAdminClient();
  const [{ data, error }, { data: config, error: configError }, { data: socialData }, { data: affiliateData }, { data: campaignData }] = await Promise.all([
    admin.from("committees").select("id,name,title,email,file_url").order("id"),
    admin
      .from("configs")
      .select("id,short_name,full_name,registered_name,company_no,website,telephone,registered_address")
      .limit(1)
      .single(),
    admin.from("site_social_links").select("name,url,position").order("position"),
    admin.from("site_affiliates").select("name,url,logo_path,position").order("position"),
    admin.from("donation_campaigns").select("kind,enabled,title,description,button_label,target_pence"),
  ]);

  if (error || configError) throw new Error(error?.message || configError?.message);
  const people = (data ?? []) as Committee[];
  const address = config.registered_address as Record<string, string>;
  const socials = (socialData ?? []).map(item => ({ name: item.name, link: item.url }));
  const affiliates = (affiliateData ?? []).map(item => ({ name: item.name, website: item.url, logo: item.logo_path }));
  const generic = campaignData?.find(item => item.kind === "generic");
  const target = campaignData?.find(item => item.kind === "target");
  const donations = {
    generic: generic ? { enabled: generic.enabled, title: generic.title, description: generic.description, buttonLabel: generic.button_label } : defaultDonationSettings.generic,
    target: target ? { enabled: target.enabled, title: target.title, description: target.description, buttonLabel: target.button_label, targetPence: Number(target.target_pence), raisedPence: 0 } : defaultDonationSettings.target,
  };

  return (
    <div className="portal-content">
      <header className="portal-heading">
        <div>
          <p className="eyebrow dark">Administrator only</p>
          <h1>Committee &amp; site settings</h1>
          <p>Maintain the Society record, public links, donation appeals and committee roster from one secure screen.</p>
        </div>
        <SettingsIcon />
      </header>

      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {query.notice ? <p className="form-message success">Settings saved.</p> : null}

      <details className="manager-panel">
        <summary><SettingsIcon />Society information &amp; links</summary>
        <form action={saveSiteConfig} className="editor-form">
          <input type="hidden" name="id" value={config.id} />
          <label>Short name<input name="short_name" defaultValue={config.short_name} required /></label>
          <label>Full name<input name="full_name" defaultValue={config.full_name} required /></label>
          <label>Registered name<input name="registered_name" defaultValue={config.registered_name} required /></label>
          <label>Company number<input name="company_no" defaultValue={config.company_no} required /></label>
          <label>Website<input type="url" name="website" defaultValue={config.website} required /></label>
          <label>Telephone<input name="telephone" defaultValue={config.telephone} /></label>
          <label>Address line 1<input name="address_line_one" defaultValue={address.address_line_one} required /></label>
          <label>Address line 2<input name="address_line_two" defaultValue={address.address_line_two} /></label>
          <label>City<input name="city" defaultValue={address.city} required /></label>
          <label>Postcode<input name="postcode" defaultValue={address.postcode} required /></label>
          <label>Country<input name="country" defaultValue={address.country} required /></label>
          <EditableLinkLists initialSocials={socials} initialAffiliates={affiliates} />
          <button type="submit" className="button dark">Save Society settings</button>
        </form>
      </details>

      <details className="manager-panel donation-manager" open={query.notice === "donations-saved"}>
        <summary><HeartHandshake />Donation components</summary>
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

          <button type="submit" className="button dark">Save donation components</button>
        </form>
      </details>

      <details className="manager-panel">
        <summary><Plus />Add a committee position</summary>
        <CommitteeForm />
      </details>

      <div className="admin-list">
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
                <button type="submit"><Trash2 />Delete</button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
