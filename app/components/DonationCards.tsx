import { ArrowUpRight, HeartHandshake, LockKeyhole, Target } from "lucide-react";
import type { DonationCampaign, TargetDonationCampaign } from "@/lib/donations";
import { startDonationCheckout } from "@/lib/actions/donations";
import { CaptchaField } from "@/app/components/CaptchaField";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

const pounds = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

function DonationForm({
  campaign,
  kind,
  suggestedAmount,
}: {
  campaign: DonationCampaign;
  kind: "generic" | "target";
  suggestedAmount: number;
}) {
  return (
    <form action={startDonationCheckout} className="donation-form">
      <input type="hidden" name="campaign" value={kind} />
      <label>
        <span>Donation amount</span>
        <i aria-hidden="true">£</i>
        <input
          type="number"
          name="amount"
          min="1"
          max="10000"
          step="1"
          defaultValue={suggestedAmount}
          inputMode="decimal"
          required
        />
      </label>
      <CaptchaField />
      <PendingSubmitButton className="button donation-button" pendingLabel="Opening secure checkout…">
        {campaign.buttonLabel}
        <ArrowUpRight size={17} aria-hidden="true" />
      </PendingSubmitButton>
    </form>
  );
}

export function GenericDonation({ campaign }: { campaign: DonationCampaign }) {
  if (!campaign.enabled) return null;

  return (
    <section id="support-us" className="donation-section donation-generic" aria-labelledby="generic-donation-title">
      <div className="donation-rail" aria-hidden="true"><i /><i /><i /><i /></div>
      <div className="donation-icon" aria-hidden="true"><HeartHandshake /></div>
      <div className="donation-copy">
        <p className="eyebrow">Keep the wheels turning</p>
        <h2 id="generic-donation-title">{campaign.title}</h2>
        <p>{campaign.description}</p>
      </div>
      <div className="donation-action">
        <DonationForm campaign={campaign} kind="generic" suggestedAmount={10} />
        <small><LockKeyhole aria-hidden="true" /> Secure donation on Stripe</small>
      </div>
    </section>
  );
}

export function TargetDonation({ campaign }: { campaign: TargetDonationCampaign }) {
  if (!campaign.enabled || campaign.targetPence <= 0) return null;

  const percentage = Math.min(100, Math.round((campaign.raisedPence / campaign.targetPence) * 100));
  const raised = pounds.format(campaign.raisedPence / 100);
  const target = pounds.format(campaign.targetPence / 100);

  return (
    <section id="current-appeal" className="donation-section donation-target" aria-labelledby="target-donation-title">
      <div className="target-copy">
        <p className="eyebrow dark"><Target aria-hidden="true" /> Current appeal</p>
        <h2 id="target-donation-title">{campaign.title}</h2>
        <p>{campaign.description}</p>
        <DonationForm campaign={campaign} kind="target" suggestedAmount={25} />
      </div>
      <div className="target-progress-card">
        <div className="target-progress-heading">
          <span>Campaign progress</span>
          <strong>{percentage}%</strong>
        </div>
        <div
          className="target-progress-track"
          role="progressbar"
          aria-label={`${raised} raised towards a ${target} target`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percentage}
        >
          <i style={{ width: `${percentage}%` }} />
        </div>
        <div className="target-totals">
          <p><strong>{raised}</strong><span>raised so far</span></p>
          <p><strong>{target}</strong><span>campaign target</span></p>
        </div>
        <small><LockKeyhole aria-hidden="true" /> Payment is completed securely on Stripe</small>
      </div>
    </section>
  );
}
