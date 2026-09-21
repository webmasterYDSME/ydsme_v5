"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return <button type="button" className="button outline" onClick={() => window.print()}><Printer/>{label}</button>;
}
