"use client";

import { useState } from "react";
import { ArrowLeft, KeyRound, Mail } from "lucide-react";
import { sendMagicLink, sendPasswordReset, signInWithPassword } from "@/lib/actions/auth";
import { CaptchaField } from "@/app/components/CaptchaField";
import { PendingSubmitButton } from "@/app/components/PendingSubmitButton";
import { SubmitOnEnterInput, SubmitOnEnterPassword } from "@/app/components/SubmitOnEnterPassword";

type BackMode = "password" | "password-reset";

export function SignInCard({ next, initialMode }: { next: string; initialMode?: BackMode }) {
  const [isFlipped, setIsFlipped] = useState(Boolean(initialMode));
  const [backMode, setBackMode] = useState<BackMode>(initialMode || "password");

  function showBack(mode: BackMode) {
    setBackMode(mode);
    setIsFlipped(true);
  }

  return (
    <div className="auth-flip-shell">
      <div className={isFlipped ? "auth-flip-card is-flipped" : "auth-flip-card"}>
        <section className="auth-flip-face auth-flip-front" aria-hidden={isFlipped} inert={isFlipped}>
          <p className="auth-primary-help">Enter the email address you use for your membership. We’ll email you a link. Click it to sign in. No password needed.</p>
          <form action={sendMagicLink} className="auth-form auth-card-form">
            <input type="hidden" name="next" value={next} />
            <div className="auth-field">
              <label htmlFor="magic-link-email">Email address</label>
              <SubmitOnEnterInput id="magic-link-email" name="email" type="email" autoComplete="email" enterKeyHint="go" placeholder="you@example.org" required />
            </div>
            <CaptchaField />
            <PendingSubmitButton className="button dark" pendingLabel="Sending email…"><Mail aria-hidden="true" />Email me a sign-in link</PendingSubmitButton>
          </form>
          <div className="auth-method-switches">
            <button type="button" onClick={() => showBack("password")}><KeyRound />Sign in with email and password</button>
          </div>
        </section>

        <section className="auth-flip-face auth-flip-back" aria-hidden={!isFlipped} inert={!isFlipped}>
          {backMode === "password-reset" ? <div className="auth-back-heading">
            <div>
              <h3>Reset your password.</h3>
              <p>We’ll email instructions for choosing a new password.</p>
            </div>
          </div> : null}
          {backMode === "password" ? (
            <>
              <form action={signInWithPassword} className="auth-form auth-card-form auth-back-form">
                <input type="hidden" name="next" value={next} />
                <label>Email address<input name="email" type="email" autoComplete="email" enterKeyHint="next" required /></label>
                <div className="auth-field">
                  <label htmlFor="login-password">Password</label>
                  <SubmitOnEnterPassword id="login-password" name="password" autoComplete="current-password" enterKeyHint="go" minLength={6} allowReveal required />
                  <button className="auth-forgot-password" type="button" onClick={() => showBack("password-reset")}>Forgotten your password?</button>
                </div>
                <CaptchaField />
                <PendingSubmitButton className="button dark auth-secondary-submit" pendingLabel="Signing in…">Sign in securely <KeyRound aria-hidden="true" /></PendingSubmitButton>
              </form>
              <div className="auth-method-switches">
                <button type="button" onClick={() => setIsFlipped(false)}><ArrowLeft />Back to sign-in link</button>
              </div>
            </>
          ) : (
            <><form action={sendPasswordReset} className="auth-form auth-card-form auth-back-form">
              <label htmlFor="alternative-email">Email address</label>
              <input id="alternative-email" name="email" type="email" autoComplete="email" placeholder="you@example.org" required />
              <CaptchaField />
              <PendingSubmitButton className="button dark auth-secondary-submit" pendingLabel="Sending reset…">
                <KeyRound aria-hidden="true" />Send reset instructions
              </PendingSubmitButton>
            </form>
            <div className="auth-method-switches"><button type="button" onClick={() => showBack("password")}><ArrowLeft />Back to password sign in</button></div></>
          )}
        </section>
      </div>
    </div>
  );
}
