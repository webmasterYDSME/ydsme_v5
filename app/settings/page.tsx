import { Settings as SettingsIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  saveSiteConfig,
} from "@/lib/actions/content";
import { EditableLinkLists } from "@/app/components/EditableLinkLists";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { PortalTabs } from "@/app/components/PortalTabs";

export const dynamic = "force-dynamic";

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; tab?: string; page?: string }>;
}) {
  const query = await searchParams;
  if (query.tab === "membership" || query.notice === "membership-payment-settings-saved") {
    const destination = new URLSearchParams({ section: "payment-settings" });
    if (query.error) destination.set("error", query.error);
    if (query.notice) destination.set("notice", query.notice);
    redirect(`/admin/memberships?${destination}`);
  }
  await requireCapability("settings.manage");
  if (query.tab === "donations" || query.notice === "donations-saved") redirect("/admin/donations?view=appeals");
  if (query.tab === "committee") redirect("/admin/people?tab=committee");
  const admin = createAdminClient();
  const tab = "site";
  const [configResult, socialResult, affiliateResult] = await Promise.all([
    admin
      .from("configs")
      .select("id,short_name,full_name,registered_name,company_no,website,email,telephone,club_address,registered_address")
      .limit(1)
      .single(),
    tab === "site" ? admin.from("site_social_links").select("name,url,position").order("position") : Promise.resolve({ data: [], error: null }),
    tab === "site" ? admin.from("site_affiliates").select("name,url,logo_path,position").order("position") : Promise.resolve({ data: [], error: null }),
  ]);
  if (configResult.error || socialResult.error || affiliateResult.error || !configResult.data) {
    throw new Error("Unable to load Society settings.");
  }
  const config = configResult.data;
  const clubAddress = config.club_address as Record<string, string>;
  const registeredAddress = config.registered_address as Record<string, string>;
  const socialData = (socialResult.data ?? []) as Array<{ name: string; url: string; position: number }>;
  const affiliateData = (affiliateResult.data ?? []) as Array<{ name: string; url: string; logo_path: string; position: number }>;
  const socials = socialData.map(item => ({ name: item.name, link: item.url }));
  const affiliates = affiliateData.map(item => ({ name: item.name, website: item.url, logo: item.logo_path }));

  return (
    <div className="portal-content">
      <header className="portal-heading">
        <div>
          <p className="eyebrow dark">Administrator only</p>
          <h1>Site settings</h1>
          <p>Maintain Society information and public links.</p>
        </div>
        <span className="count-badge"><SettingsIcon/>Site administration</span>
      </header>

      {query.error ? <p className="form-message error">{query.error}</p> : null}
      {query.notice ? <p className="form-message success">{"Society settings saved."}</p> : null}

      <PortalTabs label="Site settings" tabs={[
        { href: "/settings?tab=site", label: "Society & links", current: tab === "site" },
      ]}/>



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
