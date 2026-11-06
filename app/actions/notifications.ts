"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/auth";
import { markAllNotificationsRead } from "@/lib/notifications";
import { redirectWithFlash, text } from "@/lib/actions";

export async function markNotificationsReadAction(formData: FormData): Promise<void> {
  const slug = text(formData, "tenant_slug");
  const ctx = await requireTenant(slug);

  await markAllNotificationsRead(ctx.tenant.id);

  revalidatePath(`/dashboard/${slug}`);
  redirectWithFlash(`/dashboard/${slug}`, "Notifications marked as read.");
}
