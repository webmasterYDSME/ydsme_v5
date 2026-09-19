import { setMembershipRetention } from "@/lib/actions/membership-retention";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { loadRetention } from "@/lib/membership-admin/retention";
import { groupRetention, retentionDateLabel, retentionDetail, type RetentionRow } from "@/lib/membership-admin/retention-groups";
import { timestampDateLabel } from "@/lib/membership-admin/format";
import styles from "../memberships.module.css";

function List({ title, note, rows, empty, showWarned = false }: { title: string; note: string; rows: RetentionRow[]; empty: string; showWarned?: boolean }) {
  return <section style={{ marginTop: 28 }}>
    <h3 style={{ margin: 0, fontSize: 18 }}>{title} <span style={{ color: "#56625b", fontWeight: 400 }}>({rows.length})</span></h3>
    <p className={styles.panelNote}>{note}</p>
    <div className="membership-queue-list">
      {rows.map((row) => <article key={row.member_id}><div>
        <strong>{row.full_name}</strong>
        <span>{row.contact_email || "No email address"}</span>
        <small>{retentionDetail(row)}{showWarned && row.warned_at ? ` · warned ${timestampDateLabel(row.warned_at)}` : ""}{row.blocked_reason ? ` · Held back: ${row.blocked_reason}` : ""}</small>
      </div></article>)}
      {!rows.length ? <p className={styles.panelNote}>{empty}</p> : null}
    </div>
  </section>;
}

export async function RetentionPanel({ canSwitch }: { canSwitch: boolean }) {
  const { settings, rows } = await loadRetention();
  const groups = groupRetention(rows);
  const last = settings.last_result;
  return <section className={styles.card}>
    <h2>Removing old member details</h2>
    <p className={styles.lead}>
      Our Privacy Policy keeps a membership record for up to 12 months after membership ends. A record is anonymised
      after 31 December of the year after the last year the member paid for. If they never paid, it is 12 months after the
      record was created. About a month before, they are emailed a warning (a Junior’s guardian is copied). Their name, contact
      details, date of birth and address are then removed, and any website login is deleted. Payment amounts and dates are kept
      for the accounts, without a name.
    </p>
    <p className={styles.lead}>
      Never removed automatically: honorary members, officers and committee members, suspended members, anyone on a legal hold,
      and anyone with a payment that still needs checking. Those appear below as “held back” for a person to decide.
    </p>

    <div style={{ margin: "22px 0", padding: "16px 18px", border: "1px solid var(--line)", borderRadius: 8, background: settings.enabled ? "#eef4ef" : "#f8f3e6" }}>
      <strong>{settings.enabled ? `Switched on${settings.enabled_at ? ` since ${timestampDateLabel(settings.enabled_at)}` : ""}` : "Switched off"}</strong>
      <p className={styles.panelNote}>
        {settings.enabled
          ? "The daily job sends the warnings and removes details a month after the warning."
          : "Nobody is being warned or removed yet. Check the lists below first. Once it is switched on, the people under “Will be warned” get an email at the next daily run."}
      </p>
      {last && typeof last === "object" ? <p className={styles.panelNote}>
        Last daily check{settings.last_run_on ? ` (${retentionDateLabel(settings.last_run_on)})` : ""}:{" "}
        {settings.enabled
          ? `${Number(last.warned ?? 0)} warned, ${Number(last.anonymised ?? 0)} removed${Number(last.failed ?? 0) ? `, ${Number(last.failed)} could not be removed` : ""}.`
          : `${Number(last.would_warn ?? 0)} would have been warned and ${Number(last.would_anonymise ?? 0)} removed.`}
      </p> : null}
      {canSwitch ? <form action={setMembershipRetention} style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <input type="hidden" name="enabled" value={settings.enabled ? "false" : "true"}/>
        {!settings.enabled ? <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
          <input type="checkbox" name="reviewed" style={{ marginTop: 4 }}/>
          <span>I have checked the lists below. I understand that people will be emailed and that their details are removed a month later.</span>
        </label> : null}
        <div><PendingSubmitButton className={settings.enabled ? "button outline" : "button dark"} pendingLabel="Saving…">{settings.enabled ? "Switch off" : "Switch on automatic removal"}</PendingSubmitButton></div>
      </form> : <p className={styles.panelNote}>Only an administrator can switch this on or off.</p>}
    </div>

    <List title="Will be removed at the next daily run" rows={groups.ready} showWarned
      note="Past their date, and either warned at least four weeks ago or with no email address to warn."
      empty="Nobody yet."/>
    <List title="Will be warned at the next daily run" rows={groups.warn}
      note="Within a month of their date, or already past it, and not yet warned."
      empty="Nobody yet."/>
    <List title="Warned and waiting" rows={groups.waiting} showWarned
      note="They have been emailed. Their details are removed once four weeks have passed and their date is over."
      empty="Nobody is waiting."/>
    <List title="Held back for a person to decide" rows={groups.blocked}
      note="Past or close to their date, but not removed automatically. Change the reason (lift the legal hold, settle the payment, or decide about the officer or suspended member) and they will be picked up."
      empty="Nobody is held back."/>
    <List title="Coming up in the next two months" rows={groups.upcoming}
      note="Not yet within a month of their date."
      empty="Nobody is coming up."/>
  </section>;
}
