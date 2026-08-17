import { updatePassword } from "@/lib/actions/auth";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="simple-auth"><div><p className="eyebrow dark">Account security</p><h1>Choose a new password.</h1>{error ? <p className="form-message error">{error}</p> : null}<form action={updatePassword} className="auth-form"><label>New password<input name="password" type="password" minLength={8} autoComplete="new-password" required/></label><button type="submit" className="button dark">Update password</button></form></div></main>;
}
