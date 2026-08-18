"use client";

import { useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { createUploadIntent } from "@/lib/actions/uploads";
import type { Database } from "@/lib/supabase/database";

type Kind = "event-image" | "committee-image" | "document";

export function SignedUploadField({ kind, label, required = false }: { kind: Kind; label: string; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState("");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const accept = kind === "document" ? "application/pdf" : "image/jpeg,image/png,image/webp,image/avif";

  async function upload(file?: File) {
    setPath("");
    if (!file) return;
    setUploading(true);
    setMessage("Preparing secure upload…");
    const intent = await createUploadIntent({ kind, name: file.name, size: file.size, type: file.type });
    if (!intent.ok) {
      setMessage(intent.error);
      if (inputRef.current) inputRef.current.value = "";
      setUploading(false);
      return;
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      setMessage("Storage is not configured.");
      setUploading(false);
      return;
    }
    const client = createClient<Database>(url, key, { auth: { persistSession: false } });
    const { error } = await client.storage.from(intent.bucket).uploadToSignedUrl(intent.path, intent.token, file, { contentType: file.type });
    if (error) {
      setMessage("Upload failed. Please choose the file again.");
      if (inputRef.current) inputRef.current.value = "";
    } else {
      setPath(intent.path);
      setMessage("Upload ready. Save the form to finish.");
    }
    setUploading(false);
  }

  return <label>{label}<input ref={inputRef} type="file" accept={accept} required={required} disabled={uploading} onChange={(event) => void upload(event.target.files?.[0])}/><input type="hidden" name="quarantine_path" value={path}/><small role="status">{message}</small></label>;
}
