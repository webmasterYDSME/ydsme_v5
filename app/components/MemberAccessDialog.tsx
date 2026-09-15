"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { EditorDialog } from "./EditorDialog";
import { MemberAccessActions } from "./MemberAccessActions";

export function MemberAccessDialog({ userId, name }: { userId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  return <EditorDialog trigger={<><Pencil/>Manage member</>} triggerClassName="people-manage-button"
    className="member-access-dialog" eyebrow="People" title="Manage member" description={name} busy={busy}>
    {({ requestClose }) => <div className="people-dialog-body">
      <MemberAccessActions userId={userId} disabled={busy} setBusy={setBusy}/>
      <footer className="event-editor-footer"><button className="button outline" disabled={busy} onClick={requestClose}>Close</button></footer>
    </div>}
  </EditorDialog>;
}
