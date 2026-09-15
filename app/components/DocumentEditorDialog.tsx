"use client";

import { type FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Upload } from "lucide-react";
import { updateDocumentMetadata, replaceDocumentVersion } from "@/lib/actions/content";
import { EditorDialog } from "./EditorDialog";
import { SignedUploadField } from "./SignedUploadField";

type DocumentRecord = { id: string; name: string; descriptions: string | null; version: number };
type Mode = "details" | "replace";

export function DocumentEditorDialog({ document, mode }: { document: DocumentRecord; mode: Mode }) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [instance, setInstance] = useState(0);
  return <EditorDialog trigger={mode === "details" ? <><Pencil/>Edit details</> : <><Upload/>Replace version</>}
    className="document-upload-dialog document-editor-dialog" eyebrow="Society Library" title={mode === "details" ? "Edit document details" : "Replace PDF version"}
    description={document.name}
    dirty={dirty} busy={busy} onAfterClose={() => { setDirty(false); setInstance(value => value + 1); }}>
    {({ requestClose }) => <DocumentEditorForm key={`${instance}:${document.name}:${document.descriptions}:${document.version}`} document={document} mode={mode} requestClose={requestClose} setDirty={setDirty} setBusy={setBusy}/>}
  </EditorDialog>;
}

function DocumentEditorForm({ document, mode, requestClose, setDirty, setBusy }: {
  document: DocumentRecord; mode: Mode; requestClose: () => void;
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
    if (submitting.current || uploading || (mode === "replace" && !ready)) return;
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    data.set("id", document.id);
    submitting.current = true;
    setPending(true); setBusy(true); setError("");
    try {
      const result = mode === "details" ? await updateDocumentMetadata(data) : await replaceDocumentVersion(data);
      if (result.error) {
        setError(result.error);
        if (result.reselectFile) { setReady(false); setFileInstance(value => value + 1); }
      } else if (result.success) {
        setDirty(false);
        form.closest("dialog")?.close();
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
          {mode === "details" ? <>
            <label className="wide">Document name<input name="name" defaultValue={document.name} minLength={2} maxLength={180} required/></label>
            <label className="wide">Description (optional)<textarea name="descriptions" defaultValue={document.descriptions || ""} maxLength={5000} rows={5} placeholder="Briefly explain what’s in this document and who may find it useful."/></label>
          </> : <>
          <p className="wide document-replacement-name">{document.name}</p>
          <p className="wide event-step-help">Current version: {document.version}. The new PDF will replace the current file and be saved as version {document.version + 1}. The document name and description will stay the same.</p>
          <div className="wide document-upload-file">
            <SignedUploadField key={fileInstance} kind="document" label="Replacement PDF" required onUploadStateChange={(state) => {
              setUploading(state.uploading); setReady(state.ready); setBusy(state.uploading);
            }}/>
            <p className="event-step-help">PDF only, up to 12 MB. Members will see the new version once saved.</p>
          </div>
          </>}
        </div>
      </fieldset>
    </div>
    <footer className="event-editor-footer">
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="button outline" type="button" disabled={pending || uploading} onClick={requestClose}>Cancel</button>
      <div><button className="button dark" type="submit" disabled={pending || uploading || (mode === "replace" && !ready)}>{mode === "replace" && <Upload/>}{pending ? "Saving…" : uploading ? "Uploading PDF…" : mode === "details" ? "Save changes" : "Replace PDF"}</button></div>
    </footer>
  </form>;
}
