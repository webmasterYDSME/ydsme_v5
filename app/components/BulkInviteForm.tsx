"use client";

import { useState } from "react";
import { FileUp } from "lucide-react";
import { bulkInviteMembers } from "@/lib/actions/content";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

export function BulkInviteForm() {
  const [preview, setPreview] = useState<Array<{ email: string; name: string }>>([]);
  async function inspect(file?: File) {
    if (!file) return setPreview([]);
    const lines = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
    const headers = (lines[0] || "").split(",").map(value => value.trim().replace(/^"|"$/g, "").toLowerCase());
    const emailIndex = headers.indexOf("email");
    const nameIndex = headers.findIndex(value => value === "full_name" || value === "name");
    setPreview(lines.slice(1, 11).map(line => { const values = line.split(",").map(value => value.trim().replace(/^"|"$/g, "")); return { email: values[emailIndex] || "Invalid email column", name: values[nameIndex] || "Invalid name column" }; }));
  }
  return <form action={bulkInviteMembers} className="stack-form"><label>Member spreadsheet (.csv)<input type="file" name="file" accept="text/csv,.csv" required onChange={event => void inspect(event.target.files?.[0])}/></label><p className="form-help">Add up to 250 people in a file no larger than 1 MB. Existing email addresses are listed for review and are never overwritten.</p>{preview.length ? <div className="import-preview"><h2>People to invite</h2><p>Showing the first {preview.length} people. Nothing is sent until you confirm below.</p>{preview.map((row, index) => <div key={index}><strong>{row.name}</strong><span>{row.email}</span></div>)}</div> : null}<PendingSubmitButton className="button dark" pendingLabel="Sending invitations…"><FileUp/>Send invitations</PendingSubmitButton></form>;
}
