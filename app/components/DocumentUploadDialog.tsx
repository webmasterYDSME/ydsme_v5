"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { uploadDocument } from "@/lib/actions/content";
import { EditorDialog } from "./EditorDialog";
import { SignedUploadField } from "./SignedUploadField";

const categoryLabels: Record<string, string> = { minute: "Committee minutes", publication: "Publication", "insurance-policy": "Insurance policy", "club-rule": "Club rules", calendar: "Calendar", "boiler-guide": "Boiler guidance", others: "Other resources" };

export function DocumentUploadDialog({ categories }: { categories: readonly string[] }) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instance, setInstance] = useState(0);
  return <EditorDialog trigger={<><Upload/>Upload a PDF</>} triggerClassName="button dark event-create-trigger"
    className="document-upload-dialog" eyebrow="Society Library" title="Upload a PDF"
    description="Give your document a clear name and add a PDF to share with members."
    dirty={dirty} busy={busy} onAfterClose={() => { setDirty(false); setInstance(value => value + 1); }}>
    {({ requestClose }) => <DocumentUploadForm key={instance} categories={categories} requestClose={requestClose} setDirty={setDirty} setBusy={setBusy}/>}
  </EditorDialog>;
}

function DocumentUploadForm({ categories, requestClose, setDirty, setBusy }: {
  categories: readonly string[]; requestClose: () => void;
  setDirty: (value: boolean) => void; setBusy: (value: boolean) => void;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [ready, setReady] = useState(false);
  const [fileInstance, setFileInstance] = useState(0);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || uploading || !ready) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    submitting.current = true;
    setPending(true); setBusy(true); setError("");
    try {
      const result = await uploadDocument(data);
      if (result.error) {
        setError(result.error);
        if (result.reselectFile) { setReady(false); setFileInstance(value => value + 1); }
      } else if (result.url) {
        setDirty(false);
        form.closest("dialog")?.close();
        router.push(result.url);
        router.refresh();
      }
    } catch {
      setError("The document could not be saved. Your details are still here; please try again.");
    } finally {
      submitting.current = false;
      setPending(false); setBusy(false);
    }
  }

  return <form className="editor-form event-editor-form event-editor-simple document-upload-form" onSubmit={submit}
    onChange={() => { setDirty(true); setError(""); }}>
    <div className="event-editor-panel">
      <fieldset className="event-editor-fields" disabled={pending}>
        <div className="event-editor-details-grid">
          <label className="wide">Document name<input name="name" minLength={2} maxLength={180} placeholder="e.g. Society newsletter — October 2026" required/></label>
          <label className="wide">Category<select name="category" defaultValue={categories[0]}>{categories.map(category => <option key={category} value={category}>{categoryLabels[category] || category}</option>)}</select></label>
          <label className="wide">Description (optional)<textarea name="descriptions" maxLength={5000} rows={3} placeholder="Briefly explain what’s in this document and who may find it useful."/></label>
          <div className="wide document-upload-file">
            <SignedUploadField key={fileInstance} kind="document" label="PDF file" required onUploadStateChange={(state) => {
              setUploading(state.uploading); setReady(state.ready); setBusy(state.uploading);
            }}/>
            <p className="event-step-help">PDF only, up to 12 MB. The document will be available to members once saved.</p>
          </div>
        </div>
      </fieldset>
    </div>
    <footer className="event-editor-footer">
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button outline" type="button" disabled={pending || uploading} onClick={requestClose}>Cancel</button>
      <div><button className="button dark" type="submit" disabled={pending || uploading || !ready}><Upload/>{pending ? "Saving…" : uploading ? "Uploading PDF…" : "Save document"}</button></div>
    </footer>
  </form>;
}
