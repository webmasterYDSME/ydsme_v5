"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveWorkshop } from "@/lib/actions/content";
import { EditorDialog } from "./EditorDialog";
import { DatePicker } from "./DatePicker";

export type WorkshopEditorRecord = { id: string; title: string; descriptions: string; notes: string; date: string; start_time: string; end_time: string; host_name: string; venue: string; virtual_link: string; maximum_participants: number; lifecycle_status: string; updated_at: string };

export function WorkshopEditorDialog({ workshop, triggerClassName }: { workshop?: WorkshopEditorRecord; triggerClassName?: string }) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instance, setInstance] = useState(0);
  return <EditorDialog
    trigger={<>{workshop ? <Pencil/> : <Plus/>}{workshop ? "Edit" : "Create workshop"}</>}
    triggerClassName={triggerClassName}
    className="workshop-editor-dialog"
    eyebrow="Skills & sessions"
    title={workshop ? `Edit ${workshop.title}` : "Create a workshop"}
    description="Plan a session for members. Save a draft or publish when it’s ready."
    dirty={dirty} busy={busy}
    onAfterClose={() => { setDirty(false); setInstance(value => value + 1); }}
  >{({ requestClose }) => <WorkshopForm key={`${instance}:${workshop?.updated_at || "new"}`} workshop={workshop} requestClose={requestClose} setDirty={setDirty} setBusy={setBusy}/>}</EditorDialog>;
}

function WorkshopForm({ workshop, requestClose, setDirty, setBusy }: {
  workshop?: WorkshopEditorRecord; requestClose: () => void;
  setDirty: (dirty: boolean) => void; setBusy: (busy: boolean) => void;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(workshop?.lifecycle_status || "published");
  const dateId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(form);
    data.set("lifecycle_status", submitter?.value === "save" ? status : submitter?.value || "draft");
    submitting.current = true;
    setPending(true); setBusy(true); setError("");
    try {
      const result = await saveWorkshop(data);
      if (result.error) setError(result.error);
      else if (result.url) {
        setDirty(false);
        form.closest("dialog")?.close();
        router.push(result.url);
        router.refresh();
      }
    } catch {
      setError("The workshop could not be saved. Your details are still here; please try again.");
    } finally {
      submitting.current = false;
      setPending(false); setBusy(false);
    }
  }

  return <form className="editor-form event-editor-form event-editor-simple workshop-editor-form" onSubmit={submit} onChange={() => { setDirty(true); setError(""); }}>
    <div className="event-editor-panel">
      <fieldset className="event-editor-fields" disabled={pending}>
        {workshop && <input type="hidden" name="id" value={workshop.id}/>}
        <div className="event-editor-details-grid">
          <h3 className="wide">Session details</h3>
          <label className="wide">Workshop title<input name="title" defaultValue={workshop?.title} minLength={2} maxLength={180} placeholder="e.g. An introduction to lathe turning" required/></label>
          <label className="wide">Description<textarea name="descriptions" defaultValue={workshop?.descriptions} minLength={2} maxLength={5000} rows={4} placeholder="Explain what members will learn, who the session is for, and what they should bring." required/></label>
          <label>Host<input name="host_name" defaultValue={workshop?.host_name} minLength={2} maxLength={180} placeholder="Who is leading the session?" required/></label>
          <label>Maximum places<input type="number" name="maximum_participants" min="1" max="500" defaultValue={workshop?.maximum_participants ?? 20} required/></label>
          <h3 className="wide">When & where</h3>
          <label className="wide" htmlFor={dateId}>Date<DatePicker id={dateId} name="date" defaultValue={workshop?.date} required/></label>
          <label>Start time<input type="time" name="start_time" defaultValue={workshop?.start_time.slice(0,5)} required/></label>
          <label>End time<input type="time" name="end_time" defaultValue={workshop?.end_time.slice(0,5)} required/></label>
          <label className="wide">Venue<input name="venue" defaultValue={workshop?.venue} minLength={2} maxLength={240} placeholder="Building, room or meeting point" required/></label>
          <h3 className="wide">Additional information</h3>
          <label className="wide">Online meeting link (optional)<input type="url" name="virtual_link" defaultValue={workshop?.virtual_link} maxLength={2048} placeholder="https://…"/></label>
          <label className="wide">Notes (optional)<textarea name="notes" defaultValue={workshop?.notes} maxLength={5000} rows={3} placeholder="Add preparation, equipment or access information for members."/></label>
          {workshop && <label className="wide">Status<select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></label>}
          <p className="wide event-step-help">Published workshops are available to members. Drafts are only visible to the committee and administrators.</p>
        </div>
      </fieldset>
    </div>
    <footer className="event-editor-footer">
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button outline" type="button" disabled={pending} onClick={requestClose}>Cancel</button>
      <div>
        <button className="button outline" type="submit" value="draft" disabled={pending}>Save draft</button>
        <button className="button dark" type="submit" value={workshop ? "save" : "published"} disabled={pending}>{pending ? "Saving…" : workshop ? "Save changes" : "Publish workshop"}</button>
      </div>
    </footer>
  </form>;
}
