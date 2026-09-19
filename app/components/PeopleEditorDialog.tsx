"use client";

import styles from "./PeopleEditorDialog.module.css";
import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { MemberAccessActions } from "./MemberAccessActions";
import { EditorDialog } from "./EditorDialog";
import { SignedUploadField } from "./SignedUploadField";
import { savePeople } from "@/lib/actions/people";
import type { AppRole } from "@/lib/auth";
import { nameFieldProps } from "@/app/components/nameField";

export type PeopleAccount = { id: string; full_name: string | null; email: string; role: AppRole; officer: boolean };
export type CommitteeListing = { id: number; name: string; title: string; email: string; file_url: string; user_id: string | null; is_public: boolean; position: number; updated_at: string };

export function PeopleEditorDialog({ member, listing, accounts = [], actorId, membershipEnabled, triggerLabel, manageAccess = false }: {
  member?: PeopleAccount; listing?: CommitteeListing; accounts?: PeopleAccount[]; actorId: string; membershipEnabled: boolean; triggerLabel?: string; manageAccess?: boolean;
}) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instance, setInstance] = useState(0);
  const title = member ? "Manage member" : listing ? "Edit committee position" : "Add committee position";
  return <EditorDialog trigger={<>{member || listing ? <Pencil/> : <Plus/>}{triggerLabel || title}</>}
    triggerClassName={!member && !listing ? "button dark" : "people-manage-button"} className="people-editor-dialog"
    eyebrow="People" title={title} description={member ? member.full_name || member.email : "Manage public positions, including vacancies and people without accounts."}
    dirty={dirty} busy={busy} onAfterClose={() => { setDirty(false); setInstance(value => value + 1); }}>
    {({ requestClose }) => <div className="people-dialog-body"><PeopleForm externalBusy={busy} key={`${instance}:${member?.full_name}:${member?.role}:${member?.officer}:${listing?.updated_at}`} {...{ member, listing, accounts, actorId, membershipEnabled, requestClose, setDirty, setBusy }}/>{manageAccess && member && member.id !== actorId && <MemberAccessActions userId={member.id} disabled={dirty || busy} setBusy={setBusy}/>}</div>}
  </EditorDialog>;
}

function PeopleForm({ member, listing, accounts, actorId, membershipEnabled, requestClose, setDirty, setBusy, externalBusy }: {
  member?: PeopleAccount; listing?: CommitteeListing; accounts: PeopleAccount[]; actorId: string; membershipEnabled: boolean; externalBusy: boolean;
  requestClose: () => void; setDirty: (value: boolean) => void; setBusy: (value: boolean) => void;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const initialAccount = member || accounts.find(account => account.id === listing?.user_id);
  const [publicName, setPublicName] = useState(listing?.name ?? initialAccount?.full_name ?? "");
  const publicNameEdited = useRef(false);
  const [selectedId, setSelectedId] = useState(initialAccount?.id || "");
  const selected = member || accounts.find(account => account.id === selectedId);
  const [role, setRole] = useState<AppRole>(initialAccount?.role || "committee");
  const [officer, setOfficer] = useState(initialAccount?.officer || false);
  const [hasListing, setHasListing] = useState(Boolean(listing) || !member);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [fileInstance, setFileInstance] = useState(0);
  const demoting = Boolean(selected && selected.role !== "member" && role === "member");
  const listingAllowed = !selected || role !== "member";
  const listingEnabled = hasListing && listingAllowed;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || uploading || externalBusy) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    data.set("user_id", selectedId); data.set("role", role);
    if (member) data.set("expected_full_name", member.full_name || "");
    data.set("expected_role", selected?.role || "member");
    data.set("officer", selected && role === "committee" && officer ? "on" : "");
    data.set("has_listing", listingEnabled ? "on" : "");
    for (const name of ["name", "title", "email"]) if (!data.has(name)) data.set(name, "");
    if (listing) { data.set("listing_id", String(listing.id)); data.set("listing_updated_at", listing.updated_at); }
    submitting.current = true; setPending(true); setBusy(true); setError("");
    try {
      const result = await savePeople(data);
      if (result.error) {
        setError(result.error);
        if (result.reselectFile) setFileInstance(value => value + 1);
      } else {
        setDirty(false); form.closest("dialog")?.close(); router.refresh();
      }
    } catch { setError("The changes could not be saved. Your details are still here; please try again."); }
    finally { submitting.current = false; setPending(false); setBusy(false); }
  }

  return <form className={`editor-form event-editor-form event-editor-simple document-upload-form people-editor-form ${styles.form}`} onSubmit={submit} onChange={() => { setDirty(true); setError(""); }}>
    <div className="event-editor-panel"><fieldset className="event-editor-fields" disabled={pending || externalBusy}>
      <div className="event-editor-details-grid">
        {!member && <label className="wide">Linked account<select aria-label="Linked account" value={selectedId} onChange={event => {
          const account = accounts.find(item => item.id === event.target.value);
          if (!listing && !publicNameEdited.current) setPublicName(account?.full_name || "");
          setSelectedId(event.target.value); setRole(account?.role || "committee"); setOfficer(account?.officer || false);
        }}><option value="">No account / vacant position</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.full_name || account.email}</option>)}</select></label>}
        {member && selected && <>
          <label className="wide">Full name<input name="full_name" {...nameFieldProps} defaultValue={member.full_name || ""} minLength={2} maxLength={180} autoComplete="off" required/></label>
          <label className={role === "committee" ? "" : "wide"}>Website role<select aria-label="Website role" value={role} disabled={selected.id === actorId} onChange={event => { setRole(event.target.value as AppRole); if (event.target.value !== "committee") setOfficer(false); }}>
            <option value="member">Member</option><option value="committee">Committee</option><option value="administrator">Administrator</option>
          </select></label>
          {selected.id === actorId && <p className="wide event-step-help">Another administrator must change your role.</p>}
          {role === "committee" && <label className="people-check"><input type="checkbox" checked={officer} onChange={event => setOfficer(event.target.checked)}/><span>Grant Membership Officer access<small>Manage memberships, donations and member access.</small></span></label>}
          {role === "administrator" && <p className="wide event-step-help">Administrators already have membership and donation management permissions.</p>}
          {!membershipEnabled && role !== "member" && <p className="wide event-step-help">Membership records are currently managed in MemberMojo. Built-in membership administration stays unavailable until enabled; donation and member-status permissions still apply.</p>}
          {demoting && <p className="wide form-message error" role="status">Saving Member access will revoke Membership Officer access and hide and unlink all committee listings for this account.</p>}
        </>}
        <h3 className="wide">Public committee listing</h3>
        {member && selected && listingAllowed && <label className="wide people-check"><input type="checkbox" checked={hasListing} onChange={event => setHasListing(event.target.checked)}/><span>Include a committee position for this account</span></label>}
        {!listingAllowed && !demoting && <p className="wide event-step-help">Choose Committee or Administrator access to link a committee position to this account.</p>}
        {listingEnabled && <>
          <label>Position<input name="title" defaultValue={listing?.title || ""} minLength={2} maxLength={180} placeholder="e.g. Secretary" required/></label>
          <label>Public name (blank if vacant)<input name="name" value={publicName} onChange={event => { publicNameEdited.current = true; setPublicName(event.target.value); }} maxLength={180} placeholder="Enter the name to display publicly"/></label>
          <label>Public contact email (optional)<input type="email" name="email" defaultValue={listing?.email || ""} maxLength={254}/></label>
          <label>Display order<input type="number" name="position" defaultValue={listing?.position || 0} min="0" max="9999"/></label>
          <details className={`wide document-upload-file ${styles.portrait}`}><summary>{listing?.file_url ? "Replace portrait (optional)" : "Add a portrait (recommended)"}</summary><SignedUploadField key={fileInstance} kind="committee-image" label="Portrait" hideLabel onUploadStateChange={state => { setUploading(state.uploading); setBusy(state.uploading); }}/><p className="event-step-help">Use a clear head-and-shoulders photo. {listing?.file_url ? "Your current portrait is kept unless replaced." : ""}</p></details>
          <label className="wide people-check"><input type="checkbox" name="is_public" defaultChecked={listing?.is_public || false}/><span>Show on the public committee page<small>Publishes these details. Leave unchecked to keep the position hidden.</small></span></label>
        </>}
        {listing && !hasListing && listingAllowed && <p className="wide event-step-help">Saving will hide and unlink this position. It will remain in the Committee tab for future use.</p>}
      </div>
    </fieldset></div>
    <footer className="event-editor-footer">
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button outline" type="button" disabled={pending || uploading || externalBusy} onClick={requestClose}>Cancel</button>
      <div><button className="button dark" type="submit" disabled={pending || uploading || externalBusy}>{pending ? "Saving…" : uploading ? "Uploading portrait…" : "Save changes"}</button></div>
    </footer>
  </form>;
}
