import { withSupabase } from "@supabase/server";

const BATCH_SIZE = 25;

type PurgeClaim = {
  user_id: string;
  claim_token: string;
};

export default {
  fetch: withSupabase({ auth: "secret" }, async (request, context) => {
    if (request.method !== "POST") {
      return Response.json({ ok: false }, { status: 405, headers: { Allow: "POST" } });
    }

    const { data, error } = await context.supabaseAdmin.rpc("claim_expired_portal_accounts", {
      p_limit: BATCH_SIZE,
    });
    if (error) {
      console.error("Unable to claim expired portal accounts", error.message);
      return Response.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    let deleted = 0;
    let failed = 0;
    for (const claim of (data ?? []) as PurgeClaim[]) {
      const { data: anonymized, error: anonymizeError } = await context.supabaseAdmin.rpc(
        "anonymize_member_content_for_purge",
        { p_claim_token: claim.claim_token, p_user_id: claim.user_id },
      );
      if (anonymizeError || !anonymized) {
        failed += 1;
        const { error: releaseError } = await context.supabaseAdmin.rpc("release_expired_portal_account_claim", {
          p_claim_token: claim.claim_token,
          p_error: anonymizeError?.message ?? "Content anonymisation failed",
          p_user_id: claim.user_id,
        });
        if (releaseError) console.error("Unable to release failed anonymisation claim", releaseError.message);
        continue;
      }

      const { error: deleteError } = await context.supabaseAdmin.auth.admin.deleteUser(claim.user_id, false);
      if (deleteError) {
        failed += 1;
        const { error: releaseError } = await context.supabaseAdmin.rpc("release_expired_portal_account_claim", {
          p_claim_token: claim.claim_token,
          p_error: deleteError.message,
          p_user_id: claim.user_id,
        });
        if (releaseError) console.error("Unable to release failed retention claim", releaseError.message);
        continue;
      }

      deleted += 1;
      const { error: auditError } = await context.supabaseAdmin.from("audit_logs").insert({
        actor_user_id: null,
        actor_role: "system",
        action: "member.retention-purged",
        entity_type: "member",
        entity_id: claim.user_id,
        summary: "Expired archived portal and Auth account deleted by the retention schedule.",
        after_state: { auth_account_deleted: true },
      });
      if (auditError) console.error("Unable to record successful retention purge", auditError.message);
    }

    return Response.json(
      { ok: failed === 0, result: { claimed: (data ?? []).length, deleted, failed } },
      { status: failed === 0 ? 200 : 207, headers: { "Cache-Control": "no-store" } },
    );
  }),
};
