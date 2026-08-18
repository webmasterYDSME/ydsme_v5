"use client";

import { useState } from "react";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { sendMagicLink, sendPasswordReset, signInWithPassword } from "@/lib/actions/auth";
import { CaptchaField } from "@/app/components/CaptchaField";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { SubmitOnEnterPassword } from "@/app/components/SubmitOnEnterPassword";

type BackMode = "magic-link" | "password-reset";

export function SignInCard({ next }: { next: string }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [backMode, setBackMode] = useState<BackMode>("magic-link");

  function showBack(mode: BackMode) {
    setBackMode(mode);
    setIsFlipped(true);
  }

  return (
    <div className="auth-flip-shell">
      <div className={isFlipped ? "auth-flip-card is-flipped" : "auth-flip-card"}>
        <section className="auth-flip-face auth-flip-front" aria-hidden={isFlipped} inert={isFlipped}>
          <form action={signInWithPassword} className="auth-form auth-card-form">
            <input type="hidden" name="next" value={next} />
            <label>Email address<input name="email" type="email" autoComplete="email" enterKeyHint="next" required /></label>
            <div className="auth-field">
              <label htmlFor="login-password">Password</label>
              <SubmitOnEnterPassword id="login-password" name="password" autoComplete="current-password" enterKeyHint="go" minLength={6} required />
            </div>
            <CaptchaField />
            <PendingSubmitButton className="button dark" pendingLabel="Signing in…">Sign in securely <KeyRound /></PendingSubmitButton>
          </form>
          <div className="auth-method-switches">
            <button type="button" onClick={() => showBack("magic-link")}><Mail />Email me a sign-in link</button>
            <button type="button" onClick={() => showBack("password-reset")}><KeyRound />Forgotten your password?</button>
          </div>
        </section>

        <section className="auth-flip-face auth-flip-back" aria-hidden={!isFlipped} inert={!isFlipped}>
          <button className="auth-flip-return" type="button" onClick={() => setIsFlipped(false)}>
            <ArrowLeft /> Back to password sign in
          </button>
          <div className="auth-back-heading">
            {backMode === "magic-link" ? <Mail aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
            <div>
              <p className="eyebrow dark">{backMode === "magic-link" ? "Password-free access" : "Account recovery"}</p>
              <h3>{backMode === "magic-link" ? "Email me a sign-in link." : "Reset your password."}</h3>
              <p>{backMode === "magic-link" ? "We’ll send a secure, one-time sign-in link to your inbox." : "We’ll email instructions for choosing a new password."}</p>
            </div>
          </div>
          <form action={backMode === "magic-link" ? sendMagicLink : sendPasswordReset} className="auth-form auth-card-form auth-back-form">
            {backMode === "magic-link" ? <input type="hidden" name="next" value={next} /> : null}
            <label htmlFor="alternative-email">Email address</label>
            <input id="alternative-email" name="email" type="email" autoComplete="email" placeholder="you@example.org" required />
            <CaptchaField />
            <PendingSubmitButton className="button dark auth-secondary-submit" pendingLabel={backMode === "magic-link" ? "Sending link…" : "Sending reset…"}>
              {backMode === "magic-link" ? <><Mail aria-hidden="true" />Send secure link</> : <><KeyRound aria-hidden="true" />Send reset instructions</>}
            </PendingSubmitButton>
          </form>
        </section>
      </div>
    </div>
  );
}
