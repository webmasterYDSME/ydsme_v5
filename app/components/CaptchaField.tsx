"use client";

import { useState } from "react";
import { Turnstile } from "react-turnstile";

export function CaptchaField() {
  const [token, setToken] = useState("");
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY;
  if (!sitekey) return <input type="hidden" name="captchaToken" value=""/>;
  return <div className="captcha-field"><input type="hidden" name="captchaToken" value={token}/><Turnstile sitekey={sitekey} onVerify={setToken} onExpire={()=>setToken("")} refreshExpired="auto"/></div>;
}
