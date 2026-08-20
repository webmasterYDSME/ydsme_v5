import { redirect } from "next/navigation";
import { createApplicationCheckoutFromToken } from "@/lib/membership";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  let checkoutUrl: string;
  try {
    checkoutUrl = await createApplicationCheckoutFromToken(token);
  } catch {
    redirect("/membership?application=payment-link-invalid");
  }
  redirect(checkoutUrl);
}
