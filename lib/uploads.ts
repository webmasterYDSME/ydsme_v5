import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type UploadKind = "event-image" | "committee-image" | "document" | "project-image";

const configs = {
  "event-image": { bucket: "images" as const, maximum: 8 * 1024 * 1024, prefix: "events" },
  "committee-image": { bucket: "images" as const, maximum: 8 * 1024 * 1024, prefix: "committees" },
  document: { bucket: "documents" as const, maximum: 12 * 1024 * 1024, prefix: "files" },
  "project-image": { bucket: "project-images" as const, maximum: 8 * 1024 * 1024, prefix: "projects" },
};

function detectedExtension(bytes: Uint8Array, kind: UploadKind) {
  if (kind === "document") return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 ? "pdf" : null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  if (String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" && ["avif", "avis"].includes(String.fromCharCode(...bytes.slice(8, 12)))) return "avif";
  return null;
}

const PDF_ACTIVE_CONTENT = /\/(?:JavaScript|JS|OpenAction|AA|Launch|EmbeddedFiles?|RichMedia|XFA|AcroForm)\b/;

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function hasSafePdfStructure(bytes: Uint8Array) {
  const source = new TextDecoder("latin1").decode(bytes);
  if (!source.startsWith("%PDF-1.")) return false;
  const lastEndMarker = source.lastIndexOf("%%EOF");
  if (lastEndMarker < Math.max(0, source.length - 2048)) return false;
  const normalizedNames = source.replace(/#([0-9a-f]{2})/gi, (_match, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return !PDF_ACTIVE_CONTENT.test(normalizedNames);
}

export async function finalizeQuarantinedUpload(kind: UploadKind, quarantinePath: string, userId: string) {
  const config = configs[kind];
  if (
    !quarantinePath.startsWith(`quarantine/${userId}/`)
    || quarantinePath.includes("\\")
    || quarantinePath.split("/").some((segment) => !segment || segment === "." || segment === "..")
    || hasControlCharacters(quarantinePath)
  ) throw new Error("Invalid quarantine object.");
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(config.bucket).download(quarantinePath);
  if (error || !data || data.size < 4 || data.size > config.maximum) {
    await admin.storage.from(config.bucket).remove([quarantinePath]);
    throw new Error("The uploaded file failed validation.");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  const extension = detectedExtension(bytes.subarray(0, 32), kind);
  if (!extension || (kind === "document" && !hasSafePdfStructure(bytes))) {
    await admin.storage.from(config.bucket).remove([quarantinePath]);
    throw new Error("The uploaded file signature is not allowed.");
  }
  const finalPath = `${config.prefix}/${crypto.randomUUID()}.${extension}`;
  const { error: moveError } = await admin.storage.from(config.bucket).move(quarantinePath, finalPath);
  if (moveError) throw new Error("The uploaded file could not be finalized.");
  return { bucket: config.bucket, path: finalPath, canonicalPath: `${config.bucket}/${finalPath}` };
}
