import "server-only";

import { unstable_cache } from "next/cache";
import { PUBLIC_MEMBERSHIP_PAYMENT_CONTACT_CACHE_TAG } from "@/lib/cache-tags";
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
  bank_transfer_instructions: "Contact the Membership Officer if you need help with the transfer.",
  cheque_payee: "York City & District Society of Model Engineers",
  cheque_delivery_instructions: "Give the cheque to the Society Treasurer.",
  cash_instructions: "Give the cash payment to the Society Treasurer.",
};

export type PublicMembershipPaymentContact = Pick<
  MembershipPaymentSettings,
  "configured" | "treasurer_name" | "treasurer_email"
>;

async function loadPublicMembershipPaymentContact(): Promise<PublicMembershipPaymentContact> {
  const { data } = await createServiceClient()
    .from("membership_payment_settings_versions")
    .select("configured,treasurer_name,treasurer_email")
    .eq("active", true)
    .maybeSingle();
  return data ?? {
    configured: defaultMembershipPaymentSettings.configured,
    treasurer_name: defaultMembershipPaymentSettings.treasurer_name,
    treasurer_email: defaultMembershipPaymentSettings.treasurer_email,
  };
}

export const getPublicMembershipPaymentContact = unstable_cache(
  loadPublicMembershipPaymentContact,
  ["public-membership-payment-contact"],
  { tags: [PUBLIC_MEMBERSHIP_PAYMENT_CONTACT_CACHE_TAG], revalidate: 3600 },
);

export async function getMembershipPaymentSettings(id?: string | null): Promise<MembershipPaymentSettings> {
  const admin = createServiceClient();
  let query = admin.from("membership_payment_settings_versions")
    .select("id,version,configured,treasurer_name,treasurer_email,treasurer_phone,bank_account_name,bank_sort_code,bank_account_number,bank_transfer_instructions,cheque_payee,cheque_delivery_instructions,cash_instructions");
  query = id ? query.eq("id", id) : query.eq("active", true);
  const { data } = await query.maybeSingle();
  return data ?? { id: "default", version: 0, ...defaultMembershipPaymentSettings };
}

type OfflinePaymentInstructionDetails = {
  applicantName: string;
  amountPence: number;
};

type OfflinePaymentReminderDetails = OfflinePaymentInstructionDetails & {
  applicationExpiresAt: Date;
};

const paymentMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function bankTransferAdditionalNote(value: string) {
  return value
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/\breference\b/i.test(sentence))
    .join(" ")
    .trim();
}

export function offlinePaymentInstructions(method: "cash" | "bank_transfer" | "cheque", settings: MembershipPaymentSettings, details: OfflinePaymentInstructionDetails) {
  if (method === "bank_transfer") {
    const additionalNote = bankTransferAdditionalNote(settings.bank_transfer_instructions);
    return [
      "Thank you for applying for Society membership.",
      "",
      "Bank transfer details",
      `Amount: ${paymentMoney.format(details.amountPence / 100)}`,
      `Account name: ${settings.bank_account_name}`,
      `Sort code: ${settings.bank_sort_code}`,
      `Account number: ${settings.bank_account_number}`,
      `Reference: ${details.applicantName}`,
      "",
      "Enter your full name as the payment reference.",
      additionalNote,
    ].filter((line, index, lines) => line || lines[index - 1]).join("\n").trim();
  }
  if (method === "cheque") {
    return [
      "Thank you for applying for Society membership.",
      "",
      "Cheque payment details",
      `Amount: ${paymentMoney.format(details.amountPence / 100)}`,
      `Payable to: ${settings.cheque_payee}`,
      `Applicant’s full name to write on the back of the cheque: ${details.applicantName}`,
      `How to deliver it: ${settings.cheque_delivery_instructions}`,
      "",
      "Your membership will be activated after the cheque has been received, cleared and recorded.",
    ].join("\n");
  }
  return [
    "Thank you for applying for Society membership.",
    "",
    "Cash payment details",
    `Amount: ${paymentMoney.format(details.amountPence / 100)}`,
    `Member name: ${details.applicantName}`,
    `How to pay: ${settings.cash_instructions}`,
    "",
    "Your membership will be activated after the cash payment has been received and recorded.",
  ].join("\n");
}

export function offlinePaymentReminder(method: "cash" | "bank_transfer" | "cheque", settings: MembershipPaymentSettings, details: OfflinePaymentReminderDetails) {
  const expiryDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(details.applicationExpiresAt);
  const introduction = `We have not yet recorded the ${paymentMoney.format(details.amountPence / 100)} payment for ${details.applicantName}’s Society membership.`;
  const closing = [
    `This application will remain open until ${expiryDate}. If you no longer wish to continue, you can ignore this email.`,
    "",
    "Need help? Email the Membership Officer.",
  ];

  if (method === "bank_transfer") {
    return [
      introduction,
      "",
      "Bank transfer details",
      `Amount: ${paymentMoney.format(details.amountPence / 100)}`,
      `Account name: ${settings.bank_account_name}`,
      `Sort code: ${settings.bank_sort_code}`,
      `Account number: ${settings.bank_account_number}`,
      `Reference: ${details.applicantName}`,
      "",
      "Enter the applicant’s full name as the payment reference.",
      "",
      "If you have already paid, no action is needed. Please allow a little time for us to match the payment.",
      "",
      ...closing,
    ].join("\n");
  }
  if (method === "cheque") {
    return [
      introduction,
      "",
      "Cheque payment details",
      `Amount: ${paymentMoney.format(details.amountPence / 100)}`,
      `Payable to: ${settings.cheque_payee}`,
      `Applicant’s full name to write on the back of the cheque: ${details.applicantName}`,
      `How to deliver it: ${settings.cheque_delivery_instructions}`,
      "",
      "If you have already given us the cheque, no action is needed. Please allow time for it to clear and be recorded.",
      "",
      ...closing,
    ].join("\n");
  }
  return [
    introduction,
    "",
    "Cash payment details",
    `Amount: ${paymentMoney.format(details.amountPence / 100)}`,
    `Member name: ${details.applicantName}`,
    `How to pay: ${settings.cash_instructions}`,
    "",
    "If you have already paid, no action is needed. Please allow a little time for the payment to be recorded.",
    "",
    ...closing,
  ].join("\n");
}
