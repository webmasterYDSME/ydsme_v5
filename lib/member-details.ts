import "server-only";
import { createClient } from "@/lib/supabase/server";

/** The signed-in member's own postal address and date of birth, read through their own session. */
export type OwnMemberDetails =
  | { linked: false }
  | {
    linked: true;
    /** yyyy-mm-dd, or null when it has not been recorded. */
    dateOfBirth: string | null;
    /** Imported with a month and year only, so the 1st is a placeholder the member may replace. */
    birthDayUnconfirmed: boolean;
    /** Set, with a real day: only a membership officer can change it. */
    birthDateLocked: boolean;
    addressLineOne: string;
    addressLineTwo: string;
    city: string;
    postcode: string;
  };

export async function getOwnMemberDetails(): Promise<OwnMemberDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_own_member_details");
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.linked !== true) return { linked: false };
  const text = (input: unknown) => typeof input === "string" ? input : "";
  return {
    linked: true,
    dateOfBirth: text(value.date_of_birth) || null,
    birthDayUnconfirmed: value.birth_day_unconfirmed === true,
    birthDateLocked: value.birth_date_locked === true,
    addressLineOne: text(value.address_line_one),
    addressLineTwo: text(value.address_line_two),
    city: text(value.city),
    postcode: text(value.postcode),
  };
}
