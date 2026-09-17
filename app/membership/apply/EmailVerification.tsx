"use client";
import { useState, useImperativeHandle, useRef, useLayoutEffect, type Ref, type ReactNode } from "react";
import { requestSignupCode, verifySignupCode, saveSignupDraft } from "@/lib/actions/membership-signup";
import { CaptchaField } from "@/app/components/CaptchaField";

export type EmailVerificationHandle = { verify: (form: HTMLFormElement) => Promise<boolean> };
type MessageTone = "idle" | "success" | "error";

export function EmailVerification({ ref, onVerified, initiallyVerified = false, identityVersion = 0, emailAddress, emailField }: { ref?: Ref<EmailVerificationHandle>; emailAddress: string; identityVersion?: number; emailField?: ReactNode; initiallyVerified?: boolean; onVerified: (value: boolean) => void }) {
  const [captchaVersion, setCaptchaVersion] = useState(0);
  const [href, setHref] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [verified, setVerified] = useState(initiallyVerified);
  const [messageTone, setMessageTone] = useState<MessageTone>(initiallyVerified ? "success" : "idle");
  const [message, setMessage] = useState(initiallyVerified ? "Email verified. Your saved application details have been restored." : "");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [existing, setExisting] = useState(false);
  const verificationInFlight = useRef(false);
  const currentIdentity = useRef(identityVersion);
  useLayoutEffect(() => { currentIdentity.current = identityVersion; }, [identityVersion]);
  const pending = sending || verifying;
  const [previousIdentity, setPreviousIdentity] = useState(identityVersion);
  if (previousIdentity !== identityVersion) {
    setPreviousIdentity(identityVersion);
    setVerified(false);
    setExisting(false);
    setSent(false);
    setCode("");
    setHref("");
    setMessage("");
    setMessageTone("idle");
    setCaptchaVersion(value => value + 1);
  }
  async function sendCode(form: HTMLFormElement): Promise<boolean> {
    if (sending || verifying || verificationInFlight.current) return false;
    setSending(true);
    try {
      const fields = new FormData(form);
      const request = new FormData();
      request.set("email", String(fields.get("guardian_led") === "on" ? fields.get("guardian_email") : fields.get("contact_email")));
      request.set("fullName", String(fields.get("full_name") || ""));
      request.set("captchaToken", String(fields.get("captchaToken") || ""));
      onVerified(false);
      setVerified(false);
      const result = await requestSignupCode(request);
      setCaptchaVersion(value => value + 1);
      setMessageTone(result.error ? "error" : "success");
      setMessage(result.error || "Code sent. Check your email inbox. You can request another code after 60 seconds.");
      setSent(previous => previous || Boolean(result.sent));
      if (result.sent) {
        setCode("");
        requestAnimationFrame(() => form.querySelector<HTMLInputElement>(".membership-code-input:not(:disabled)")?.focus());
      }
      return Boolean(result.sent);
    } catch {
      setMessageTone("error");
      setMessage("We could not send the code. Please try again.");
      return false;
    } finally {
      setSending(false);
    }
  }
  async function verify(form: HTMLFormElement): Promise<boolean> {
    if (verified) return !existing;
    if (pending || verificationInFlight.current) return false;
    if (!sent || code.length !== 6) {
      setMessageTone("error");
      setMessage(!sent ? "Request a code using Get code, then enter it to continue." : "Enter the six-digit code from your email to continue.");
      form.querySelector<HTMLInputElement>(".membership-code-input:not(:disabled)")?.focus();
      return false;
    }
    verificationInFlight.current = true;
    setVerifying(true);
    try {
      const result = await verifySignupCode(code);
      if (currentIdentity.current !== identityVersion) return false;
      setMessageTone(result.error ? "error" : "success");
      setMessage(result.error || result.message || "Email verified.");
      setHref(result.href || "");
      setVerified(Boolean(result.verified));
      setExisting(Boolean(result.existing));
      const canContinue = Boolean(result.verified && !result.existing);
      onVerified(canContinue);
      if (result.error) form.querySelector<HTMLInputElement>(".membership-code-input")?.focus();
      if (result.draft) {
        for (const key of ["title","contact_number","payment_method"]) {
          const input = form.elements.namedItem(key);
          if (input instanceof HTMLInputElement && !input.value) input.value = String(result.draft[key] || "");
          if (input instanceof RadioNodeList && result.draft[key]) input.value = String(result.draft[key]);
        }
      }
      if (canContinue) await saveSignupDraft(new FormData(form));
      return canContinue;
    } catch {
      setMessageTone("error");
      setMessage("We could not verify your code. Please try again.");
      return false;
    } finally {
      verificationInFlight.current = false;
      setVerifying(false);
    }
  }
  useImperativeHandle(ref, () => ({ verify }));
  return <div className="membership-email-verification">
    <CaptchaField key={captchaVersion}/>
    <div className={`membership-verification-controls${emailField ? " has-email" : ""}`}>
    {emailField}
    <button type="button" className="button outline" disabled={pending || verified || !emailAddress.trim()} onClick={event => void sendCode(event.currentTarget.form!)}>Get code</button>
    {(sent || emailField) && !verified ? <label>Six-digit verification code<input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" className="membership-code-input" maxLength={6} disabled={!sent || pending} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}/></label> : null}
    </div>
    <div className="membership-verification-message" data-tone={messageTone} data-visible={Boolean(message)}>
      <p role="status" aria-live={messageTone === "error" ? "assertive" : "polite"} aria-atomic="true">{message || "Verification status"}</p>
      {href && <a className="button dark membership-message-action" href={href}>Resume payment</a>}
    </div>
  </div>;
}
