import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readLocalSupabaseEnvironment } from "../local-supabase.mjs";

function samplePdf() {
  let source = "%PDF-1.4\n";
  const offsets = [0];
  for (const body of [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> >>",
  ]) {
    offsets.push(Buffer.byteLength(source));
    source += `${offsets.length - 1} 0 obj\n${body}\nendobj\n`;
  }
  const xref = Buffer.byteLength(source);
  source += "xref\n0 4\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) source += `${String(offset).padStart(10, "0")} 00000 n \n`;
  return Buffer.from(source + `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
}

test("library PDF modal uploads, handles invalid files and preserves entered details", async ({ page }) => {
  test.skip(process.env.JOURNEY_DOCUMENT_TESTS !== "true", "Requires isolated local Supabase.");
  const local = readLocalSupabaseEnvironment("Library upload test");
  const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const suffix = randomUUID();
  const email = `document-${suffix}@example.test`;
  const password = `Document-${suffix}!`;
  const title = `Library preview ${suffix.slice(0,8)}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Library test" } });
  expect(error).toBeNull();
  const userId = data.user.id;
  try {
    await admin.from("users").update({ membership_status: "active" }).eq("id", userId);
    await admin.from("user_roles").upsert({ user_id: userId, role: "committee" }, { onConflict: "user_id" });
    await page.goto("/signin?method=password&next=%2Fdashboard%2Fpublications");
    const signIn = page.locator(".auth-flip-back form");
    await signIn.locator('[name="email"]').fill(email);
    await signIn.locator('[name="password"]').fill(password);
    await signIn.getByRole("button", { name: /Sign in securely/ }).click();
    await page.waitForURL("**/dashboard/publications");
    const create = page.getByRole("button", { name: "Upload a PDF", exact: true });
    await create.click();
    const dialog = page.getByRole("dialog");
    const save = dialog.getByRole("button", { name: "Save document", exact: true });
    await expect(save).toBeDisabled();
    await dialog.getByLabel("Document name", { exact: true }).fill(title);
    await dialog.getByLabel("Description (optional)").fill("First paragraph.\n\nSecond paragraph.");
    page.once("dialog", confirmation => confirmation.dismiss());
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "/tmp/ydsme-library-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(save).toBeInViewport();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/ydsme-library-mobile.png" });
    await dialog.getByLabel("PDF file", { exact: true }).setInputFiles({ name: "invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("Not a PDF") });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog.getByRole("alert")).toContainText("failed security validation");
    await expect(save).toBeDisabled();
    await expect(dialog.getByLabel("Document name", { exact: true })).toHaveValue(title);
    await dialog.getByLabel("PDF file", { exact: true }).setInputFiles({ name: "library-preview.pdf", mimeType: "application/pdf", buffer: samplePdf() });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog).not.toBeVisible();
    await page.waitForURL("**/dashboard/publications?status=published");
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const saved = await admin.from("documents").select("category,file_url,descriptions").eq("created_by", userId).single();
    expect(saved.error).toBeNull();
    expect(saved.data.category).toBe("publication");
    expect(saved.data.descriptions.replace(/\r/g, "")).toContain("\n\n");
    expect((await admin.storage.from("documents").download(saved.data.file_url.replace(/^documents\//, ""))).error).toBeNull();

    const editedTitle = title + " revised";
    await page.getByRole("article").filter({ hasText: title }).getByRole("button", { name: "Edit details", exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(dialog.locator(".editor-dialog-header>button")).toHaveCSS("width", "42px");
    await dialog.getByLabel("Document name", { exact: true }).fill(editedTitle);
    await dialog.getByLabel("Description (optional)").fill("Updated summary.\n\nAdditional information.");
    page.once("dialog", confirmation => confirmation.dismiss());
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.screenshot({ path: "/tmp/ydsme-library-edit-desktop.png" });
    await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("heading", { name: editedTitle, exact: true })).toBeVisible();
    await page.getByRole("article").filter({ hasText: editedTitle }).getByRole("button", { name: "Replace version", exact: true }).click();
    const replace = dialog.getByRole("button", { name: "Replace PDF", exact: true });
    await expect(replace).toBeDisabled();
    await expect(dialog).toContainText("saved as version 2");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(replace).toBeInViewport();
    await page.screenshot({ path: "/tmp/ydsme-library-replace-mobile.png" });
    await dialog.getByLabel("Replacement PDF", { exact: true }).setInputFiles({ name: "invalid.pdf", mimeType: "application/pdf", buffer: Buffer.from("Invalid") });
    await expect(replace).toBeEnabled();
    await replace.click();
    await expect(dialog.getByRole("alert")).toContainText("failed security validation");
    await expect(replace).toBeDisabled();
    await dialog.getByLabel("Replacement PDF", { exact: true }).setInputFiles({ name: "updated.pdf", mimeType: "application/pdf", buffer: samplePdf() });
    await expect(replace).toBeEnabled();
    await replace.click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole("article").filter({ hasText: editedTitle })).toContainText("version 2");
    const replaced = await admin.from("documents").select("name,descriptions,version,file_url").eq("created_by", userId).single();
    expect(replaced.data.name).toBe(editedTitle);
    expect(replaced.data.descriptions.replace(/\r/g, "")).toBe("Updated summary.\n\nAdditional information.");
    expect(replaced.data.version).toBe(2);
    expect(replaced.data.file_url).not.toBe(saved.data.file_url);
    expect((await admin.storage.from("documents").download(replaced.data.file_url.replace(/^documents\//, ""))).error).toBeNull();
    expect((await admin.storage.from("documents").download(saved.data.file_url.replace(/^documents\//, ""))).error).not.toBeNull();
    await create.click();
    await expect(dialog.getByLabel("Document name", { exact: true })).toHaveValue("");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(create).toBeFocused();
  } finally {
    const { data: docs } = await admin.from("documents").select("file_url").eq("created_by", userId);
    if (docs?.length) await admin.storage.from("documents").remove(docs.map(doc => doc.file_url.replace(/^documents\//, "")));
    const { data: quarantined } = await admin.storage.from("documents").list(`quarantine/${userId}`);
    if (quarantined?.length) await admin.storage.from("documents").remove(quarantined.map(file => `quarantine/${userId}/${file.name}`));
    await admin.from("documents").delete().eq("created_by", userId);
    await admin.from("audit_logs").delete().eq("actor_user_id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
});
