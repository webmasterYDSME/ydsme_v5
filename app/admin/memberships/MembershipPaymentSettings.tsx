import { Banknote } from "lucide-react";
import { createServiceClient } from "@/lib/supabase/admin";
import { saveMembershipPaymentSettings } from "@/lib/actions/membership";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

export async function MembershipPaymentSettings() {
  const { data: membershipPayment, error } = await createServiceClient()
    .from("membership_payment_settings_versions")
    .select("version,configured,treasurer_name,treasurer_email,treasurer_phone,bank_account_name,bank_sort_code,bank_account_number,bank_transfer_instructions,cheque_payee,cheque_delivery_instructions,cash_instructions")
    .eq("active", true).single();
  if (error || !membershipPayment) throw new Error("Unable to load membership payment settings.");
  return <section className="settings-tab-panel">
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
            <p className="form-help">Bank details and the amount are sent after email verification. Applicants use their full name as the payment reference.</p>
            <div className="settings-field-grid">
              <label>Account name<input name="bank_account_name" defaultValue={membershipPayment.bank_account_name} required/></label>
              <label>Sort code<input name="bank_sort_code" inputMode="numeric" pattern="[0-9]{2}-[0-9]{2}-[0-9]{2}" defaultValue={membershipPayment.bank_sort_code} required/></label>
              <label>Account number<input name="bank_account_number" inputMode="numeric" pattern="[0-9]{8}" defaultValue={membershipPayment.bank_account_number} required/></label>
              <label className="wide">Additional instructions<textarea name="bank_transfer_instructions" rows={3} defaultValue={membershipPayment.bank_transfer_instructions} required/></label>
            </div>
          </fieldset>
          <fieldset className="wide settings-fieldset">
            <legend>Cheque and cash</legend>
            <p className="form-help">Applicants receive the amount and these instructions. Their full name identifies the payment; no generated reference is needed.</p>
            <div className="settings-field-grid">
              <label>Cheque payee<input name="cheque_payee" defaultValue={membershipPayment.cheque_payee} required/></label>
              <label className="wide">Cheque delivery instructions<textarea name="cheque_delivery_instructions" rows={3} defaultValue={membershipPayment.cheque_delivery_instructions} required/></label>
              <label className="wide">Cash instructions<textarea name="cash_instructions" rows={3} defaultValue={membershipPayment.cash_instructions} required/></label>
            </div>
          </fieldset>
          <PendingSubmitButton className="button dark">Save a new payment-settings version</PendingSubmitButton>
        </form>
      </section>;
}
