import { Webhook } from "svix";
import { createServiceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ResendDeliveryPayload = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string };
};

const deliveryType: Record<string, "accepted" | "delivered" | "bounced" | "complained" | "suppressed"> = {
  "email.sent": "accepted",
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.suppressed": "suppressed",
};

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const eventId = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!secret || !eventId || !timestamp || !signature) {
    return Response.json({ received: false }, { status: 400 });
  }
  const body = await request.text();
  let payload: ResendDeliveryPayload;
  try {
    payload = new Webhook(secret).verify(body, {
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    }) as ResendDeliveryPayload;
  } catch {
    return Response.json({ received: false }, { status: 400 });
  }
  const eventType = payload.type ? deliveryType[payload.type] : null;
  const messageId = payload.data?.email_id;
  if (!eventType || !messageId) return Response.json({ received: true, ignored: true });
  const occurredAt = payload.created_at && !Number.isNaN(Date.parse(payload.created_at))
    ? new Date(payload.created_at).toISOString() : new Date().toISOString();
  const { error } = await createServiceClient().rpc("record_membership_delivery_event", {
    p_provider_message_id: messageId,
    p_provider_event_id: eventId,
    p_event_type: eventType,
    p_safe_detail: `The email provider reported ${eventType}.`,
    p_occurred_at: occurredAt,
  });
  if (error) return Response.json({ received: false }, { status: 500 });
  return Response.json({ received: true });
}
