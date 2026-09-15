"use client";

import { type FormEvent, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveEvent } from "@/lib/actions/content";
import { EditorDialog } from "@/app/components/EditorDialog";
import { EventBookingFields } from "@/app/components/EventBookingFields";
import { EventImageUploadField, type EventImageUploadHandle } from "@/app/components/EventImageUploadField";

export type EventEditorRecord = {
  id: number;
  name: string;
  descriptions: string;
  file_url: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  event_type: "public" | "member_only";
  display_in_homepage: boolean;
  public_teaser_enabled: boolean;
  booking_enabled: boolean;
  booking_mode: string;
  booking_capacity: number | null;
  lifecycle_status: "published" | "draft" | "cancelled" | "archived";
  updated_at: string;
};

export function EventEditorDialog({ event, currentImage, intent = event ? "edit" : "create", triggerClassName }: {
  event?: EventEditorRecord;
  currentImage?: string;
  intent?: "create" | "edit" | "reschedule";
  triggerClassName?: string;
}) {
  const [dirty, setDirty] = useState(false);
  const [instance, setInstance] = useState(0);
  const [saving, setSaving] = useState(false);
  const title = intent === "create" ? "Create an event" : intent === "reschedule" ? `Reschedule ${event?.name || "event"}` : `Edit ${event?.name || "event"}`;
  return <EditorDialog
    trigger={<>{intent === "create" ? <Plus/> : <Pencil/>}{intent === "create" ? "Create event" : intent === "reschedule" ? "Reschedule" : "Edit"}</>}
    triggerClassName={triggerClassName} eyebrow="Society timetable" title={title}
    description="Step 1: event details. Step 2: add an image, then save or publish."
    dirty={dirty} busy={saving}
    onAfterClose={() => { setDirty(false); setInstance(value => value + 1); }}
  >{({ requestClose }) => <EventForm key={instance} event={event} currentImage={currentImage} requestClose={requestClose} setDirty={setDirty} setSaving={setSaving}/>}</EditorDialog>;
}

function EventForm({ event, currentImage, requestClose, setDirty, setSaving }: {
  event?: EventEditorRecord; currentImage?: string; requestClose: () => void;
  setDirty: (value: boolean) => void; setSaving: (value: boolean) => void;
}) {
  const router = useRouter();
  const imageRef = useRef<EventImageUploadHandle>(null);
  const submitting = useRef(false);
  const errorId = useId();
  const detailsId = useId();
  const artworkId = useId();
  const [step, setStep] = useState<1 | 2>(1);
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const artworkHeading = useRef<HTMLHeadingElement>(null);

  function showStep(next: 1 | 2) {
    setStep(next);
    window.requestAnimationFrame(() => (next === 1 ? detailsHeading : artworkHeading).current?.focus());
  }
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ error: string; field?: string }>();
  const [name, setName] = useState(event?.name || "");
  const [description, setDescription] = useState(event?.descriptions || "");
  const [date, setDate] = useState(event?.start_date || "");
  const [endDate, setEndDate] = useState(event?.end_date || "");
  const [startTime, setStartTime] = useState(event?.start_time.slice(0, 5) || "");
  const [endTime, setEndTime] = useState(event?.end_time.slice(0, 5) || "");
  const [multiDay, setMultiDay] = useState(Boolean(event && event.start_date !== event.end_date));
  const [audience, setAudience] = useState(event?.event_type || "member_only");
  const [teaser, setTeaser] = useState(event?.public_teaser_enabled || false);
  const [featured, setFeatured] = useState(event?.display_in_homepage || false);
  const [booking, setBooking] = useState(event?.booking_mode === "website" || event?.booking_enabled ? "website" : "none");
  const fieldError = (field: string) => ({ "aria-invalid": error?.field === field || undefined, "aria-describedby": error?.field === field ? errorId : undefined });

  async function submit(submission: FormEvent<HTMLFormElement>) {
    submission.preventDefault();
    if (submitting.current) return;
    const form = submission.currentTarget;
    if (!form.checkValidity()) {
      showStep(1);
      window.requestAnimationFrame(() => form.reportValidity());
      return;
    }
    const submitter = (submission.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const data = new FormData(form);
    data.set("lifecycle_status", submitter?.value || (event?.lifecycle_status === "published" ? "published" : "draft"));
    if (String(data.get("end_date")) < date || (String(data.get("end_date")) === date && endTime <= startTime)) {
      const field = String(data.get("end_date")) < date ? "end_date" : "end_time";
      setError({ error: "The event must end after it starts.", field });
      showStep(1);
      window.requestAnimationFrame(() => (form.elements.namedItem(field) as HTMLInputElement)?.focus());
      return;
    }
    if (step === 1) { setError(undefined); showStep(2); return; }
    submitting.current = true;
    setPending(true); setSaving(true); setError(undefined);
    try {
      data.set("quarantine_path", await imageRef.current?.prepare() || "");
      const result = await saveEvent(data);
      if ("error" in result) {
        setError(result);
        if (result.field) {
          showStep(1);
          window.requestAnimationFrame(() => (form.elements.namedItem(result.field!) as HTMLInputElement | null)?.focus());
        }
      } else {
        setDirty(false);
        form.closest("dialog")?.close();
        router.push(result.url);
        router.refresh();
      }
    } catch (failure) {
      setError({ error: failure instanceof Error ? failure.message : "The event could not be saved. Your details are still here; please try again." });
    } finally {
      submitting.current = false;
      setPending(false); setSaving(false);
    }
  }

  return <form className="editor-form event-editor-form event-editor-simple event-editor-stepped" noValidate onSubmit={submit} onChange={() => { setDirty(true); setError(undefined); }}>
    <div className="event-editor-panel" hidden={step !== 1}>
      <fieldset disabled={pending} className="event-editor-fields" aria-labelledby={detailsId}>
        {event ? <input type="hidden" name="id" value={event.id}/> : null}
        <h3 id={detailsId} ref={detailsHeading} tabIndex={-1}>Event details</h3>
        <div className="event-editor-details-grid">
          <label className="wide">Event name<input name="name" value={name} onChange={e => setName(e.target.value)} minLength={2} maxLength={180} required {...fieldError("name")}/></label>
          <label className="wide">Description<textarea name="descriptions" value={description} onChange={e => setDescription(e.target.value)} rows={3} minLength={2} maxLength={5000} required {...fieldError("descriptions")}/></label>
          <label>Date<input name="start_date" type="date" value={date} onChange={e => setDate(e.target.value)} required {...fieldError("start_date")}/></label>
          <label className="check"><input type="checkbox" checked={multiDay} onChange={e => setMultiDay(e.target.checked)}/>Runs over several days</label>
          {multiDay ? <label>End date<input name="end_date" type="date" min={date} value={endDate} onChange={e => setEndDate(e.target.value)} required {...fieldError("end_date")}/></label> : <input type="hidden" name="end_date" value={date}/>}
          <div className="wide event-time-fields">
            <label>Start time<input name="start_time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required {...fieldError("start_time")}/></label>
            <label>End time<input name="end_time" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required {...fieldError("end_time")}/></label>
          </div>
          <label>Who can attend?<select name="event_type" value={audience} onChange={e => { setAudience(e.target.value as typeof audience); setBooking("none"); }}><option value="member_only">Members only</option><option value="public">Everyone</option></select></label>
          {audience === "public" ? <EventBookingFields initialMode={booking as "none" | "website"} initialCapacity={event?.booking_capacity ?? 100} onModeChange={setBooking}/> : <input type="hidden" name="booking_mode" value="none"/>}
        </div>
        <section className="event-extra-options" aria-label="Where the event appears">
          {audience === "member_only" ? <>
            <label className="check event-public-visibility"><input name="public_teaser_enabled" type="checkbox" checked={teaser} onChange={e => setTeaser(e.target.checked)}/>Add this members-only event to the public events page</label>
          </> : <>
            <p>Once published, this event appears on the public events page and in the members’ area. Everyone can attend.</p>
            <label className="check"><input name="display_in_homepage" type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)}/>Feature on homepage</label>
          </>}
        </section>
      </fieldset>
    </div>
    <div className="event-editor-panel" hidden={step !== 2}>
      <fieldset disabled={pending} className="event-editor-fields" aria-labelledby={artworkId}>
        <h3 id={artworkId} ref={artworkHeading} tabIndex={-1}>Event image</h3>
        <p className="event-step-help">An image is required to save or publish. Upload your own, or use the AI prompt below to create one.</p>
        <EventImageUploadField ref={imageRef} onSelectionChange={() => { setError(undefined); setDirty(true); }} label="Event image (required)" currentImage={currentImage} initialEventName={name} preview={{ name, description, date, endDate: multiDay ? endDate : date, startTime, endTime, audience, booking }}/>
      </fieldset>
    </div>
    <footer className="event-editor-footer">
      {error ? <p id={errorId} className="form-message error" role="alert">{error.error}</p> : null}
      <button type="button" className="button outline" disabled={pending} onClick={requestClose}>Cancel</button>
      <div>
        {step === 1 ? <button key="next" className="button dark" type="submit" value="next">Next: event image</button> : <>
        <button key="back" className="button outline" type="button" disabled={pending} onClick={event => { event.preventDefault(); setError(undefined); showStep(1); }}>Back to details</button>
        {event && event.lifecycle_status !== "archived" ? <button className="button outline" disabled={pending} type="submit" value="cancelled">{event.lifecycle_status === "cancelled" ? "Save as cancelled" : "Cancel event"}</button> : null}
        <button className="button outline" disabled={pending} type="submit" value="draft">Save draft</button>
        <button className="button dark" disabled={pending} type="submit" value="published">{pending ? "Saving…" : event?.lifecycle_status === "published" ? "Save changes" : "Publish event"}</button>
        </>}
      </div>
    </footer>
  </form>;
}
