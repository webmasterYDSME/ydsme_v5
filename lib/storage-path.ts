import "server-only";

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

export function storageObjectPath(value: string | null | undefined, bucket: "images" | "documents") {
  if (!value?.startsWith(`${bucket}/`)) return null;
  const path = value.slice(bucket.length + 1);
  if (
    !path
    || path.startsWith("/")
    || path.startsWith("quarantine/")
    || path.includes("\\")
    || path.split("/").some((segment) => !segment || segment === "." || segment === "..")
    || hasControlCharacters(path)
  ) return null;
  return path;
}

export function documentStoragePath(value: string | null | undefined) {
  return storageObjectPath(value, "documents");
}
