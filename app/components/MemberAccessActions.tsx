"use client";

import { useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Archive, UserX } from "lucide-react";
import { deleteMember, suspendMember } from "@/lib/actions/content";

function AccessButton({ archive, disabled, setBusy }: { archive?: boolean; disabled: boolean; setBusy: (value: boolean) => void }) {
  const { pending } = useFormStatus();
  useEffect(() => { setBusy(pending); }, [pending, setBusy]);
  return <button className={`member-action-button ${archive ? "archive-button" : "suspend-button"}`} disabled={disabled || pending}>
    {archive ? <Archive/> : <UserX/>}{pending ? "Updating…" : archive ? "Archive member" : "Suspend access"}
  </button>;
}

export function MemberAccessActions({ userId, disabled, setBusy }: { userId: string; disabled: boolean; setBusy: (value: boolean) => void }) {
  return <details className="people-access-actions">
    <summary>Suspend or archive account</summary>
    <p>Suspend to pause sign-in. Archive when someone leaves the Society. An administrator can restore access.</p>
    {disabled && <p>Save or cancel your changes before updating account access.</p>}
    <div className="member-actions member-action-group">
      <form action={suspendMember}><input type="hidden" name="user_id" value={userId}/><AccessButton disabled={disabled} setBusy={setBusy}/></form>
      <form action={deleteMember}><input type="hidden" name="user_id" value={userId}/><AccessButton archive disabled={disabled} setBusy={setBusy}/></form>
    </div>
  </details>;
}
