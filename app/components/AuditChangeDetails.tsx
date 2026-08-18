"use client";

import { useState } from "react";

type AuditState = { before: unknown; after: unknown };

export function AuditChangeDetails({ id }: { id: string }) {
  const [state, setState] = useState<AuditState | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function load() {
    if (state || status !== "idle") return;
    setStatus("loading");
    try {
      const response = await fetch(`/admin/audit/${encodeURIComponent(id)}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("Audit details request failed");
      setState(await response.json() as AuditState);
    } catch {
      setStatus("error");
      return;
    }
    setStatus("idle");
  }

  return <details className="audit-changes" onToggle={(event) => {
    if (event.currentTarget.open) void load();
  }}>
    <summary>View redacted changes</summary>
    {status === "loading" ? <p>Loading changes…</p> : null}
    {status === "error" ? <p>Unable to load changes.</p> : null}
    {state ? (state.before || state.after ? <pre>{JSON.stringify(state, null, 2)}</pre> : <p>No value changes were recorded.</p>) : null}
  </details>;
}
