"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

const MIN_CHARACTERS = 50;

export function EventDescriptionField({ value, onChange, name, audience, booking, invalid, errorId }: {
  value: string; onChange: (value: string) => void; name: string; audience: string; booking: string;
  invalid?: boolean; errorId?: string;
}) {
  const id = useId();
  const hintId = useId();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<{ text: string; source: string }>();
  const source = JSON.stringify({ description: value, name, audience, booking });
  const currentSource = useRef(source);
  useEffect(() => { currentSource.current = source; }, [source]);
  const remaining = Math.max(0, MIN_CHARACTERS - value.trim().length);
  const currentSuggestion = suggestion?.source === source ? suggestion : undefined;

  async function polish() {
    if (remaining || inFlight.current) return;
    inFlight.current = true;
    setPending(true); setError(""); setSuggestion(undefined);
    const submitted = source;
    try {
      const response = await fetch("/api/events/polish", { method: "POST", headers: { "Content-Type": "application/json" }, body: submitted, signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (currentSource.current !== submitted) return;
      if (!response.ok || typeof result.description !== "string") setError(result.error || "Polishing failed. Your description has not changed.");
      else setSuggestion({ text: result.description, source: submitted });
    } catch {
      if (currentSource.current === submitted) setError("Polishing failed. Your description has not changed. Please try again.");
    } finally { inFlight.current = false; setPending(false); }
  }

  return <div className="event-description-field wide">
    <div className="event-description-field-heading">
      <label htmlFor={id}>Description</label>
      <button type="button" className="event-polish-button" disabled={pending || remaining > 0} aria-describedby={hintId} onClick={polish}><Sparkles size={14} aria-hidden="true"/>{pending ? "Polishing…" : "Polish this"}</button>
    </div>
    <textarea id={id} name="descriptions" value={value} onChange={event => { onChange(event.target.value); setError(""); }} rows={4} minLength={2} maxLength={5000} required aria-invalid={invalid || undefined} aria-describedby={[hintId, errorId].filter(Boolean).join(" ")}
      placeholder="Tell visitors what’s happening and what they can expect. Add any confirmed activities, refreshments or practical details. Rough notes are fine—write at least 50 characters, then choose Polish this."/>
    <p id={hintId} className="event-polish-hint">{remaining ? `Write ${remaining} more ${remaining === 1 ? "character" : "characters"} to enable AI polishing.` : "AI improves your wording. You review the suggestion before applying it."}</p>
    {pending && <p className="event-polish-hint" role="status">Preparing a suggestion…</p>}
    {error && <p className="form-message error" role="alert">{error}</p>}
    {currentSuggestion && <div className="event-polish-preview">
      <p className="event-polish-hint">Suggested wording · Check the details before using it.</p>
      <p className="event-description">{currentSuggestion.text}</p>
      <div><button type="button" className="button dark" onClick={() => { onChange(currentSuggestion.text); setSuggestion(undefined); }}>Use this wording</button><button type="button" className="button outline" onClick={() => setSuggestion(undefined)}>Keep original</button></div>
    </div>}
  </div>;
}
