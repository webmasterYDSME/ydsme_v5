import Link from "next/link";
import { FileUp } from "lucide-react";
import { MemberMojoImportForm } from "@/app/components/MemberMojoImportForm";

export default function MemberImportPage() {
  return <div className="portal-content">
    <header className="portal-heading"><div><p className="eyebrow dark">Administrator · Membership data</p><h1>MemberMojo import</h1><p>Upload an export, review discrepancies and identify safe portal-account links before any data is changed.</p></div><FileUp/></header>
    <MemberMojoImportForm/>
    <Link className="back-link" href="/admin/members">← Return to member register</Link>
  </div>;
}
