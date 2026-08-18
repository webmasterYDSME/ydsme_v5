"use client";

import { useActionState } from "react";
import { CalendarCheck, Check, Mail, UsersRound } from "lucide-react";
import { CaptchaField } from "@/app/components/CaptchaField";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { createVisitorBooking, type BookingActionState } from "@/lib/actions/bookings";

const initialState: BookingActionState = { status: "idle" };

export function BookingForm({ eventId, availablePlaces }: { eventId: number; availablePlaces: number }) {
  const [state, formAction] = useActionState(createVisitorBooking, initialState);

  if (state.status === "success") {
    return <section className="booking-confirmation" aria-live="polite">
      <span className="booking-confirmation-icon"><Check aria-hidden="true"/></span>
      <p className="eyebrow dark">Booking confirmed</p>
      <h2>You’re on the<br/><em>passenger list.</em></h2>
      <p>{state.eventName}<br/>{state.eventDate} · {state.startTime}<br/>{state.partySize} {state.partySize === 1 ? "visitor" : "visitors"}</p>
      <div className="booking-reference"><small>Show site control</small><strong>{state.referenceCode}</strong></div>
      <p className={state.emailSent ? "booking-email-note sent" : "booking-email-note warning"}>
        <Mail aria-hidden="true"/>
        {state.emailSent
          ? "We have emailed your mobile ticket and attached a copy for saving to your phone."
          : "The booking is secure, but the email could not be sent. Please save this reference."}
      </p>
    </section>;
  }

  return <form action={formAction} className="booking-form">
    <input type="hidden" name="eventId" value={eventId}/>
    <div className="booking-form-heading"><div><p className="eyebrow dark">Free reservation</p><h2>Reserve your visit</h2></div><span><UsersRound/>{availablePlaces} places left</span></div>
    <p>One person can book for the whole group. We only need the lead visitor’s details.</p>
    {state.status === "error" ? <p className="form-message error" role="alert">{state.message}</p> : null}
    <label>Lead visitor’s name<input name="leadName" autoComplete="name" maxLength={120} required/></label>
    <label>Email address<input type="email" name="email" autoComplete="email" maxLength={254} inputMode="email" required/><small>Your confirmation and booking reference will be sent here.</small></label>
    <label>How many people are coming?<input type="number" name="partySize" min="1" max={Math.min(20, availablePlaces)} defaultValue="1" inputMode="numeric" required/><small>Include adults and children. Maximum 20 people per booking.</small></label>
    <label className="booking-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off"/></label>
    <CaptchaField/>
    <PendingSubmitButton className="button dark large" pendingLabel="Reserving…"><CalendarCheck/>Confirm free booking</PendingSubmitButton>
    <p className="booking-privacy">We use these details only to manage the event and send your confirmation. See our <a href="/privacy-policy">privacy notice</a>.</p>
  </form>;
}
