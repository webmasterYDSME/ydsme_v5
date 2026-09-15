"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveAnnouncement } from "@/lib/actions/content";
import { AnnouncementFields } from "./AnnouncementFields";
import { EditorDialog } from "./EditorDialog";

type Announcement = { id: number; title: string; body: string; lifecycle_status: string; updated_at: string };

export function AnnouncementEditorDialog({ announcement, triggerClassName }: { announcement?: Announcement; triggerClassName?: string }) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instance, setInstance] = useState(0);
  return <EditorDialog
    trigger={<>{announcement ? <Pencil/> : <Plus/>}{announcement ? "Edit" : "Create announcement"}</>}
    triggerClassName={triggerClassName}
    className="announcement-editor-dialog"
    eyebrow="Public noticeboard"
    title={announcement ? `Edit ${announcement.title}` : "Create an announcement"}
    description="Share an update on the public website. Save a draft or publish when it’s ready."
    dirty={dirty} busy={busy}
    onAfterClose={() => { setDirty(false); setInstance(value => value + 1); }}
  >{({ requestClose }) => <AnnouncementForm key={`${instance}:${announcement?.updated_at || "new"}`} announcement={announcement} requestClose={requestClose} setDirty={setDirty} setBusy={setBusy}/>}</EditorDialog>;
}

function AnnouncementForm({ announcement, requestClose, setDirty, setBusy }: {
  announcement?: Announcement; requestClose: () => void;
  setDirty: (dirty: boolean) => void; setBusy: (busy: boolean) => void;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(form);
    data.set("lifecycle_status", submitter?.value || "draft");
    submitting.current = true;
    setPending(true); setBusy(true); setError("");
    try {
      const result = await saveAnnouncement(data);
      if (result.error) setError(result.error);
      else if (result.url) {
        setDirty(false);
        form.closest("dialog")?.close();
        router.push(result.url);
        router.refresh();
      }
    } catch {
      setError("The announcement could not be saved. Your details are still here; please try again.");
    } finally {
      submitting.current = false;
      setPending(false); setBusy(false);
    }
  }

  return <form className="editor-form event-editor-form event-editor-simple announcement-editor-form" onSubmit={submit} onChange={() => { setDirty(true); setError(""); }}>
    <div className="event-editor-panel">
      <fieldset className="event-editor-fields" disabled={pending}>
        {announcement && <input type="hidden" name="id" value={announcement.id}/>}
        <div className="event-editor-details-grid">
          <AnnouncementFields initialTitle={announcement?.title} initialDescription={announcement?.body}/>
          <p className="wide event-step-help">Published announcements are visible to everyone on the public website. Drafts are only visible to the committee and administrators.</p>
        </div>
      </fieldset>
    </div>
    <footer className="event-editor-footer">
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button outline" type="button" disabled={pending} onClick={requestClose}>Cancel</button>
      <div>
        <button className="button outline" type="submit" value="draft" disabled={pending}>Save draft</button>
        <button className="button dark" type="submit" value="published" disabled={pending}>{pending ? "Saving…" : announcement?.lifecycle_status === "published" ? "Save changes" : "Publish announcement"}</button>
      </div>
    </footer>
  </form>;
}
