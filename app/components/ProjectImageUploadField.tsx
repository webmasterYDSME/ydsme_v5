"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { createUploadIntent } from "@/lib/actions/uploads";
import type { Database } from "@/lib/supabase/database";

type ReadyUpload = { name: string; path: string };

export function ProjectImageUploadField({
  label,
  maximum = 5,
  required = false,
}: {
  label: string;
  maximum?: number;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<ReadyUpload[]>([]);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(files?: FileList | null) {
    const selected = Array.from(files ?? []).slice(0, maximum);
    setUploads([]);
    if (!selected.length) return;
    setUploading(true);
    setMessage(`Preparing ${selected.length === 1 ? "image" : `${selected.length} images`}…`);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setMessage("Storage is not configured.");
      setUploading(false);
      return;
    }

    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient<Database>(url, key, { auth: { persistSession: false } });
    const completed: ReadyUpload[] = [];

    for (const file of selected) {
      const intent = await createUploadIntent({ kind: "project-image", name: file.name, size: file.size, type: file.type });
      if (!intent.ok) {
        setMessage(intent.error);
        setUploads([]);
        if (inputRef.current) inputRef.current.value = "";
        setUploading(false);
        return;
      }
      const { error } = await client.storage.from(intent.bucket).uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
      if (error) {
        setMessage("An image failed to upload. Please choose the images again.");
        setUploads([]);
        if (inputRef.current) inputRef.current.value = "";
        setUploading(false);
        return;
      }
      completed.push({ name: file.name, path: intent.path });
    }

    setUploads(completed);
    setMessage(`${completed.length} ${completed.length === 1 ? "image" : "images"} ready. Save the form to finish.`);
    setUploading(false);
  }

  function clear() {
    setUploads([]);
    setMessage("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return <div className="project-image-upload">
    <label>
      {label}
      <span className="project-image-picker">
        <ImagePlus aria-hidden="true"/>
        <span>{uploading ? "Uploading securely…" : maximum === 1 ? "Choose a photograph" : `Choose up to ${maximum} photographs`}</span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple={maximum > 1}
          required={required}
          disabled={uploading}
          onChange={(event) => void upload(event.currentTarget.files)}
        />
      </span>
    </label>
    {uploads.map((upload) => <input key={upload.path} type="hidden" name="quarantine_path" value={upload.path}/>) }
    <div className="project-upload-status">
      <small role="status">{message}</small>
      {uploads.length ? <button type="button" onClick={clear}><X aria-hidden="true"/>Clear</button> : null}
    </div>
  </div>;
}
