import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type UploadKind = "event-image" | "committee-image" | "document";

const configs = {
  "event-image": { bucket: "images" as const, maximum: 8 * 1024 * 1024, prefix: "events" },
  "committee-image": { bucket: "images" as const, maximum: 8 * 1024 * 1024, prefix: "committees" },
  document: { bucket: "documents" as const, maximum: 12 * 1024 * 1024, prefix: "files" },
};

function detectedExtension(bytes: Uint8Array, kind: UploadKind) {
  if (kind === "document") return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 ? "pdf" : null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  if (String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))) return "avif";
  return null;
}

export async function finalizeQuarantinedUpload(kind: UploadKind, quarantinePath: string, userId: string) {
  const config = configs[kind];
  if (!quarantinePath.startsWith(`quarantine/${userId}/`) || quarantinePath.includes("..")) throw new Error("Invalid quarantine object.");
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(config.bucket).download(quarantinePath);
  if (error || !data || data.size < 4 || data.size > config.maximum) {
    await admin.storage.from(config.bucket).remove([quarantinePath]);
    throw new Error("The uploaded file failed validation.");
  }
  const bytes = new Uint8Array(await data.slice(0, 32).arrayBuffer());
  const extension = detectedExtension(bytes, kind);
  if (!extension) {
    await admin.storage.from(config.bucket).remove([quarantinePath]);
    throw new Error("The uploaded file signature is not allowed.");
  }
  const finalPath = `${config.prefix}/${crypto.randomUUID()}.${extension}`;
  const { error: moveError } = await admin.storage.from(config.bucket).move(quarantinePath, finalPath);
  if (moveError) throw new Error("The uploaded file could not be finalized.");
  return { bucket: config.bucket, path: finalPath, canonicalPath: `${config.bucket}/${finalPath}` };
}
