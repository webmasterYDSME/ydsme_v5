"use client";

import { type FormEvent, useCallback, useId, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Pencil, Plus } from "lucide-react";
import { saveEvent } from "@/lib/actions/content";
import { EditorDialog } from "@/app/components/EditorDialog";
import { EventAudienceFields } from "@/app/components/EventAudienceFields";
import { EventBookingFields } from "@/app/components/EventBookingFields";
import { EventImageUploadField, type EventImageReviewState } from "@/app/components/EventImageUploadField";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";

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

type EditorStep = "details" | "artwork";

export function EventEditorDialog({
  event,
  currentImage,
  intent = event ? "edit" : "create",
  triggerClassName,
}: {
  event?: EventEditorRecord;
  currentImage?: string;
  intent?: "create" | "edit" | "reschedule";
  triggerClassName?: string;
}) {
  const [step, setStep] = useState<EditorStep>("details");
  const [dirty, setDirty] = useState(false);
  const [imageReviewState, setImageReviewState] = useState<EventImageReviewState>("idle");
  const [instance, setInstance] = useState(0);
  const editorId = useId();
  const detailsTitleId = `${editorId}-details-title`;
  const artworkTitleId = `${editorId}-artwork-title`;
  const mode = event?.booking_mode === "website" || event?.booking_enabled ? "website" : "none";
  const triggerLabel = intent === "create" ? "Create event" : intent === "reschedule" ? "Reschedule" : "Edit";
  const title = intent === "create" ? "Create an event" : intent === "reschedule" ? `Reschedule ${event?.name || "event"}` : `Edit ${event?.name || "event"}`;
  const actionLabel = event ? "Save changes" : "Create event";
  const handleImageReviewState = useCallback((state: EventImageReviewState) => setImageReviewState(state), []);

  function validateBeforeSubmit(submission: FormEvent<HTMLFormElement>) {
    const form = submission.currentTarget;
    if (!form.checkValidity()) {
      submission.preventDefault();
      setStep("details");
      window.requestAnimationFrame(() => form.reportValidity());
      return;
    }
    if (imageReviewState === "pending") {
      submission.preventDefault();
      setStep("artwork");
    }
  }

  return <EditorDialog
    trigger={<>{intent === "create" ? <Plus/> : <Pencil/>}{triggerLabel}</>}
    triggerClassName={triggerClassName}
    eyebrow={intent === "create" ? "New timetable entry" : intent === "reschedule" ? "Return to the timetable" : "Update timetable entry"}
    title={title}
    description="Keep the event details and its public artwork together, then save everything in one step."
    dirty={dirty}
    onAfterClose={() => {
      setStep("details");
      setDirty(false);
      setImageReviewState("idle");
      setInstance((value) => value + 1);
    }}
  >{({ requestClose }) => <form
    key={instance}
    action={saveEvent}
    className="editor-form event-editor-form"
    noValidate
    onInputCapture={() => setDirty(true)}
    onChangeCapture={() => setDirty(true)}
    onSubmitCapture={validateBeforeSubmit}
  >
    {event ? <input type="hidden" name="id" value={event.id}/> : null}
    <input type="hidden" name="file_url" value={event?.file_url || ""}/>
    <nav className="event-editor-tabs" aria-label="Event editor sections">
      <button type="button" aria-current={step === "details" ? "step" : undefined} onClick={() => setStep("details")}><span>1</span><div><strong>Event details</strong><small>Schedule, audience and booking</small></div></button>
      <button type="button" aria-current={step === "artwork" ? "step" : undefined} onClick={() => setStep("artwork")}><span>2</span><div><strong>Artwork & preview</strong><small>Optional image and card crop</small></div></button>
    </nav>

    <section className="event-editor-panel event-editor-details" aria-labelledby={detailsTitleId} hidden={step !== "details"}>
      <div className="event-editor-panel-heading"><div><span>Section 1 of 2</span><h3 id={detailsTitleId}>Event details</h3></div><p>Required fields are marked by the browser when you save.</p></div>
      <div className="event-editor-details-grid">
        <label className="wide">Event name<input name="name" defaultValue={event?.name} required/></label>
        <label className="wide">Description<textarea name="descriptions" defaultValue={event?.descriptions} rows={4} required/></label>
        <label>Start date<input type="date" name="start_date" defaultValue={event?.start_date} required/></label>
        <label>End date<input type="date" name="end_date" defaultValue={event?.end_date} required/></label>
        <label>Start time<input type="time" name="start_time" defaultValue={event?.start_time.slice(0,5)} required/></label>
        <label>End time<input type="time" name="end_time" defaultValue={event?.end_time.slice(0,5)} required/></label>
        <EventAudienceFields initialAudience={event?.event_type} initialPublicTeaserEnabled={event?.public_teaser_enabled}>
          <label>Status<select name="lifecycle_status" defaultValue={event?.lifecycle_status === "archived" ? "draft" : event?.lifecycle_status || "published"}><option value="draft">Draft</option><option value="published">Published</option><option value="cancelled">Cancelled</option></select></label>
          <EventBookingFields initialMode={mode} initialCapacity={event?.booking_capacity ?? 100}/>
          <label className="check wide"><input type="checkbox" name="display_in_homepage" defaultChecked={event?.display_in_homepage}/>Feature on homepage</label>
        </EventAudienceFields>
      </div>
    </section>

    <section className="event-editor-panel event-editor-artwork" aria-labelledby={artworkTitleId} hidden={step !== "artwork"}>
      <div className="event-editor-panel-heading"><div><span>Section 2 of 2 · Optional</span><h3 id={artworkTitleId}>Artwork & preview</h3></div><p>Review the final crop before confirming a replacement.</p></div>
      <EventImageUploadField label={event ? "Replace event image (optional)" : "Event image (optional)"} initialEventName={event?.name} currentImage={currentImage} onReviewStateChange={handleImageReviewState}/>
    </section>

    <footer className="event-editor-footer">
      <button type="button" className="button outline" onClick={requestClose}>Cancel</button>
      <div>
        {step === "details" ? <button type="button" className="event-editor-step-button" onClick={() => setStep("artwork")}><ImagePlus/>Artwork & preview<ArrowRight/></button> : <button type="button" className="event-editor-step-button" onClick={() => setStep("details")}><ArrowLeft/>Back to details</button>}
        <PendingSubmitButton className="button dark" pendingLabel={event ? "Saving changes…" : "Creating event…"}>{actionLabel}</PendingSubmitButton>
      </div>
    </footer>
  </form>}</EditorDialog>;
}
