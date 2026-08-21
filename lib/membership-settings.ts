import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

export type MembershipPaymentSettings = {
  id: string;
  version: number;
  configured: boolean;
  treasurer_name: string;
  treasurer_email: string;
  treasurer_phone: string | null;
  bank_account_name: string;
  bank_sort_code: string;
  bank_account_number: string;
  bank_transfer_instructions: string;
  cheque_payee: string;
  cheque_delivery_instructions: string;
  cash_instructions: string;
};

export const defaultMembershipPaymentSettings: Omit<MembershipPaymentSettings, "id" | "version"> = {
  configured: false,
  treasurer_name: "Society Treasurer",
  treasurer_email: "treasurer@yorkmodelengineers.co.uk",
  treasurer_phone: null,
  bank_account_name: "York City & District Society of Model Engineers",
  bank_sort_code: "00-00-00",
  bank_account_number: "00000000",
  bank_transfer_instructions: "Use the unique membership reference shown in your payment instructions.",
  cheque_payee: "York City & District Society of Model Engineers",
  cheque_delivery_instructions: "Contact the Society Treasurer to arrange delivery of your cheque.",
  cash_instructions: "Contact the Society Treasurer to arrange a complete cash payment.",
};

export async function getMembershipPaymentSettings(id?: string | null): Promise<MembershipPaymentSettings> {
  const admin = createServiceClient();
  let query = admin.from("membership_payment_settings_versions")
    .select("id,version,configured,treasurer_name,treasurer_email,treasurer_phone,bank_account_name,bank_sort_code,bank_account_number,bank_transfer_instructions,cheque_payee,cheque_delivery_instructions,cash_instructions");
  query = id ? query.eq("id", id) : query.eq("active", true);
  const { data } = await query.maybeSingle();
  return data ?? { id: "default", version: 0, ...defaultMembershipPaymentSettings };
}

export function offlinePaymentInstructions(method: "cash" | "bank_transfer" | "cheque", settings: MembershipPaymentSettings, reference: string) {
  if (method === "bank_transfer") {
    return `Pay the complete fee to ${settings.bank_account_name}, sort code ${settings.bank_sort_code}, account ${settings.bank_account_number}. Use reference ${reference}. ${settings.bank_transfer_instructions}`;
  }
  if (method === "cheque") {
    return `Make the cheque payable to ${settings.cheque_payee} and write reference ${reference} on the reverse. ${settings.cheque_delivery_instructions}`;
  }
  return `${settings.cash_instructions} Quote reference ${reference}.`;
}

export function membershipPaymentReference(applicationId: string) {
  return `MEM-${applicationId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}
