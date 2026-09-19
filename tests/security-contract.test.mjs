import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("protects member routes with verified Supabase claims", async () => {
  const [proxy, session] = await Promise.all([
    read("lib/supabase/proxy.ts"),
    read("lib/auth.ts"),
  ]);
  assert.match(proxy, /auth\.getClaims\(\)/);
  assert.match(proxy, /\/dashboard/);
  assert.match(proxy, /\/administrator/);
  assert.doesNotMatch(proxy, /auth\.getSession\(\)/);
  assert.match(proxy, /!request\.nextUrl\.searchParams\.has\("error"\)/);
  assert.match(session, /auth\.getUser\(\)/);
  assert.match(session, /from\("user_roles"\)/);
});

test("exposes only explicitly selected member event teasers through a limited public view", async () => {
  const [data, events, home, migration, eventEditor, audienceFields, actions] = await Promise.all([
    read("lib/data.ts"),
    read("app/events/page.tsx"),
    read("app/page.tsx"),
    read("supabase/migrations/202608190002_public_member_event_teasers.sql"),
    read("app/components/EventEditorDialog.tsx"),
    read("app/components/EventAudienceFields.tsx"),
    read("lib/actions/content.ts"),
  ]);
  assert.match(data, /\.eq\("event_type", "public"\)/);
  assert.match(events, /getPublicEvents\(\)/);
  assert.match(home, /getPublicEvents\(\)/);
  assert.match(data, /loadPublicMemberEventTeasers[\s\S]*from\("public_member_event_teasers"\)/);
  assert.match(data, /memberEventImage[\s\S]*\/images\/member-event-default\.webp/);
  assert.match(events, /src=\{memberEventImage\(event\.file_url\)\}/);
  assert.match(events, /member-event-grid-\$\{memberEvents\.length\}/);
  assert.match(data, /isMissingProjection\(error\)[\s\S]*return \[\] as MemberEventTeaserRecord\[\]/);
  assert.match(migration, /view public\.public_member_event_teasers/);
  assert.match(migration, /event_type = 'member_only'/);
  assert.match(migration, /public_teaser_enabled = true/);
  assert.match(migration, /grant select on public\.public_member_event_teasers to anon, authenticated/);
  assert.doesNotMatch(migration, /\bhost\b|reservation_link|booking_capacity/);
  assert.match(eventEditor, /audience === "member_only"/);
  assert.match(audienceFields, /audience === "member_only"[\s\S]*name="public_teaser_enabled"/);
  assert.match(actions, /public_teaser_enabled: parsedValues\.event_type === "member_only" && parsedValues\.public_teaser_enabled/);
});

test("keeps event management current and uses only the website booking system", async () => {
  const [migration, admin, bookingFields, actions, publicEvents] = await Promise.all([
    read("supabase/migrations/202608180021_event_management_lifecycle.sql"),
    read("app/admin/[section]/page.tsx"),
    read("app/components/EventBookingFields.tsx"),
    read("lib/actions/content.ts"),
    read("app/events/page.tsx"),
  ]);
  assert.match(migration, /end_date < current_date/);
  assert.match(migration, /create trigger archive_past_event_on_write/);
  assert.match(migration, /check \(booking_mode in \('none', 'website'\)\)/);
  assert.match(migration, /create extension if not exists pg_cron/);
  assert.match(migration, /cron\.schedule\([\s\S]*auto-archive-past-events/);
  assert.match(migration, /dashboard-data-retention[\s\S]*run_dashboard_retention/);
  assert.match(migration, /cleanup-quarantine-uploads[\s\S]*net\.http_post/);
  assert.match(admin, /EVENT_PAGE_SIZE = 12/);
  assert.match(admin, /status=archived/);
  assert.match(bookingFields, /Do visitors need to book\?/);
  assert.match(bookingFields, /mode === "website"[\s\S]*booking_capacity/);
  assert.doesNotMatch(bookingFields, /external/i);
  assert.doesNotMatch(publicEvents, /featuredExternalUrl|safeHttpUrl/);
  assert.match(actions, /booking_mode: z\.enum\(\["none", "website"\]\)/);
  assert.match(publicEvents, /upcomingEvents\(publicEvents\)/);
  assert.match(publicEvents, /event.available_places > 0 \? "Book free places" : "View booking details"/);
  assert.match(publicEvents, /more.map\(event =>/);
  assert.match(publicEvents, /id=\{`event-\$\{event.id\}`\}/);
  assert.match(await read("app/events/[id]/book/page.tsx"), /href=\{`\/events\/\$\{event\.id\}`\}/);
});

test("automatically archives workshops after their scheduled date", async () => {
  const migration = await read("supabase/migrations/202608180022_workshop_management_lifecycle.sql");
  assert.match(migration, /date < current_date/);
  assert.match(migration, /create trigger archive_past_workshop_on_write/);
  assert.match(migration, /cron\.schedule\([\s\S]*auto-archive-past-workshops/);
  assert.match(migration, /select public\.archive_past_workshops\(\)/);
});

test("sorts event and workshop lifecycle tabs by operational priority", async () => {
  const admin = await read("app/admin/[section]/page.tsx");
  assert.match(admin, /status === "published"[\s\S]*eventQuery\.order\("start_date"\)\.order\("start_time"\)/);
  assert.match(admin, /status === "draft" \|\| status === "cancelled"[\s\S]*eventQuery\.order\("updated_at", \{ ascending: false \}\)/);
  assert.match(admin, /eventQuery\.order\("end_date", \{ ascending: false \}\)/);
  assert.match(admin, /status === "published"[\s\S]*workshopQuery\.order\("date"\)\.order\("start_time"\)/);
  assert.match(admin, /workshopQuery\.order\("updated_at", \{ ascending: false \}\)/);
  assert.match(admin, /\.range\(\(currentPage - 1\) \* WORKSHOP_PAGE_SIZE/);
});

test("keeps scheduled maintenance inside Supabase", async () => {
  const [edgeFunction, purgeFunction, purgeMigration, anonymizeMigration, config, vercelSource, environment] = await Promise.all([
    read("supabase/functions/cleanup-quarantine/index.ts"),
    read("supabase/functions/purge-expired-members/index.ts"),
    read("supabase/migrations/202608180030_expired_member_purge.sql"),
    read("supabase/migrations/202608180031_member_purge_anonymisation.sql"),
    read("supabase/config.toml"),
    read("vercel.json"),
    read(".env.example"),
  ]);
  const vercel = JSON.parse(vercelSource);
  assert.match(edgeFunction, /withSupabase\(\{ auth: "secret" \}/);
  assert.match(edgeFunction, /storage\.from\(bucket\)\.remove/);
  assert.match(edgeFunction, /quarantine\.cleanup\.completed/);
  assert.match(purgeFunction, /withSupabase\(\{ auth: "secret" \}/);
  assert.match(purgeFunction, /auth\.admin\.deleteUser/);
  assert.match(purgeMigration, /purge-expired-portal-accounts[\s\S]*net\.http_post/);
  assert.match(purgeMigration, /not u\.legal_hold/);
  assert.match(purgeMigration, /ur\.role = 'administrator'/);
  assert.match(anonymizeMigration, /anonymize_member_content_for_purge/);
  assert.match(anonymizeMigration, /author_name = 'Former member'/);
  assert.match(anonymizeMigration, /role in \('administrator', 'committee'\)/);
  assert.match(config, /\[functions\.cleanup-quarantine\][\s\S]*verify_jwt = false/);
  assert.match(config, /\[functions\.purge-expired-members\][\s\S]*verify_jwt = false/);
  assert.equal(vercel.crons, undefined);
  assert.doesNotMatch(environment, /CRON_SECRET/);
});

test("publishes and caches announcements through safe active and news projections with staff-only actions", async () => {
  const [migration, newsArchiveMigration, limitsMigration, descriptionMigration, limits, cacheTags, actions, data, home, train, sitemap, adminPage, news] = await Promise.all([
    read("supabase/migrations/202608180016_public_announcements.sql"),
    read("supabase/migrations/202608190001_public_news_archive.sql"),
    read("supabase/migrations/202608180017_announcement_carriage_limits.sql"),
    read("supabase/migrations/202608180018_announcement_description_length.sql"),
    read("lib/announcements.ts"),
    read("lib/cache-tags.ts"),
    read("lib/actions/content.ts"),
    read("lib/data.ts"),
    read("app/page.tsx"),
    read("app/components/RailSite.tsx"),
    read("app/sitemap.ts"),
    read("app/admin/[section]/page.tsx"),
    read("app/news/page.tsx"),
  ]);
  assert.match(migration, /alter table public\.announcements enable row level security/);
  assert.match(migration, /revoke all on table public\.announcements from public, anon, authenticated/);
  assert.match(migration, /view public\.public_announcements/);
  assert.match(migration, /where lifecycle_status = 'published'/);
  assert.match(newsArchiveMigration, /view public\.public_news_announcements/);
  assert.match(newsArchiveMigration, /published_at is not null/);
  assert.match(newsArchiveMigration, /lifecycle_status in \('published', 'archived'\)/);
  assert.match(newsArchiveMigration, /grant select on public\.public_news_announcements to anon, authenticated/);
  assert.match(actions, /saveAnnouncement[\s\S]*requireRole\(\["administrator", "committee"\]\)/);
  assert.match(actions, /archiveAnnouncement[\s\S]*requireRole\(\["administrator", "committee"\]\)/);
  assert.match(actions, /deleteOldArchivedAnnouncements[\s\S]*requireRole\(\["administrator"\]\)[\s\S]*\.delete\(\)[\s\S]*\.eq\("lifecycle_status", "archived"\)[\s\S]*\.lt\("archived_at", cutoff\.toISOString\(\)\)/);
  assert.match(actions, /announcements\.archives-purged/);
  assert.match(limitsMigration, /between 2 and 26/);
  assert.match(limitsMigration, /between 2 and 120/);
  assert.match(descriptionMigration, /between 2 and 120/);
  assert.match(limits, /ANNOUNCEMENT_TITLE_MAX_LENGTH = 26/);
  assert.match(limits, /ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH = 120/);
  assert.match(cacheTags, /ANNOUNCEMENTS_CACHE_TAG = "announcements"/);
  assert.match(data, /from\("public_announcements"\)/);
  assert.match(data, /loadNewsAnnouncements\(limit: number\)[\s\S]*from\("public_news_announcements"\)[\s\S]*\.limit\(limit\)/);
  assert.match(data, /unstable_cache\([\s\S]*tags: \[ANNOUNCEMENTS_CACHE_TAG\], revalidate: 3600/);
  assert.match(actions, /saveAnnouncement[\s\S]*updateTag\(ANNOUNCEMENTS_CACHE_TAG\)/);
  assert.match(actions, /archiveAnnouncement[\s\S]*updateTag\(ANNOUNCEMENTS_CACHE_TAG\)/);
  assert.match(actions, /restoreAnnouncement[\s\S]*updateTag\(ANNOUNCEMENTS_CACHE_TAG\)/);
  assert.match(data, /isMissingProjection\(error\)[\s\S]*return \[\] as AnnouncementRecord\[\]/);
  assert.match(home, /getCarriageAnnouncements\(1\)/);
  assert.match(home, /<InteractiveSteamTrain announcements=/);
  assert.match(train, /setInterval\([\s\S]*setAnnouncementIndex/);
  assert.match(train, /announcement \? <Link className="train-banner" href="\/news"/);
  assert.match(train, /announcement \? <span className="train-coupler(?: [^"]*)?"/);
  assert.doesNotMatch(train, /const nav = \[[^\n]*News/);
  assert.match(train, /Footer navigation[\s\S]*href="\/news"/);
  assert.match(sitemap, /path: "\/news"/);
  assert.match(news, /getNewsAnnouncements\(5\)/);
  assert.match(adminPage, /session\.role === "administrator"[\s\S]*action=\{deleteOldArchivedAnnouncements\}[\s\S]*confirmMessage=/);
  assert.match(adminPage, /oldArchiveCountResult\.count[\s\S]*Delete old archives/);
  assert.match(adminPage, /section === "announcements"/);
});

test("requires action-level roles before privileged writes", async () => {
  const [actions, uploads, uploadField, supabaseConfig, storageLimitMigration] = await Promise.all([
    read("lib/actions/content.ts"),
    read("lib/actions/uploads.ts"),
    read("app/components/SignedUploadField.tsx"),
    read("supabase/config.toml"),
    read("supabase/migrations/202608200001_align_image_upload_limit.sql"),
  ]);
  assert.match(actions, /requireRole\(\["administrator", "committee"\]\)/);
  assert.match(actions, /requireRole\(\["administrator"\]\)/);
  assert.match(actions, /finalizeQuarantinedUpload/);
  assert.match(uploads, /createSignedUploadUrl/);
  assert.match(uploads, /maximum: 8 \* 1024 \* 1024/);
  assert.match(uploadField, /uploadToSignedUrl/);
  assert.match(supabaseConfig, /\[storage\.buckets\.images\][\s\S]*file_size_limit = "8MiB"/);
  assert.match(storageLimitMigration, /file_size_limit[\s\S]*8 \* 1024 \* 1024/);
  assert.doesNotMatch(actions, /read-only-committee"\]\)/);
});

test("separates member-register viewing, status management and role administration", async () => {
  const [auth, adminPage, actions, navigation] = await Promise.all([
    read("lib/auth.ts"),
    read("app/admin/[section]/page.tsx"),
    read("lib/actions/content.ts"),
    read("lib/portal-nav.ts"),
  ]);
  assert.match(auth, /committee: new Set\([\s\S]*"members\.view"/);
  assert.match(adminPage, /section === "workshops" \? "workshops\.manage" : "members\.view"/);
  assert.match(navigation, /role !== "member"[\s\S]*href: "\/admin\/members", label: "Website accounts"/);
  assert.match(adminPage, /const administrator = session\.role === "administrator"/);
  assert.match(adminPage, /const canManageMemberStatus = administrator \|\| session\.membershipOfficer/);
  assert.match(adminPage, /administrator && member.membership_status === "active" && <PeopleEditorDialog/);
  assert.match(adminPage, /!administrator && canChangeThisStatus[\s\S]*<MemberAccessDialog/);
  assert.match(await read("app/components/MemberAccessActions.tsx"), /action=\{suspendMember\}[\s\S]*action=\{deleteMember\}/);
  assert.match(await read("app/components/PeopleEditorDialog.tsx"), /manageAccess && member && member.id !== actorId && <MemberAccessActions/);
  assert.match(await read("lib/actions/people.ts"), /savePeople[\s\S]*requireRole\(\["administrator"\]\)/);
  assert.match(actions, /requireMemberStatusManager[\s\S]*session\.role !== "administrator" && !session\.membershipOfficer/);
  assert.match(actions, /deleteMember[\s\S]*requireMemberStatusManager\(\)[\s\S]*Only\+an\+administrator\+can\+archive\+a\+committee\+member\+or\+administrator/);
  assert.match(actions, /suspendMember[\s\S]*requireMemberStatusManager\(\)[\s\S]*Only\+an\+administrator\+can\+suspend\+a\+committee\+member\+or\+administrator/);
  assert.match(actions, /restoreMember[\s\S]*requireRole\(\["administrator"\]\)/);
  assert.match(actions, /purgeMember[\s\S]*requireRole\(\["administrator"\]\)/);
});

test("reviews and standardizes event images before secure upload", async () => {
  const [field, editor, admin, styles] = await Promise.all([
    read("app/components/EventImageUploadField.tsx"),
    read("app/components/EventEditorDialog.tsx"),
    read("app/admin/[section]/page.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(admin, /<EventEditorDialog/);
  assert.match(editor, /<EventImageUploadField/);
  assert.match(field, /OUTPUT_WIDTH = 1800/);
  assert.match(field, /OUTPUT_HEIGHT = 1200/);
  assert.match(field, /drawCrop\(canvas, image/);
  assert.match(field, /createUploadIntent\(\{ kind: "event-image"/);
  assert.match(field, /uploadToSignedUrl/);
  assert.match(field, /previewMode === "desktop"/);
  assert.match(field, /previewMode === "mobile"/);
  assert.match(field, /Keep important details inside this area/);
  assert.match(field, /navigator\.clipboard\.writeText\(aiPrompt\)/);
  assert.match(field, /Leave comfortable space around the subject/);
  assert.match(field, /prepare: confirmImage/);
  assert.match(field, /Add an event image before saving/);
  assert.match(styles, /event-image-card-media[^}]*aspect-ratio:23\/16/);
  assert.match(styles, /event-image-card-preview\.is-mobile \.event-image-card-media\{aspect-ratio:8\/5\}/);
});

test("edits events in an accessible two-step modal", async () => {
  const [dialog, editor, admin, styles] = await Promise.all([
    read("app/components/EditorDialog.tsx"),
    read("app/components/EventEditorDialog.tsx"),
    read("app/admin/[section]/page.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(dialog, /<dialog/);
  assert.match(dialog, /dialog\.showModal\(\)/);
  assert.match(dialog, /onCancel=/);
  assert.match(dialog, /discard the unsaved changes/);
  assert.match(dialog, /triggerRef\.current\?\.focus\(\)/);
  assert.match(editor, /Event details/);
  assert.match(editor, /Event image \(required\)/);
  assert.match(editor, /await saveEvent\(data\)/);
  assert.match(editor, /noValidate/);
  assert.match(editor, /form\.checkValidity\(\)/);
  assert.match(editor, /imageRef.current\?\.prepare\(\)/);
  assert.match(admin, /intent="create"/);
  assert.doesNotMatch(admin, /<EventForm/);
  assert.match(styles, /\.editor-dialog::backdrop/);
  assert.match(styles, /\.event-editor-panel\[hidden\]\{display:none\}/);
});

test("uses exactly three database-backed application roles and two active administrators", async () => {
  const [auth, migration, minimumAdministratorsMigration, bootstrapMigration, bootstrapScript, adminPage, actions] = await Promise.all([
    read("lib/auth.ts"),
    read("supabase/migrations/202608180004_secure_dashboard.sql"),
    read("supabase/migrations/202608220003_require_two_active_administrators.sql"),
    read("supabase/migrations/202608220001_administrator_bootstrap.sql"),
    read("scripts/bootstrap-administrator.mjs"),
    read("app/admin/[section]/page.tsx"),
    read("lib/actions/content.ts"),
  ]);
  assert.match(auth, /appRoles = \["member", "committee", "administrator"\] as const/);
  assert.doesNotMatch(auth, /read-only-committee|moderator/);
  assert.doesNotMatch(adminPage, /read-only-committee|moderator/);
  assert.match(migration, /membership_status in \('active', 'suspended', 'archived'\)/);
  assert.match(migration, /role in \('member', 'committee', 'administrator'\)/);
  assert.match(migration, /where role::text in \('moderator', 'read-only-committee'\)/);
  assert.match(migration, /drop type if exists public\.app_permission/);
  assert.match(migration, /application_users > 0 and active_administrators < 2/);
  assert.match(migration, /Expected at least two active administrators/);
  assert.match(actions, /activeAdministratorCount\(\) <= 2[\s\S]*At\+least\+two\+active\+administrators\+are\+required/);
  assert.match(minimumAdministratorsMigration, /minimum_two_active_administrators_required/);
  assert.match(minimumAdministratorsMigration, /u\.id<>new\.id[\s\S]*\) < 2/);
  assert.match(bootstrapMigration, /if exists\(select 1 from public\.user_roles where role = 'administrator'\)/);
  assert.match(bootstrapMigration, /v_email_confirmed_at is null/);
  assert.match(bootstrapMigration, /administrator\.bootstrap/);
  assert.match(bootstrapMigration, /grant execute on function public\.bootstrap_first_administrator\(uuid\) to service_role/);
  assert.doesNotMatch(bootstrapMigration, /grant execute[\s\S]*to anon|grant execute[\s\S]*to authenticated/);
  assert.match(bootstrapScript, /Remote bootstrap requires --confirm-host/);
  assert.match(bootstrapScript, /email_confirmed_at/);
  assert.doesNotMatch(bootstrapScript, /createUser|inviteUserByEmail/);
});

test("keeps online renewals free of legacy offline payment evidence", async () => {
  const migration = await read("supabase/migrations/202608220002_membership_renewal_parameter_guard.sql");
  assert.match(migration, /p_cash_receipt_reference is not null/);
  assert.match(migration, /membership_renewal_parameter_guard_failed/);
});

test("retires bulk member archiving in favour of reviewed lifecycle controls", async () => {
  const [admin, actions] = await Promise.all([
    read("app/admin/[section]/page.tsx"),
    read("lib/actions/content.ts"),
  ]);
  assert.doesNotMatch(admin, /Bulk archive|\/administrator\/delete-members/);
  assert.doesNotMatch(actions, /bulkDeleteMembers|members\.bulk-archived|ARCHIVE MEMBERS/);
  assert.match(actions, /export async function deleteMember/);
  assert.match(actions, /export async function restoreMember/);
  await assert.rejects(stat(new URL("app/administrator/delete-members/page.tsx", root)), { code: "ENOENT" });
});

test("ships database and HTTP defence in depth", async () => {
  const [migration, secureMigration, config, proxy] = await Promise.all([
    read("supabase/migrations/202608170001_security_hardening.sql"),
    read("supabase/migrations/202608180004_secure_dashboard.sql"),
    read("next.config.ts"),
    read("proxy.ts"),
  ]);
  assert.match(migration, /ydsme_events_public_read/);
  assert.match(migration, /participants_workshop_member_unique/);
  assert.match(migration, /has_app_role/);
  assert.match(migration, /revoke all on public\.user_roles from anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on public\.user_roles to service_role/);
  assert.match(migration, /drop policy if exists "Enable update for committee and administrator"/);
  assert.match(secureMigration, /reserve_workshop_place/);
  assert.match(secureMigration, /for update/);
  assert.match(secureMigration, /revoke insert, update, delete on public\.participants from authenticated/);
  assert.match(secureMigration, /audit_logs/);
  assert.match(secureMigration, /run_dashboard_retention/);
  assert.match(proxy, /Content-Security-Policy/);
  assert.match(proxy, /'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.doesNotMatch(proxy, /script-src[^`\n]*'unsafe-inline'/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /Permissions-Policy/);
});

test("reports denied navigation clearly and keeps account controls labelled", async () => {
  const [dashboard, account, eventEditor] = await Promise.all([
    read("app/dashboard/page.tsx"),
    read("app/account/page.tsx"),
    read("app/components/EventEditorDialog.tsx"),
  ]);
  assert.match(dashboard, /"not-authorised": \{ message: "You do not have permission to open that page\.", tone: "error" \}/);
  assert.doesNotMatch(dashboard, /query\.notice \? <p className="form-message success">Update complete\.<\/p>/);
  assert.match(account, /htmlFor="new-login-email"/);
  assert.match(account, /htmlFor="new-membership-contact-email"/);
  assert.match(eventEditor, /useId/);
  assert.match(eventEditor, /id=\{errorId\}/);
  assert.doesNotMatch(eventEditor, /id="event-editor-details-title"|id="event-editor-artwork-title"/);
});

test("bounds portal reads and synchronizes member profile updates", async () => {
  const [adminPage, settings, account, profileAction, audit, summaries, profileSync] = await Promise.all([
    read("app/admin/[section]/page.tsx"),
    read("app/settings/page.tsx"),
    read("app/account/page.tsx"),
    read("lib/actions/content.ts"),
    read("app/admin/audit/page.tsx"),
    read("supabase/migrations/202608180024_portal_management_summaries.sql"),
    read("supabase/migrations/202608200034_membership_portal_profile_sync.sql"),
  ]);
  assert.match(adminPage, /\.range\(\(currentPage - 1\) \* ANNOUNCEMENT_PAGE_SIZE/);
  assert.match(adminPage, /\.in\("reference_id", visibleWorkshopIds\)/);
  assert.match(settings, /requireCapability\("settings\.manage"\)/);
  assert.match(await read("app/admin/people/page.tsx"), /\.range\(\(page - 1\) \* pageSize/);
  assert.match(account, /createClient/);
  assert.doesNotMatch(account, /createAdminClient/);
  assert.doesNotMatch(audit, /before_state,after_state/);
  assert.match(summaries, /grant execute on function public\.donation_management_summary[\s\S]*to service_role/);
  assert.match(profileAction, /rpc\("update_own_member_profile"/);
  assert.match(profileSync, /revoke update on public\.users from authenticated/);
  assert.match(profileSync, /update public\.members[\s\S]*where auth_user_id = v_user_id/);
});

test("defers document delivery and rejects active PDF content", async () => {
  const [documents, download, uploads, uploadField] = await Promise.all([
    read("app/dashboard/[section]/page.tsx"),
    read("app/dashboard/documents/[id]/download/route.ts"),
    read("lib/uploads.ts"),
    read("app/components/SignedUploadField.tsx"),
  ]);
  assert.doesNotMatch(documents, /createSignedUrl/);
  assert.match(download, /createSignedUrl\(path, 60/);
  assert.doesNotMatch(download, /download:/);
  assert.match(download, /documentStoragePath/);
  assert.match(uploads, /PDF_ACTIVE_CONTENT/);
  assert.match(uploads, /lastIndexOf\("%%EOF"\)/);
  assert.match(uploadField, /await import\("@supabase\/supabase-js"\)/);
});

test("keeps the supplied logo and local member login", async () => {
  const [shell, pageShell, signIn, signInCard, authActions] = await Promise.all([
    read("app/components/RailSite.tsx"),
    read("app/components/PageShell.tsx"),
    read("app/signin/page.tsx"),
    read("app/components/SignInCard.tsx"),
    read("lib/actions/auth.ts"),
  ]);
  assert.match(shell, /\/ydsme-logo-detailed-gold-lions\.png/);
  assert.match(shell, /isAuthenticated\?"\/dashboard":"\/signin"/);
  assert.match(shell, /isAuthenticated\?"Member area":"Member login"/);
  assert.doesNotMatch(shell, /yorkmodelengineers\.co\.uk\/signin/);
  assert.match(pageShell, /getCurrentUser/);
  assert.match(pageShell, /isAuthenticated=\{Boolean\(user\)\}/);
  assert.match(signIn, /<SignInCard/);
  assert.match(signIn, /isMagicLinkSent[\s\S]*?auth-link-confirmation/);
  assert.match(signIn, /If that email belongs to an active member account/);
  assert.match(signIn, /isPasswordResetSent = query\.sent === "password-reset"/);
  assert.match(signIn, /Password reset instructions are on their way/);
  assert.match(signIn, /initialMode=\{initialMode\}/);
  assert.match(signInCard, /auth-flip-front[\s\S]*?<form action=\{sendMagicLink\}/);
  assert.match(signInCard, /SubmitOnEnterInput[\s\S]*?enterKeyHint="go"/);
  assert.match(signInCard, /showBack\("password"\)[\s\S]*?Sign in with email and password/);
  assert.match(signInCard, /action=\{sendPasswordReset\}[\s\S]*?onClick=\{\(\) => showBack\("password"\)\}[\s\S]*?Back to password sign in/);
  assert.match(signInCard, /action=\{signInWithPassword\}[\s\S]*?showBack\("password-reset"\)[\s\S]*?Forgotten your password/);
  assert.match(signInCard, /minLength=\{6\}/);
  assert.match(authActions, /existingPasswordSchema = z\.string\(\)\.min\(6\)/);
  assert.match(authActions, /method: "password"/);
  assert.match(authActions, /passwordAuthError\("We could not sign you in/);
  assert.match(authActions, /method: "password-reset"/);
  assert.match(authActions, /passwordResetAuthError\("We could not send the reset email/);
  assert.match(authActions, /newPasswordSchema = z\.string\(\)\.min\(8\)/);
});

test("publishes reviewed legal notices and original Society PDFs", async () => {
  const [shell, privacy, cookies, history, safetyPdf, historyPdf] = await Promise.all([
    read("app/components/RailSite.tsx"),
    read("app/privacy-policy/page.tsx"),
    read("app/cookie-policy/page.tsx"),
    read("app/club-history/page.tsx"),
    stat(new URL("public/documents/visitor-safety-guide.pdf", root)),
    stat(new URL("public/documents/ydsme-1929-1982.pdf", root)),
  ]);
  assert.match(shell, /Legal navigation/);
  assert.match(privacy, /Supabase/);
  assert.match(privacy, /Vercel/);
  assert.match(privacy, /Stripe/);
  assert.match(privacy, /Cloudflare Turnstile/);
  assert.match(cookies, /does not use advertising or analytics cookies/);
  assert.match(history, /ydsme-1929-1982\.pdf/);
  assert.ok(safetyPdf.size > 300_000);
  assert.ok(historyPdf.size > 100_000);
});

test("keeps donation checkout server-side and officer managed", async () => {
  const [checkout, stripe, content, cards, webhook, migration, settings, auth, donationsAdmin, donationExport] = await Promise.all([
    read("lib/actions/donations.ts"),
    read("lib/stripe.ts"),
    read("lib/actions/content.ts"),
    read("app/components/DonationCards.tsx"),
    read("app/api/stripe/webhook/route.ts"),
    read("supabase/migrations/202608180002_donation_webhook.sql"),
    read("app/settings/page.tsx"),
    read("lib/auth.ts"),
    read("app/admin/donations/page.tsx"),
    read("app/admin/donations/export/route.ts"),
  ]);
  assert.match(stripe, /process\.env\.STRIPE_SECRET_KEY/);
  assert.match(stripe, /import "server-only"/);
  assert.match(checkout, /amount: z\.coerce\.number\(\)\.min\(1\)\.max\(10_000\)/);
  assert.match(checkout, /checkout\.sessions\.create/);
  assert.match(checkout, /submit_type: "donate"/);
  assert.match(checkout, /payment_type: "donation"/);
  assert.match(checkout, /payment_intent_data: \{[\s\S]*description: donationLabel[\s\S]*metadata: donationMetadata/);
  assert.match(checkout, /Donation: \$\{campaign\.title\}/);
  assert.doesNotMatch(checkout, /payment_method_types/);
  assert.match(content, /saveDonationSettings[\s\S]*requireCapability\("donations\.manage"\)/);
  assert.match(auth, /membershipOfficerCapabilities[\s\S]*"donations\.view"[\s\S]*"donations\.manage"/);
  assert.match(donationsAdmin, /requireCapability\("donations\.view"\)/);
  assert.match(donationsAdmin, /view === "appeals"[\s\S]*requireCapability\("donations\.manage"\)/);
  assert.match(donationsAdmin, /saveDonationSettings/);
  assert.match(donationExport, /isMembershipOfficer\(user\.id, role\)/);
  assert.doesNotMatch(settings, /saveDonationSettings/);
  assert.match(cards, /startDonationCheckout/);
  assert.doesNotMatch(cards, /STRIPE_SECRET_KEY/);
  assert.match(webhook, /request\.text\(\)/);
  assert.match(webhook, /webhooks\.constructEvent/);
  assert.match(webhook, /checkout\.session\.async_payment_succeeded/);
  assert.match(webhook, /charge\.refunded/);
  assert.match(migration, /stripe_checkout_session_id text not null unique/);
  assert.match(migration, /alter table public\.donation_payments enable row level security/);
  assert.match(migration, /grant execute on function public\.target_donation_total_pence\(\) to service_role/);
  assert.doesNotMatch(content, /raised_pounds/);
  assert.doesNotMatch(settings, /Raised so far/);
});

test("keeps visitor bookings private, capacity-safe and staff verified", async () => {
  const [migration, abuseMigration, abuseHelper, actions, turnstile, form, admin, data, email, emailDelivery, ticket, cookieNotice, privacyNotice] = await Promise.all([
    read("supabase/migrations/202608180003_event_bookings.sql"),
    read("supabase/migrations/202608180020_booking_abuse_controls.sql"),
    read("lib/booking-abuse.ts"),
    read("lib/actions/bookings.ts"),
    read("lib/turnstile.ts"),
    read("app/components/BookingForm.tsx"),
    read("app/admin/bookings/page.tsx"),
    read("lib/data.ts"),
    read("lib/booking-email.ts"),
    read("lib/email-delivery.ts"),
    read("lib/booking-ticket.ts"),
    read("app/cookie-policy/page.tsx"),
    read("app/privacy-policy/page.tsx"),
  ]);
  assert.match(migration, /alter table public\.event_bookings enable row level security/);
  assert.match(migration, /revoke all on table public\.event_bookings from public, anon, authenticated/);
  assert.match(migration, /for update/);
  assert.match(migration, /reserved_places \+ p_party_size > selected_event\.booking_capacity/);
  assert.match(migration, /event_bookings_active_email_unique/);
  assert.match(abuseMigration, /p_party_size > 6/);
  assert.match(abuseMigration, /create_event_booking_v2/);
  assert.match(abuseMigration, /now\(\) - interval '10 minutes'/);
  assert.match(abuseMigration, /recent_device_places \+ p_party_size > 12/);
  assert.match(abuseMigration, /recent_ip_places \+ p_party_size > 12/);
  assert.match(abuseMigration, /event_booking_abuse_summary enable row level security/);
  assert.match(abuseMigration, /booking_device_hash = null/);
  assert.match(abuseMigration, /booking_ip_hash = null/);
  assert.match(abuseHelper, /httpOnly: true/);
  assert.match(abuseHelper, /maxAge: BOOKING_SECURITY_COOKIE_MAX_AGE/);
  assert.match(abuseHelper, /createHmac\("sha256"/);
  assert.match(turnstile, /TURNSTILE_SECRET_KEY/);
  assert.match(turnstile, /process\.env\.NODE_ENV !== "production"/);
  assert.match(turnstile, /JOURNEY_TEST_MODE === "true"/);
  assert.match(turnstile, /NEXT_PUBLIC_SUPABASE_URL === "http:\/\/127\.0\.0\.1:55321"/);
  assert.match(turnstile, /127\\\.0\\\.0\\\.1\|localhost/);
  assert.match(actions, /requireCapability\("bookings\.manage"\)/);
  assert.match(actions, /create_event_booking_v2/);
  assert.match(actions, /\.max\(6\)/);
  assert.match(actions, /consumeRateLimit\("visitor-booking"/);
  assert.match(actions, /cancelBooking/);
  assert.match(form, /useActionState/);
  assert.match(form, /referenceCode/);
  assert.match(form, /Math\.min\(6, availablePlaces\)/);
  assert.match(form, /Please do not make multiple bookings/);
  assert.match(admin, /checkInBooking/);
  assert.match(admin, /booking_management_summary/);
  assert.match(admin, /Download spreadsheet/);
  assert.match(data, /available_places/);
  assert.match(email, /sendTransactionalEmail/);
  assert.match(emailDelivery, /Idempotency-Key/);
  assert.match(emailDelivery, /usesLocalMailpit/);
  assert.match(emailDelivery, /NEXT_PUBLIC_SITE_URL/);
  assert.match(emailDelivery, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(emailDelivery, /LOCAL_MAILPIT_URL/);
  assert.match(email, /attachments/);
  assert.match(email, /content_id/);
  assert.match(email, /cid:\$\{ticket\.contentId\}/);
  assert.match(ticket, /TICKET_WIDTH = 1080/);
  assert.match(ticket, /TICKET_HEIGHT = 1920/);
  assert.match(ticket, /QRCode\.create/);
  assert.match(ticket, /shape-rendering="crispEdges"/);
  assert.match(ticket, /bookingVerificationUrl/);
  assert.match(cookieNotice, /ydsme-booking-security/);
  assert.match(privacyNotice, /event-scoped pseudonymous browser identifier/);
  assert.doesNotMatch(email, /NEXT_PUBLIC_RESEND/);
});

test("makes Stripe webhooks replay-safe and keeps finance private", async () => {
  const [webhook, migration, processingMigration, ledger] = await Promise.all([
    read("app/api/stripe/webhook/route.ts"),
    read("supabase/migrations/202608180004_secure_dashboard.sql"),
    read("supabase/migrations/202608180009_webhook_processing_state.sql"),
    read("app/admin/donations/page.tsx"),
  ]);
  assert.match(webhook, /stripe_webhook_events/);
  assert.match(webhook, /claimError\?\.code === "23505"/);
  assert.match(webhook, /existing\.processing_status === "processed"/);
  assert.match(webhook, /processing_status: "failed"/);
  assert.match(processingMigration, /processing_status in \('processing', 'processed', 'failed'\)/);
  assert.match(migration, /revoke all on public\.stripe_webhook_events from public, anon, authenticated/);
  assert.match(ledger, /requireCapability\("donations\.view"\)/);
});

test("uses trusted origins and accepts only safe external URLs", async () => {
  const [origin, authActions, callback, invite, donationActions, inputs, content] = await Promise.all([
    read("lib/trusted-origin.ts"),
    read("lib/actions/auth.ts"),
    read("app/auth/callback/route.ts"),
    read("app/auth/invite/page.tsx"),
    read("lib/actions/donations.ts"),
    read("lib/security-input.ts"),
    read("lib/actions/content.ts"),
  ]);
  assert.match(origin, /NEXT_PUBLIC_SITE_URL/);
  assert.match(origin, /resolveSiteOrigin\(value\)/);
  assert.match(await read("lib/site-origin.mjs"), /url\.protocol !== "https:"/);
  assert.doesNotMatch(authActions, /headers\(\).*origin/s);
  assert.doesNotMatch(donationActions, /headers\(\).*origin/s);
  assert.match(callback, /getTrustedAppOrigin/);
  assert.match(invite, /auth\.setSession/);
  assert.match(invite, /window\.history\.replaceState/);
  assert.match(invite, /!value\.startsWith\("\/\/"\)/);
  assert.match(invite, /router\.replace\(next\)/);
  assert.doesNotMatch(invite, /updateUser\(\{ password/);
  assert.match(inputs, /HTTP_PROTOCOLS\.has\(url\.protocol\)/);
  assert.match(content, /refine\(\(value\) => Boolean\(safeHttpUrl\(value\)\)/);
});

test("blocks inactive members, public quarantine reads and direct mutations", async () => {
  const [authorizationMigration, mutationMigration] = await Promise.all([
    read("supabase/migrations/202608180010_effective_authorization_hardening.sql"),
    read("supabase/migrations/202608180011_server_mutation_boundary.sql"),
  ]);
  assert.match(authorizationMigration, /create or replace function public\.is_active_member/);
  assert.match(authorizationMigration, /name not like 'quarantine\/%'/);
  assert.match(authorizationMigration, /revoke execute on all functions in schema public/);
  assert.match(authorizationMigration, /revoke truncate, references, trigger on all tables/);
  assert.match(mutationMigration, /revoke insert, update, delete on all tables in schema public/);
});

test("owns file lifecycle through Storage API instead of blocked SQL triggers", async () => {
  const [migration, actions] = await Promise.all([
    read("supabase/migrations/202608180014_storage_lifecycle_ownership.sql"),
    read("lib/actions/content.ts"),
  ]);
  assert.match(migration, /drop trigger if exists on_delete_document/);
  assert.match(migration, /drop trigger if exists on_delete_event/);
  assert.match(actions, /storage\.from\("documents"\)\.remove/);
  assert.match(actions, /storage\.from\("images"\)\.remove/);
});

test("records retention and delivery retry state without changing Auth", async () => {
  const [migration, workshopMigration, bookingActions, contentActions, authActions, bookingsPage, workshopsPage] = await Promise.all([
    read("supabase/migrations/202608180005_retention_and_delivery.sql"),
    read("supabase/migrations/202608180015_workshop_delivery_state.sql"),
    read("lib/actions/bookings.ts"),
    read("lib/actions/content.ts"),
    read("lib/actions/auth.ts"),
    read("app/admin/bookings/page.tsx"),
    read("app/admin/[section]/page.tsx"),
  ]);
  assert.match(migration, /legal_hold boolean not null default false/);
  assert.match(migration, /archived_at \+ interval '12 months'/);
  assert.match(migration, /record_event_booking_email_attempt/);
  assert.match(bookingActions, /record_event_booking_email_attempt/);
  assert.match(bookingActions, /resendBookingCancellation/);
  assert.match(bookingsPage, /Retry cancellation email/);
  assert.match(workshopMigration, /notification_email_attempts integer not null default 0/);
  assert.match(workshopMigration, /record_workshop_email_attempt/);
  assert.match(contentActions, /retryWorkshopReservationEmail/);
  assert.match(workshopsPage, /Email delivery issues/);
  assert.match(authActions, /auth\.signInWithPassword/);
  assert.match(authActions, /auth\.signInWithOtp/);
  assert.match(authActions, /auth\.resetPasswordForEmail/);
});

test("exposes normalized public configuration through a limited view", async () => {
  const [migration, writers, safeReplacement, data] = await Promise.all([
    read("supabase/migrations/202608180006_normalized_public_configuration.sql"),
    read("supabase/migrations/202608180007_configuration_write_functions.sql"),
    read("supabase/migrations/202608190004_safe_public_link_replacement.sql"),
    read("lib/data.ts"),
  ]);
  assert.match(migration, /create table if not exists public\.site_social_links/);
  assert.match(migration, /create table if not exists public\.site_affiliates/);
  assert.match(migration, /create table if not exists public\.donation_campaigns/);
  assert.match(migration, /view public\.public_site_links/);
  assert.match(writers, /replace_public_site_links/);
  assert.match(safeReplacement, /delete from public\.site_social_links where true/);
  assert.match(safeReplacement, /delete from public\.site_affiliates where true/);
  assert.match(data, /from\("donation_campaigns"\)/);
  assert.doesNotMatch(data, /createPublicClient\(\)[\s\S]*from\("configs"\)/);
});

test("initializes the Society settings singleton on fresh databases", async () => {
  const migration = await read("supabase/migrations/202608200018_ensure_society_settings.sql");
  assert.match(migration, /insert into public\.configs/);
  assert.match(migration, /where not exists \(select 1 from public\.configs\)/);
  assert.match(migration, /get diagnostics inserted_count = row_count/);
  assert.match(migration, /if inserted_count = 1 then[\s\S]*insert into public\.site_social_links/);
  assert.match(migration, /insert into public\.donation_campaigns/);
});

test("keeps club and registered-office addresses distinct in the configured footer", async () => {
  const [migration, settings, actions, data, shell, pageShell] = await Promise.all([
    read("supabase/migrations/202608180019_public_society_information.sql"),
    read("app/settings/page.tsx"),
    read("lib/actions/content.ts"),
    read("lib/data.ts"),
    read("app/components/RailSite.tsx"),
    read("app/components/PageShell.tsx"),
  ]);
  assert.match(migration, /add column if not exists club_address jsonb/);
  assert.match(migration, /view public\.public_site_config/);
  assert.match(migration, /grant select on public\.public_site_config to anon, authenticated/);
  assert.match(settings, /Club \/ railway address/);
  assert.match(settings, /Registered office address/);
  assert.match(actions, /club_address: \{/);
  assert.match(actions, /registered_address: \{/);
  assert.match(data, /from\("public_site_config"\)/);
  assert.match(data, /from\("public_site_links"\)/);
  assert.match(pageShell, /getPublicSiteConfig\(\)/);
  assert.match(shell, /siteConfig\.clubAddress/);
  assert.match(shell, /siteConfig\.registeredAddress/);
  assert.match(shell, /siteConfig\.socialLinks/);
  assert.doesNotMatch(shell, /York · YO24 2JE|Company no\. 26478R|facebook\.com\/YorkModelEngineers/i);
});

test("keeps public reads available during the additive projection rollout", async () => {
  const data = await read("lib/data.ts");
  assert.match(data, /error\?\.code === "PGRST205"/);
  assert.match(data, /from\("public_events"\)/);
  assert.match(data, /from\("public_committee_roster"\)/);
  assert.match(data, /Permission or policy failures[\s\S]*must never fall through/);
  assert.doesNotMatch(data, /isMissingProjection[\s\S]*42501/);
});

test("caches reusable public API reads and invalidates them after writes", async () => {
  const [
    cacheTags,
    data,
    membership,
    paymentSettings,
    membershipApply,
    publicProjects,
    contentActions,
    bookingActions,
    membershipActions,
    workbenchActions,
    paymentWebhook,
  ] = await Promise.all([
    read("lib/cache-tags.ts"),
    read("lib/data.ts"),
    read("lib/membership.ts"),
    read("lib/membership-settings.ts"),
    read("app/membership/apply/page.tsx"),
    read("lib/public-projects.ts"),
    read("lib/actions/content.ts"),
    read("lib/actions/bookings.ts"),
    read("lib/actions/membership.ts"),
    read("lib/actions/workbench.ts"),
    read("app/api/stripe/webhook/route.ts"),
  ]);

  for (const tag of [
    "PUBLIC_COMMITTEE_CACHE_TAG",
    "PUBLIC_DONATIONS_CACHE_TAG",
    "PUBLIC_EVENTS_CACHE_TAG",
    "PUBLIC_MEMBERSHIP_PAYMENT_CONTACT_CACHE_TAG",
    "PUBLIC_MEMBERSHIP_PLANS_CACHE_TAG",
    "PUBLIC_PROJECTS_CACHE_TAG",
    "PUBLIC_SITE_CONFIG_CACHE_TAG",
  ]) assert.match(cacheTags, new RegExp(`export const ${tag}`));

  assert.match(data, /getCachedPublicEvents = unstable_cache[\s\S]*revalidate: 30/);
  assert.match(data, /getCachedPublicMemberEventTeasers = unstable_cache[\s\S]*revalidate: 300/);
  assert.match(data, /getCachedCommittees = unstable_cache[\s\S]*revalidate: 3600/);
  assert.match(data, /getCachedPublicSiteConfig = unstable_cache[\s\S]*revalidate: 3600/);
  assert.match(data, /getCachedDonationSettings = unstable_cache[\s\S]*revalidate: 60/);
  assert.match(data, /getBookableEvent[\s\S]*await getPublicEvents\(\)/);
  assert.match(membership, /getPublicMembershipPlans = unstable_cache[\s\S]*revalidate: 300/);
  assert.match(paymentSettings, /select\("configured,treasurer_name,treasurer_email"\)/);
  assert.match(paymentSettings, /getPublicMembershipPaymentContact = unstable_cache/);
  assert.match(membershipApply, /Promise\.all\(\[[\s\S]*getPublicMembershipPlans\(\)[\s\S]*getPublicMembershipPaymentContact\(\)/);
  assert.match(publicProjects, /getCachedPublicFeaturedProjects = unstable_cache/);
  assert.match(publicProjects, /getCachedPublicFeaturedProject = unstable_cache/);
  assert.match(publicProjects, /createPublicClient\(\)/);
  assert.doesNotMatch(publicProjects, /from "@\/lib\/supabase\/server"/);
  assert.match(contentActions, /updateTag\(PUBLIC_EVENTS_CACHE_TAG\)/);
  assert.match(await read("lib/actions/people.ts"), /updateTag\(PUBLIC_COMMITTEE_CACHE_TAG\)/);
  assert.match(contentActions, /updateTag\(PUBLIC_SITE_CONFIG_CACHE_TAG\)/);
  assert.match(contentActions, /updateTag\(PUBLIC_DONATIONS_CACHE_TAG\)/);
  assert.match(bookingActions, /updateTag\(PUBLIC_EVENTS_CACHE_TAG\)/);
  assert.match(membershipActions, /updateTag\(PUBLIC_MEMBERSHIP_PAYMENT_CONTACT_CACHE_TAG\)/);
  assert.match(membershipActions, /updateTag\(PUBLIC_MEMBERSHIP_PLANS_CACHE_TAG\)/);
  assert.match(workbenchActions, /updateTag\(PUBLIC_PROJECTS_CACHE_TAG\)/);
  assert.match(paymentWebhook, /revalidateTag\(PUBLIC_DONATIONS_CACHE_TAG, "max"\)/);
});

test("caches shared dashboard reads without caching personal member state", async () => {
  const [
    cacheTags,
    dashboardData,
    dashboard,
    library,
    documents,
    documentDownload,
    contentActions,
    workbench,
  ] = await Promise.all([
    read("lib/cache-tags.ts"),
    read("lib/dashboard-data.ts"),
    read("app/dashboard/page.tsx"),
    read("app/dashboard/library/page.tsx"),
    read("app/dashboard/[section]/page.tsx"),
    read("app/dashboard/documents/[id]/download/route.ts"),
    read("lib/actions/content.ts"),
    read("lib/workbench.ts"),
  ]);

  for (const tag of [
    "MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG",
    "MEMBER_DASHBOARD_EVENTS_CACHE_TAG",
    "MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG",
  ]) assert.match(cacheTags, new RegExp(`export const ${tag}`));

  assert.match(dashboardData, /getCachedDashboardSharedSnapshot = unstable_cache[\s\S]*revalidate: 60/);
  assert.match(dashboardData, /getMemberDocumentCounts = unstable_cache[\s\S]*revalidate: 300/);
  assert.match(dashboardData, /getCachedPublishedMemberDocuments = unstable_cache[\s\S]*revalidate: 300/);
  assert.match(dashboardData, /getCachedWorkshopReservationCounts = unstable_cache[\s\S]*revalidate: 15/);
  assert.match(dashboard, /getDashboardSharedSnapshot\(today\)/);
  assert.match(dashboard, /getMemberDocumentCounts\(\)/);
  assert.match(dashboard, /getWorkshopReservationCounts\(workshopIds\)/);
  assert.match(dashboard, /dashboard_feed_snapshot/);
  assert.match(dashboard, /\.eq\("participant_id", user\.id\)/);
  assert.match(dashboard, /own_archived_notices/);
  assert.match(library, /getMemberDocumentCounts\(\)/);
  assert.doesNotMatch(library, /createClient|\.from\("documents"\)/);
  assert.match(documents, /getPublishedMemberDocuments\(config\.categories, firstRow, pageSize\)/);
  assert.match(documentDownload, /requireUser\(\)/);
  assert.match(documentDownload, /Cache-Control", "private, no-store, max-age=0"/);
  assert.match(contentActions, /updateTag\(MEMBER_DASHBOARD_EVENTS_CACHE_TAG\)/);
  assert.match(contentActions, /updateTag\(MEMBER_DASHBOARD_WORKSHOPS_CACHE_TAG\)/);
  assert.match(contentActions, /updateTag\(MEMBER_DASHBOARD_DOCUMENTS_CACHE_TAG\)/);
  assert.doesNotMatch(workbench, /unstable_cache|createAdminClient/);
  assert.match(workbench, /import \{ createClient \} from "@\/lib\/supabase\/server"/);
});

test("enables the complete membership platform with one flag and otherwise falls back to MemberMojo", async () => {
  const [features, membershipPage, applicationPage, accountPage, checkout, verification, guardian, switchAccount, settings, actions] = await Promise.all([
    read("lib/features.ts"),
    read("app/membership/page.tsx"),
    read("app/membership/apply/page.tsx"),
    read("app/account/page.tsx"),
    read("app/membership/checkout/page.tsx"),
    read("app/membership/verify/route.ts"),
    read("app/membership/guardian-consent/page.tsx"),
    read("app/auth/switch-account/page.tsx"),
    read("app/settings/page.tsx"),
    read("lib/actions/membership.ts"),
  ]);
  assert.match(features, /MEMBERMOJO_MEMBERSHIP_URL = "https:\/\/membermojo\.co\.uk\/york-model-engineers"/);
  assert.match(features, /process\.env\.MEMBERSHIP_MODE/);
  assert.doesNotMatch(features, /process\.env\.ENABLE_MEMBERSHIP/);
  assert.match(features, /membershipBillingEnabled/);
  assert.match(features, /membershipAdministrationEnabled/);
  assert.match(features, /membershipMode\(\) === "website"/);
  assert.match(features, /membershipAdministrationEnabled = membershipPlatformEnabled/);
  assert.match(membershipPage, /href=\{enabled \? "\/membership\/apply" : MEMBERMOJO_MEMBERSHIP_URL\}/);
  assert.doesNotMatch(membershipPage, /id="membership-application"|submitMembershipApplication/);
  assert.match(applicationPage, /if \(!enabled\) redirect\(MEMBERMOJO_MEMBERSHIP_URL\)/);
  assert.match(accountPage, /\{!membershipEnabled \? <div className="billing-panel">/);
  assert.match(accountPage, /href=\{MEMBERMOJO_MEMBERSHIP_URL\}/);
  for (const guardedRoute of [checkout, verification, guardian]) {
    assert.match(guardedRoute, /if \(!membershipBillingEnabled\(\)\) redirect\(MEMBERMOJO_MEMBERSHIP_URL\)/);
  }
  assert.match(switchAccount, /membershipBillingEnabled/);
  assert.match(settings, /query.tab === "membership"/);
  assert.match(settings, /tab: "payment"[\s\S]*?\/admin\/memberships\/setup/);
  assert.match(settings, /requireCapability\("settings.manage"\)/);
  assert.match(actions, /export async function confirmGuardianMembershipConsent[\s\S]*?if \(!membershipBillingEnabled\(\)\) redirect\(MEMBERMOJO_MEMBERSHIP_URL\)/);
  assert.match(actions, /export async function saveMembershipPaymentSettings[\s\S]*?if \(!membershipAdministrationEnabled\(\)\) redirect\(MEMBERMOJO_MEMBERSHIP_URL\)/);
});

test("keeps membership application and callback states on the dedicated application page", async () => {
  const [membershipPage, applicationPage, applicationWizard, eligibilityFields, actions, verification, checkout, billing] = await Promise.all([
    read("app/membership/page.tsx"),
    read("app/membership/apply/page.tsx"),
    read("app/membership/apply/MembershipApplicationWizard.tsx"),
    read("app/membership/apply/MembershipEligibilityFields.tsx"),
    read("lib/actions/membership.ts"),
    read("app/membership/verify/route.ts"),
    read("app/membership/checkout/page.tsx"),
    read("lib/membership.ts"),
  ]);
  assert.match(membershipPage, /redirect\(`\/membership\/apply\?application=/);
  assert.match(applicationWizard, /action=\{submitMembershipApplication\}/);
  const applicationSources = `${applicationPage}\n${applicationWizard}\n${eligibilityFields}`;
  for (const field of ["plan_id", "full_name", "contact_email", "date_of_birth", "payment_method", "terms"]) {
    assert.match(applicationSources, new RegExp(`name="${field}"`));
  }
  assert.match(eligibilityFields, /name="date_of_birth"[\s\S]*required/);
  assert.match(eligibilityFields, /defaultMembershipPlan/);
  assert.match(applicationWizard, /Step \{stage \+ 1\} of \{stages\.length\}/);
  assert.match(applicationWizard, /hidden=\{stage !== 0\}/);
  assert.match(applicationWizard, /checkValidity\(\)/);
  assert.match(applicationPage, /if \(outcome\)[\s\S]*membership-application-result-page/);
  assert.match(applicationPage, /Thank you for applying for Society membership/);
  assert.match(applicationPage, /We’ll email you soon with your membership details and information about website access/);
  assert.match(actions, /eligibleMembershipPlans/);
  for (const source of [actions, verification, checkout, billing]) {
    assert.match(source, /\/membership\/apply\?application=/);
    assert.doesNotMatch(source, /\/membership\?application=/);
  }
});

test("links member-facing activation notices to newly created portal accounts", async () => {
  const [routing, wording, guardianIsolation, ownership, account, actions] = await Promise.all([
    read("supabase/migrations/202608200031_membership_portal_notification_routing.sql"),
    read("supabase/migrations/202608200032_membership_activation_notice_wording.sql"),
    read("supabase/migrations/202608200033_membership_guardian_notification_isolation.sql"),
    read("supabase/migrations/202608210004_member_notification_ownership.sql"),
    read("app/account/page.tsx"),
    read("lib/actions/membership.ts"),
  ]);
  assert.match(routing, /route_membership_notification_to_portal/);
  assert.match(routing, /link_existing_membership_notifications_to_portal/);
  assert.match(routing, /membership\.activated', 'membership\.honorary-activated/);
  assert.match(routing, /lower\(new\.recipient_email\) <> v_contact_email/);
  assert.match(routing, /notify_officer_created_paid_membership/);
  assert.match(wording, /normalise_membership_activation_notice/);
  assert.match(guardianIsolation, /v_contact_email is null or lower\(new\.recipient_email\) <> v_contact_email/);
  assert.match(guardianIsolation, /notification\.body like 'Guardian copy:%'/);
  assert.match(ownership, /member\.auth_user_id = auth\.uid\(\)/);
  assert.match(ownership, /notification\.recipient_user_id = auth\.uid\(\)/);
  assert.match(account, /rpc\("get_own_membership_notifications"/);
  assert.doesNotMatch(account, /createServiceClient/);
  assert.match(actions, /rpc\("mark_own_membership_notification_read"/);
});

test("hardens membership links, duplicate identity matching, and provider failures", async () => {
  const [nextConfig, proxy, actions, membership, webhook] = await Promise.all([
    read("next.config.ts"),
    read("proxy.ts"),
    read("lib/actions/membership.ts"),
    read("lib/membership.ts"),
    read("app/api/stripe/webhook/route.ts"),
  ]);
  assert.match(proxy, /Content-Security-Policy/);
  assert.match(proxy, /'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.match(proxy, /object-src 'none'/);
  assert.match(proxy, /frame-ancestors 'none'/);
  assert.match(nextConfig, /sensitiveMembershipPaths[\s\S]*\/membership\/verify/);
  assert.match(nextConfig, /Referrer-Policy", value: "no-referrer"/);
  assert.match(nextConfig, /X-Robots-Tag", value: "noindex, nofollow, noarchive"/);
  assert.match(actions, /postgrestLikeLiteral/);
  assert.match(actions, /normalizeIdentityName/);
  assert.match(actions, /memberCandidates\?\.find/);
  assert.match(actions, /applicationCandidates\?\.find/);
  assert.doesNotMatch(actions, /\.ilike\("full_name"/);
  assert.doesNotMatch(membership, /Membership Checkout Session creation failed[\s\S]{0,120}error\.message/);
  assert.match(webhook, /membership-checkout-\$\{event\.type\}-\$\{session\.id\}/);
  assert.match(webhook, /onConflict: "deduplication_key", ignoreDuplicates: true/);
  assert.match(webhook, /if \(notificationError\) throw new Error\("Unable to queue the failed membership Checkout notice\."\)/);
});
