import { Suspense } from "react";
import { FlashToast } from "./FlashToast";

/** The result of the last change, shown on whichever page a form action returns to. The message reads the address in the browser (see FlashToast). */
export function MembershipFlash() {
  return <Suspense fallback={null}><FlashToast/></Suspense>;
}
