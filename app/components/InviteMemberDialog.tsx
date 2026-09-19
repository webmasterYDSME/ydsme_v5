"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { inviteMember } from "@/lib/actions/content";
import { EditorDialog } from "./EditorDialog";
import { nameFieldProps } from "@/app/components/nameField";

export function InviteMemberDialog() {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instance, setInstance] = useState(0);
  return <EditorDialog trigger={<><UserPlus/>Invite a member</>} triggerClassName="button dark"
    className="invite-member-dialog" eyebrow="People" title="Invite a member"
    description="Send an email invitation to create a website account."
    dirty={dirty} busy={busy} onAfterClose={() => { setDirty(false); setInstance(value => value + 1); }}>
    {({ requestClose }) => <InviteForm key={instance} requestClose={requestClose} setDirty={setDirty} setBusy={setBusy}/>}
  </EditorDialog>;
}

function InviteForm({ requestClose, setDirty, setBusy }: {
  requestClose: () => void; setDirty: (value: boolean) => void; setBusy: (value: boolean) => void;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (submitting.current || !form.reportValidity()) return;
    submitting.current = true;
    setPending(true); setBusy(true); setError("");
    try {
      const result = await inviteMember(new FormData(form));
      if (result.error) setError(result.error);
      else if (result.success) {
        setDirty(false);
        form.closest("dialog")?.close();
        router.push("/admin/members?notice=invitation-sent");
        router.refresh();
      }
    } catch {
      setError("We couldn’t confirm whether the invitation was sent. Check the member list before trying again.");
    } finally {
      submitting.current = false;
      setPending(false); setBusy(false);
    }
  }
  return <form className="editor-form event-editor-form event-editor-simple" onSubmit={submit} onChange={() => { setDirty(true); setError(""); }}>
    <div className="event-editor-panel"><fieldset className="event-editor-fields" disabled={pending}>
      <div className="event-editor-details-grid">
        <label className="wide">Full name<input name="full_name" {...nameFieldProps} autoComplete="name" minLength={2} maxLength={180} placeholder="e.g. Alex Smith" required/></label>
        <label className="wide">Email address<input type="email" name="email" autoComplete="email" maxLength={254} placeholder="alex@example.com" required/></label>
      </div>
    </fieldset></div>
    <footer className="event-editor-footer">
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button outline" type="button" disabled={pending} onClick={requestClose}>Cancel</button>
      <div><button className="button dark" type="submit" disabled={pending}><UserPlus/>{pending ? "Sending invitation…" : "Send invitation"}</button></div>
    </footer>
  </form>;
}
