# York Model Engineers — Supabase email templates

These templates are designed for Supabase Auth and use its supported Go-template variables. Each HTML file is standalone and can be pasted directly into the matching template in **Supabase Dashboard → Authentication → Email Templates**.

## Dashboard mapping

| Supabase template | Subject | HTML file |
| --- | --- | --- |
| Confirm signup | Confirm your York Model Engineers email | `confirmation.html` |
| Invite user | Your invitation to York Model Engineers | `invite.html` |
| Magic link | Your secure York Model Engineers sign-in link | `magic_link.html` |
| Reset password | Reset your York Model Engineers password | `recovery.html` |
| Change email address | Confirm your new York Model Engineers email | `email_change.html` |
| Reauthentication | Your York Model Engineers verification code | `reauthentication.html` |
| Password changed notification | Your York Model Engineers password was changed | `password_changed.html` |
| Email changed notification | Your York Model Engineers email was changed | `email_changed.html` |

## Before sending production email

1. Set the Supabase **Site URL** to the production origin, without a trailing slash.
2. Keep the app callback URLs in the **Redirect URLs** allow-list, including `/auth/callback` for production and `http://localhost:3010/auth/callback` during local development.
3. Configure custom SMTP. Supabase's default email service is intended for development and has restrictive sending limits.
4. Disable click/link tracking in the SMTP provider. Rewriting Supabase authentication links can make them invalid.
5. Send one test for every flow. Test Gmail, Outlook and a phone-sized client before enabling the templates for all members.

The primary buttons deliberately use `{{ .ConfirmationURL }}`. This preserves the application's current PKCE callback flow in `app/auth/callback/route.ts`. Do not replace these links with a custom `TokenHash` URL unless the application also gains a matching server-side verification endpoint.

The logo source is `{{ .SiteURL }}/ydsme-logo.png`. It has useful alt text and the email remains understandable when remote images are blocked.
