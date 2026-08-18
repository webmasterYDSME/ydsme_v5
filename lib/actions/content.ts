"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { canManageContent, requireRole, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const text = (min = 1, max = 5000) => z.string().trim().min(min).max(max);
const idString = z.string().min(1).max(100);
const optionalUrl = z.union([z.literal(""), z.string().url().max(2048)]);

const eventSchema = z.object({
  id: z.coerce.number().int().positive().optional(), name: text(2, 180), descriptions: text(2, 5000),
  start_date: z.iso.date(), end_date: z.iso.date(), start_time: text(4, 8), end_time: text(4, 8),
  event_type: z.enum(["public", "member_only"]), reservation_link: optionalUrl,
  file_url: z.string().max(2048).default(""), display_in_homepage: z.boolean(), booking_enabled: z.boolean(),
  booking_capacity: z.coerce.number().int().min(1).max(10000).optional(),
});

const workshopSchema = z.object({
  id: z.string().uuid().optional(), title: text(2, 180), descriptions: text(2, 5000), notes: z.string().trim().max(5000),
  date: z.iso.date(), start_time: text(4, 8), end_time: text(4, 8), host_name: text(2, 180), venue: text(2, 240),
  virtual_link: optionalUrl, maximum_participants: z.coerce.number().int().min(1).max(500),
});

const bool = (formData: FormData, name: string) => formData.get(name) === "on" || formData.get(name) === "true";

export async function saveEvent(formData: FormData) {
  const { user } = await requireRole(["administrator", "committee"]);
  const parsed = eventSchema.safeParse({
    id: formData.get("id") || undefined, name: formData.get("name"), descriptions: formData.get("descriptions"),
    start_date: formData.get("start_date"), end_date: formData.get("end_date"), start_time: formData.get("start_time"), end_time: formData.get("end_time"),
    event_type: formData.get("event_type"), reservation_link: formData.get("reservation_link") || "", file_url: formData.get("file_url") || "",
    display_in_homepage: bool(formData, "display_in_homepage"), booking_enabled: bool(formData, "booking_enabled"),
    booking_capacity: formData.get("booking_capacity") || undefined,
  });
  if (!parsed.success) redirect("/admin/events?error=Please+check+all+event+fields.");
  if (parsed.data.end_date < parsed.data.start_date) redirect("/admin/events?error=The+end+date+cannot+be+before+the+start+date.");
  if (parsed.data.booking_enabled && (parsed.data.event_type !== "public" || !parsed.data.booking_capacity)) {
    redirect("/admin/events?error=Website+booking+needs+a+public+event+and+a+visitor+capacity.");
  }
  const { id, booking_capacity, ...parsedValues } = parsed.data;
  const values = {
    ...parsedValues,
    booking_capacity: parsedValues.booking_enabled ? booking_capacity : null,
    is_ticket_required: parsedValues.booking_enabled || Boolean(parsedValues.reservation_link),
  };
  const admin = createAdminClient();
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const accepted = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (image.size > 8 * 1024 * 1024 || !accepted.includes(image.type)) redirect("/admin/events?error=Use+a+JPG,+PNG,+WebP+or+AVIF+image+smaller+than+8MB.");
    const safeName = image.name.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
    const path = `events/${Date.now()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("images").upload(path, image, { contentType: image.type, upsert: false });
    if (uploadError) redirect(`/admin/events?error=${encodeURIComponent(uploadError.message)}`);
    values.file_url = `images/${path}`;
  }
  const query = id ? admin.from("events").update(values).eq("id", id) : admin.from("events").insert({ ...values, host: user.id });
  const { error } = await query;
  if (error) redirect(`/admin/events?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/"); revalidatePath("/events"); revalidatePath("/dashboard"); revalidatePath("/admin/events");
  redirect("/admin/events?notice=event-saved");
}

export async function deleteEvent(formData: FormData) {
  await requireRole(["administrator", "committee"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const { error } = await createAdminClient().from("events").delete().eq("id", id);
  if (error) redirect(`/admin/events?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/"); revalidatePath("/events"); revalidatePath("/dashboard"); revalidatePath("/admin/events");
}

export async function saveWorkshop(formData: FormData) {
  const { user } = await requireRole(["administrator", "committee"]);
  const parsed = workshopSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/admin/workshops?error=Please+check+all+workshop+fields.");
  const { id, ...values } = parsed.data;
  const admin = createAdminClient();
  const query = id ? admin.from("workshops").update(values).eq("id", id) : admin.from("workshops").insert({ ...values, created_by: user.id });
  const { error } = await query;
  if (error) redirect(`/admin/workshops?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard"); revalidatePath("/admin/workshops");
  redirect("/admin/workshops?notice=workshop-saved");
}

export async function deleteWorkshop(formData: FormData) {
  await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const { error } = await createAdminClient().from("workshops").delete().eq("id", id);
  if (error) redirect(`/admin/workshops?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard"); revalidatePath("/admin/workshops");
}

export async function joinWorkshop(formData: FormData) {
  const { user } = await requireUser();
  const referenceId = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  const { data: existing } = await supabase.from("participants").select("id").eq("reference_id", referenceId).eq("participant_id", user.id).maybeSingle();
  if (!existing) await supabase.from("participants").insert({ reference_id: referenceId, participant_id: user.id });
  revalidatePath("/dashboard");
}

export async function leaveWorkshop(formData: FormData) {
  const { user } = await requireUser();
  const referenceId = z.string().uuid().parse(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("participants").delete().eq("reference_id", referenceId).eq("participant_id", user.id);
  revalidatePath("/dashboard");
}

export async function createMessage(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z.object({ title: text(2, 120), message: text(2, 2000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/dashboard?error=Please+write+a+title+and+message.");
  const admin = createAdminClient();
  const { data: profile } = await admin.from("users").select("full_name").eq("id", user.id).maybeSingle();
  const { error } = await admin.from("feeds").insert({ type: "message", ...parsed.data, author_id: user.id, author_name: profile?.full_name || user.email });
  if (error) redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard");
}

export async function deleteMessage(formData: FormData) {
  const { user, role } = await requireUser();
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  const admin = createAdminClient();
  const { data } = await admin.from("feeds").select("author_id").eq("id", id).single();
  if (data?.author_id !== user.id && !canManageContent(role)) redirect("/dashboard?error=You+cannot+remove+that+message.");
  await admin.from("feeds").delete().eq("id", id);
  revalidatePath("/dashboard");
}

export async function uploadDocument(formData: FormData) {
  const { user } = await requireRole(["administrator", "committee"]);
  const file = formData.get("file");
  const category = z.enum(["minute", "publication", "insurance-policy", "club-rule", "calendar", "boiler-guide", "others"]).safeParse(formData.get("category"));
  const name = text(2, 180).safeParse(formData.get("name"));
  if (!(file instanceof File) || file.size === 0 || file.size > 12 * 1024 * 1024 || file.type !== "application/pdf" || !category.success || !name.success) {
    redirect("/dashboard/resources?error=Choose+a+PDF+smaller+than+12MB+and+enter+a+name.");
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
  const path = `${category.data}/${Date.now()}-${safeName}`;
  const admin = createAdminClient();
  const { error: storageError } = await admin.storage.from("documents").upload(path, file, { contentType: "application/pdf", upsert: false });
  if (storageError) redirect(`/dashboard/resources?error=${encodeURIComponent(storageError.message)}`);
  const { error } = await admin.from("documents").insert({ name: name.data, descriptions: String(formData.get("descriptions") || "").slice(0, 5000), category: category.data, file_url: `documents/${path}`, created_by: user.id });
  if (error) { await admin.storage.from("documents").remove([path]); redirect(`/dashboard/resources?error=${encodeURIComponent(error.message)}`); }
  revalidatePath("/dashboard", "layout");
}

export async function deleteDocument(formData: FormData) {
  await requireRole(["administrator", "committee"]);
  const id = z.string().uuid().parse(formData.get("id"));
  const { error } = await createAdminClient().from("documents").delete().eq("id", id);
  if (error) redirect(`/dashboard/resources?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard", "layout");
}

export async function saveCommittee(formData: FormData) {
  const { user } = await requireRole(["administrator"]);
  const parsed = z.object({ id: z.coerce.number().int().positive().optional(), name: z.string().trim().max(180), title: text(2, 180), email: z.string().email().max(254), file_url: z.string().trim().max(2048) }).safeParse({ ...Object.fromEntries(formData), id: formData.get("id") || undefined });
  if (!parsed.success) redirect("/settings?error=Please+check+the+committee+details.");
  const { id, ...values } = parsed.data;
  const admin = createAdminClient();
  const image = formData.get("image");
  if (image instanceof File && image.size > 0) {
    const accepted = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (image.size > 8 * 1024 * 1024 || !accepted.includes(image.type)) redirect("/settings?error=Use+a+JPG,+PNG,+WebP+or+AVIF+image+smaller+than+8MB.");
    const safeName = image.name.replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase();
    const path = `committees/${Date.now()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("images").upload(path, image, { contentType: image.type, upsert: false });
    if (uploadError) redirect(`/settings?error=${encodeURIComponent(uploadError.message)}`);
    values.file_url = `images/${path}`;
  }
  const query = id ? admin.from("committees").update(values).eq("id", id) : admin.from("committees").insert({ ...values, created_by: user.id });
  const { error } = await query;
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/committees"); revalidatePath("/settings");
}

export async function deleteCommittee(formData: FormData) {
  await requireRole(["administrator"]);
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  await createAdminClient().from("committees").delete().eq("id", id);
  revalidatePath("/committees"); revalidatePath("/settings");
}

export async function updateProfile(formData: FormData) {
  const { user } = await requireUser();
  const parsed = z.object({ full_name: text(2, 180), title: z.string().trim().max(30), contact_number: z.string().trim().max(40) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/account?error=Please+check+your+profile+details.");
  const { error } = await createAdminClient().from("users").update(parsed.data).eq("id", user.id);
  if (error) redirect(`/account?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/account"); revalidatePath("/dashboard", "layout");
  redirect("/account?notice=profile-updated");
}

export async function updateMemberRole(formData: FormData) {
  const { user } = await requireRole(["administrator"]);
  const userId = idString.parse(formData.get("user_id"));
  if (userId === user.id) redirect("/admin/members?error=You+cannot+change+your+own+role.");
  const role = z.enum(["administrator", "committee", "read-only-committee", "member"]).parse(formData.get("role"));
  const { error } = await createAdminClient().from("user_roles").update({ role }).eq("user_id", userId);
  if (error) redirect(`/admin/members?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/members");
}

export async function inviteMember(formData: FormData) {
  await requireRole(["administrator"]);
  const email = z.string().trim().email().max(254).safeParse(formData.get("email"));
  const fullName = text(2, 180).safeParse(formData.get("full_name"));
  if (!email.success || !fullName.success) redirect("/admin/members?error=Enter+a+valid+name+and+email.");
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010";
  const { error } = await createAdminClient().auth.admin.inviteUserByEmail(email.data, { data: { full_name: fullName.data }, redirectTo: `${origin}/auth/callback?next=/reset-password` });
  if (error) redirect(`/admin/members?error=${encodeURIComponent(error.message)}`);
  redirect("/admin/members?notice=invitation-sent");
}

export async function deleteMember(formData: FormData) {
  const { user } = await requireRole(["administrator"]);
  const userId = idString.parse(formData.get("user_id"));
  if (userId === user.id) redirect("/admin/members?error=You+cannot+delete+your+own+account.");
  const { error } = await createAdminClient().auth.admin.deleteUser(userId);
  if (error) redirect(`/admin/members?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/members");
}

export async function saveSiteConfig(formData: FormData) {
  await requireRole(["administrator"]);
  const parsed = z.object({
    id: z.coerce.number().int().positive(), short_name: text(2, 30), full_name: text(2, 240),
    registered_name: text(2, 240), company_no: text(1, 50), website: z.string().url().max(2048), telephone: z.string().trim().max(50),
    address_line_one: text(1, 180), address_line_two: z.string().trim().max(180), city: text(1, 100), postcode: text(1, 20), country: text(1, 100),
  }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/settings?error=Please+check+the+Society+details.");
  const socialNames = formData.getAll("social_name").map(String);
  const socialLinks = formData.getAll("social_link").map(String);
  const affiliateNames = formData.getAll("affiliate_name").map(String);
  const affiliateLinks = formData.getAll("affiliate_website").map(String);
  const affiliateLogos = formData.getAll("affiliate_logo").map(String);
  const socials = z.array(z.object({ name: text(1, 60), link: optionalUrl })).safeParse(socialNames.map((name, index) => ({ name, link: socialLinks[index] || "" })));
  const affiliates = z.array(z.object({ name: text(1, 120), website: optionalUrl, logo: z.string().max(2048) })).safeParse(affiliateNames.map((name, index) => ({ name, website: affiliateLinks[index] || "", logo: affiliateLogos[index] || "" })));
  if (!socials.success || !affiliates.success) redirect("/settings?error=Social+or+affiliate+links+are+invalid.");
  const { id, address_line_one, address_line_two, city, postcode, country, ...values } = parsed.data;
  const { error } = await createAdminClient().from("configs").update({
    ...values,
    registered_address: { address_line_one, address_line_two, city, postcode, country },
    socials: socials.data,
    affiliates: affiliates.data,
  }).eq("id", id);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/settings");
  redirect("/settings?notice=config-saved");
}

export async function saveDonationSettings(formData: FormData) {
  await requireRole(["administrator"]);
  const parsed = z.object({
    id: z.coerce.number().int().positive(),
    generic_title: text(2, 120),
    generic_description: text(2, 500),
    generic_button_label: text(2, 40),
    target_title: text(2, 120),
    target_description: text(2, 500),
    target_button_label: text(2, 40),
    target_pounds: z.coerce.number().min(1).max(10_000_000),
  }).safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    redirect("/settings?error=Please+check+the+donation+content+and+campaign+amounts.");
  }

  const genericEnabled = bool(formData, "generic_enabled");
  const targetEnabled = bool(formData, "target_enabled");
  if ((genericEnabled || targetEnabled) && !process.env.STRIPE_SECRET_KEY) {
    redirect("/settings?error=Add+the+Stripe+secret+key+before+enabling+donations.");
  }

  const admin = createAdminClient();
  const { data: config, error: readError } = await admin
    .from("configs")
    .select("settings")
    .eq("id", parsed.data.id)
    .single();
  if (readError) redirect(`/settings?error=${encodeURIComponent(readError.message)}`);

  const currentSettings = config.settings && typeof config.settings === "object" && !Array.isArray(config.settings)
    ? config.settings
    : {};
  const settings = {
    ...currentSettings,
    donations: {
      generic: {
        enabled: genericEnabled,
        title: parsed.data.generic_title,
        description: parsed.data.generic_description,
        buttonLabel: parsed.data.generic_button_label,
      },
      target: {
        enabled: targetEnabled,
        title: parsed.data.target_title,
        description: parsed.data.target_description,
        buttonLabel: parsed.data.target_button_label,
        targetPence: Math.round(parsed.data.target_pounds * 100),
      },
    },
  };

  const { error } = await admin.from("configs").update({ settings }).eq("id", parsed.data.id);
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");
  revalidatePath("/visitors");
  revalidatePath("/settings");
  redirect("/settings?notice=donations-saved");
}

function parseCsv(file: File) {
  return file.text().then(source => {
    const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(value => value.trim().toLowerCase());
    const emailIndex = headers.indexOf("email");
    const nameIndex = headers.findIndex(value => value === "full_name" || value === "name");
    if (emailIndex < 0 || nameIndex < 0) return [];
    return lines.slice(1).map(line => {
      const values = line.split(",").map(value => value.trim().replace(/^"|"$/g, ""));
      return { email: values[emailIndex], full_name: values[nameIndex] };
    });
  });
}

export async function bulkInviteMembers(formData: FormData) {
  await requireRole(["administrator"]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 1024 * 1024) redirect("/administrator/add-members?error=Choose+a+CSV+file+smaller+than+1MB.");
  const rows = await parseCsv(file);
  const valid = rows.map(row => z.object({ email: z.string().email().max(254), full_name: text(2, 180) }).safeParse(row)).filter(result => result.success).map(result => result.data);
  if (!valid.length || valid.length > 250) redirect("/administrator/add-members?error=The+CSV+needs+email+and+full_name+columns+with+up+to+250+valid+rows.");
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3010";
  const admin = createAdminClient();
  const failures: string[] = [];
  for (const member of valid) {
    const { error } = await admin.auth.admin.inviteUserByEmail(member.email, { data: { full_name: member.full_name }, redirectTo: `${origin}/auth/callback?next=/reset-password` });
    if (error) failures.push(member.email);
  }
  revalidatePath("/admin/members");
  if (failures.length) redirect(`/administrator/add-members?error=${encodeURIComponent(`${valid.length - failures.length} invited; ${failures.length} failed.`)}`);
  redirect(`/administrator/add-members?notice=${valid.length}-invitations-sent`);
}

export async function bulkDeleteMembers(formData: FormData) {
  const { user } = await requireRole(["administrator"]);
  if (formData.get("confirmation") !== "DELETE MEMBERS") redirect("/administrator/delete-members?error=Type+DELETE+MEMBERS+to+confirm.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 1024 * 1024) redirect("/administrator/delete-members?error=Choose+a+CSV+file+smaller+than+1MB.");
  const rows = await parseCsv(file);
  const emails = rows.map(row => z.string().email().safeParse(row.email)).filter(result => result.success).map(result => result.data);
  if (!emails.length || emails.length > 250) redirect("/administrator/delete-members?error=The+CSV+needs+email+and+full_name+columns+with+up+to+250+valid+rows.");
  const admin = createAdminClient();
  const { data: members } = await admin.from("users").select("id,email").in("email", emails);
  const targets = (members ?? []).filter(member => member.id !== user.id);
  let deleted = 0;
  for (const member of targets) {
    const { error } = await admin.auth.admin.deleteUser(member.id);
    if (!error) deleted += 1;
  }
  revalidatePath("/admin/members");
  redirect(`/administrator/delete-members?notice=${deleted}-members-deleted`);
}
