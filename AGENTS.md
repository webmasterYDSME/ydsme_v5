<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Supabase data safety

- Treat every non-loopback Supabase endpoint as production data.
- Never run seeds, fixtures, database resets, or test-data scripts against a remote Supabase project.
- Data-writing tests must obtain their endpoint from `supabase status -o env` and refuse anything other than `http://127.0.0.1:54321`.
- Keep `.env.local` pointed at the local Supabase stack. `.env.prod` is the remote configuration and must be used only for deployment or explicitly authorized, read-only auditing.
