"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export async function openBillingPortal() {
  const { user } = await requireUser();
  const admin = createAdminClient();
  const { data } = await admin.from("customers").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (!data?.stripe_customer_id) redirect("/account?error=No+billing+profile+is+connected+to+this+membership.");
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010";
  const session = await getStripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${origin}/account`,
  });
  redirect(session.url);
}
