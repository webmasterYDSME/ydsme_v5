import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("keeps Workbench projects and photographs inside the active-member boundary", async () => {
  const [migration, authenticatedAccess, formerMemberRetention, actions, workbench, uploads, uploadFinalizer] = await Promise.all([
    read("supabase/migrations/202608200008_project_workbench.sql"),
    read("supabase/migrations/202608200017_project_workbench_authenticated_access.sql"),
    read("supabase/migrations/202608200019_preserve_former_member_projects.sql"),
    read("lib/actions/workbench.ts"),
    read("lib/workbench.ts"),
    read("lib/actions/uploads.ts"),
    read("lib/uploads.ts"),
  ]);

  assert.match(migration, /alter table public\.member_projects enable row level security/);
  assert.match(migration, /member_projects_read[\s\S]*public\.is_active_member\(\)/);
  assert.match(migration, /member_project_comments_create[\s\S]*author_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /member_project_follows_remove[\s\S]*user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /'project-images',[\s\S]*false,[\s\S]*8 \* 1024 \* 1024/);
  assert.match(migration, /ydsme_member_project_images_read[\s\S]*public\.is_active_member\(\)/);
  assert.doesNotMatch(migration, /grant [^;]*member_project[^;]* to anon/);
  assert.match(authenticatedAccess, /security invoker/);
  assert.match(authenticatedAccess, /grant execute on function public\.create_member_project_update[\s\S]*to authenticated/);
  assert.match(authenticatedAccess, /revoke select, insert, update, delete[\s\S]*from service_role/);
  assert.match(formerMemberRetention, /member_projects[\s\S]*alter column owner_id drop not null/);
  assert.match(formerMemberRetention, /foreign key \(owner_id\) references public\.users\(id\) on delete set null/);
  assert.match(formerMemberRetention, /member_project_updates set author_id = null where author_id = p_user_id/);
  assert.match(formerMemberRetention, /member_project_comments set author_id = null where author_id = p_user_id/);
  assert.match(actions, /import \{ createClient \} from "@\/lib\/supabase\/server"/);
  assert.doesNotMatch(actions, /createServiceClient/);
  assert.match(workbench, /import \{ createClient \} from "@\/lib\/supabase\/server"/);
  assert.doesNotMatch(workbench, /createServiceClient/);
  assert.match(workbench, /"Former member"/);
  assert.match(actions, /createProject[\s\S]*await requireUser\(\)/);
  assert.match(actions, /addProjectUpdate[\s\S]*project\.owner_id !== user\.id/);
  assert.match(actions, /addProjectComment[\s\S]*consumeRateLimit\("project-comment"/);
  assert.match(actions, /archiveProjectComment[\s\S]*canManageContent\(role\)/);
  assert.match(uploads, /"project-image"[\s\S]*bucket: "project-images"/);
  assert.match(uploadFinalizer, /"project-image"[\s\S]*prefix: "projects"/);
});

test("provides the complete member Workbench journey", async () => {
  const [index, detail, create, dashboard, navigation, library, imageField, styles, navigationStyles] = await Promise.all([
    read("app/dashboard/workbench/page.tsx"),
    read("app/dashboard/workbench/[id]/page.tsx"),
    read("app/dashboard/workbench/new/page.tsx"),
    read("app/dashboard/page.tsx"),
    Promise.all([read("lib/portal-nav.ts"), read("app/components/PortalNavigation.tsx")]).then((parts) => parts.join("\n")),
    read("app/dashboard/library/page.tsx"),
    read("app/components/ProjectImageUploadField.tsx"),
    read("app/globals.css"),
    read("app/components/portal-navigation.module.css"),
  ]);

  assert.match(index, /Help wanted/);
  assert.match(index, /scope === "following"/);
  assert.match(create, /action=\{createProject\}/);
  assert.match(detail, /action=\{addProjectUpdate\}/);
  assert.match(detail, /action=\{addProjectComment\}/);
  assert.match(detail, /action=\{toggleProjectFollow\}/);
  assert.match(detail, /Progress timeline/);
  assert.match(imageField, /multiple=\{maximum > 1\}/);
  assert.match(imageField, /createUploadIntent\(\{ kind: "project-image"/);
  assert.match(dashboard, /Projects taking shape/);
  assert.match(navigation, /href: "\/dashboard\/workbench"/);
  assert.match(navigation, /label: "Society library"/);
  assert.match(navigation, /label: "Membership and money"/);
  assert.match(navigation, /task needs/);
  assert.match(library, /Committee minutes/);
  assert.match(library, /Society publications/);
  assert.match(library, /Member resources/);
  assert.match(navigationStyles, /\.sectionLabel/);
  assert.match(styles, /\.library-grid/);
  assert.match(styles, /\.workbench-project-card\{display:flex;flex-direction:column\}/);
  assert.match(styles, /\.workbench-project-card-body\{display:flex;flex:1;flex-direction:column\}/);
  assert.match(styles, /\.workbench-project-card footer\{margin-top:auto\}/);
  assert.match(styles, /\.public-project-card footer\{[^}]*background:#f2ede2/);
});

test("publishes only owner-consented and independently reviewed project snapshots", async () => {
  const [migration, removalMigration, reviewMigration, actions, workbenchPage, publicData, publicIndex, publicDetail, navigation, sitemap] = await Promise.all([
    read("supabase/migrations/202608200020_public_project_featuring.sql"),
    read("supabase/migrations/202608200021_public_project_review_removal.sql"),
    read("supabase/migrations/202608200022_public_project_independent_review.sql"),
    read("lib/actions/workbench.ts"),
    read("app/dashboard/workbench/[id]/page.tsx"),
    read("lib/public-projects.ts"),
    read("app/projects/page.tsx"),
    read("app/projects/[slug]/page.tsx"),
    read("app/components/RailSite.tsx"),
    read("app/sitemap.ts"),
  ]);

  assert.match(migration, /project_status <> 'completed'/);
  assert.match(migration, /owner_consented_at is null/);
  assert.match(migration, /public\.has_app_role\(array\['committee', 'administrator'\]\)/);
  assert.match(migration, /public_featured_projects[\s\S]*owner_byline[\s\S]*cover_image_path/);
  assert.doesNotMatch(migration, /create table public\.public_featured_projects[\s\S]*author_id/);
  assert.match(migration, /delete from public\.public_featured_projects where project_id = p_project_id/);
  assert.match(migration, /member_projects_invalidate_public_feature/);
  assert.match(migration, /after update of owner_id/);
  assert.match(migration, /new\.owner_id is not null and new\.project_status = 'completed'/);
  assert.match(migration, /member_project_updates_invalidate_public_feature/);
  assert.match(removalMigration, /status in \('pending', 'approved'\)/);
  assert.match(reviewMigration, /public_feature_requires_independent_review/);
  assert.match(actions, /requestPublicProjectFeature[\s\S]*Explicit\+owner\+consent\+is\+required/);
  assert.match(actions, /approvePublicProjectFeature[\s\S]*canManageContent\(role\)/);
  assert.match(actions, /public-project-images/);
  assert.match(workbenchPage, /Submit for committee review/);
  assert.match(workbenchPage, /Withdraw and unpublish/);
  assert.match(publicData, /Only paths already present in the sanitised public projection/);
  assert.match(publicData, /createSignedUrls\(uniquePaths, 5 \* 60\)/);
  assert.match(publicIndex, /From the workbench/);
  assert.match(publicIndex, /robots: \{ index: true, follow: true \}/);
  assert.match(publicDetail, /reviewed before publication/);
  assert.match(publicDetail, /robots: \{ index: true, follow: true \}/);
  assert.doesNotMatch(navigation, /const headerNav = [^\n]*Projects/);
  assert.match(navigation, /const footerNav = \[\["Projects","\/projects"\],\.\.\.headerNav\]/);
  assert.match(sitemap, /path: "\/projects"/);
  assert.match(sitemap, /getPublicFeaturedProjectSitemapEntries/);
  assert.match(sitemap, /`\$\{SITE_URL\}\/projects\/\$\{project\.slug\}`/);
});
