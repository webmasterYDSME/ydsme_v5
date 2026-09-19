"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { membershipErrorMessage, membershipNoticeMessage } from "@/lib/membership-admin/messages";
import styles from "../memberships.module.css";

const SUCCESS_MS = 8000;

/** What to say for a notice code with no specific wording of its own. */
function noticeText(notice: string) {
  return membershipNoticeMessage(notice) ?? "Done. The membership record has been updated.";
}

/**
 * The result of the last change, as a message floating at the top of the screen so it is seen
 * whatever the scroll position. It reads `?notice=` and `?error=` from the address, which is how
 * every form action reports back. A success fades after a few seconds (not while the pointer or
 * keyboard is on it); an error stays until it is closed. Closing removes the two codes from the
 * address, so a refresh does not show it again and the next change can show its own.
 */
export function FlashToast() {
  const params = useSearchParams();
  const pathname = usePathname();
  const error = params.get("error");
  const notice = params.get("notice");
  const router = useRouter();
  const hovering = useRef(false);
  const showing = error ? `error:${error}` : notice ? `notice:${notice}` : null;
  // The message being closed. Closing hides it straight away, whatever the address does next.
  const [closed, setClosed] = useState<string | null>(null);

  const dismiss = useCallback(() => {
    setClosed(showing);
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    url.searchParams.delete("notice");
    router.replace(`${pathname}${url.search}${url.hash}`, { scroll: false });
  }, [pathname, router, showing]);

  // Once the address has been cleared, the next message may be the same one and must show again.
  if (!showing && closed !== null) setClosed(null);

  useEffect(() => {
    if (!showing || showing.startsWith("error:")) return;
    let timer: ReturnType<typeof setTimeout>;
    const start = () => { timer = setTimeout(() => (hovering.current ? start() : dismiss()), SUCCESS_MS); };
    start();
    return () => clearTimeout(timer);
  }, [showing, dismiss]);

  if ((!error && !notice) || closed === showing) return null;
  const isError = Boolean(error);
  return <div className={styles.toastLayer}>
    <div
      className={`${styles.toast} ${isError ? styles.toastError : styles.toastSuccess}`}
      role={isError ? "alert" : "status"}
      onMouseEnter={() => { hovering.current = true; }}
      onMouseLeave={() => { hovering.current = false; }}
      onFocus={() => { hovering.current = true; }}
      onBlur={() => { hovering.current = false; }}
    >
      {isError ? <CircleAlert aria-hidden="true"/> : <CheckCircle2 aria-hidden="true"/>}
      <p>{isError
        ? (membershipErrorMessage(error) ?? <>That change could not be completed. Check the details and try again. <small>({error!.replaceAll("-", " ")})</small></>)
        : noticeText(notice!)}</p>
      <button type="button" onClick={dismiss} aria-label="Dismiss message"><X aria-hidden="true"/></button>
    </div>
  </div>;
}
