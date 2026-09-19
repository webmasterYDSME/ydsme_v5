import { redirect } from "next/navigation";

// Bulk invitations are now part of the MemberMojo member-list import.
export default function AddMembers() {
  redirect("/administrator/member-import");
}
