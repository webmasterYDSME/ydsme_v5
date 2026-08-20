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
  const [index, detail, create, dashboard, navigation, imageField, styles] = await Promise.all([
    read("app/dashboard/workbench/page.tsx"),
    read("app/dashboard/workbench/[id]/page.tsx"),
    read("app/dashboard/workbench/new/page.tsx"),
    read("app/dashboard/page.tsx"),
    read("app/components/PortalNavigation.tsx"),
    read("app/components/ProjectImageUploadField.tsx"),
    read("app/globals.css"),
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
  assert.match(styles, /\.workbench-project-card\{display:flex;flex-direction:column\}/);
  assert.match(styles, /\.workbench-project-card-body\{display:flex;flex:1;flex-direction:column\}/);
  assert.match(styles, /\.workbench-project-card footer\{margin-top:auto\}/);
});
