import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Organiser notifications are a small read/write JSON list per workspace. They
 * are written with the service role because managers must be able to raise a
 * review notification without holding tenant-admin permissions.
 */
export const NOTIFICATION_BUCKET = "site-content";

export type NotificationKind =
  | "TEAM_SUBMITTED"
  | "TEAM_UPDATED"
  | "TEAM_APPROVED"
  | "TEAM_REJECTED";

export type OrganiserNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  href: string;
  createdAt: string;
  read: boolean;
};

export function notificationsPath(tenantId: string): string {
  return `notifications/${tenantId}.json`;
}

const MAX_NOTIFICATIONS = 40;

function storageConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function normalise(raw: unknown): OrganiserNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const kinds: NotificationKind[] = [
    "TEAM_SUBMITTED",
    "TEAM_UPDATED",
    "TEAM_APPROVED",
    "TEAM_REJECTED",
  ];
  if (typeof value.id !== "string" || typeof value.title !== "string") return null;
  if (typeof value.createdAt !== "string") return null;

  return {
    id: value.id,
    kind: kinds.includes(value.kind as NotificationKind)
      ? (value.kind as NotificationKind)
      : "TEAM_UPDATED",
    title: value.title.slice(0, 120),
    body: typeof value.body === "string" ? value.body.slice(0, 240) : "",
    href: typeof value.href === "string" ? value.href.slice(0, 400) : "",
    createdAt: value.createdAt,
    read: value.read === true,
  };
}

export async function readNotifications(
  tenantId: string,
): Promise<OrganiserNotification[]> {
  if (!storageConfigured()) return [];

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(NOTIFICATION_BUCKET)
      .download(notificationsPath(tenantId));

    if (error || !data) return [];

    const parsed = JSON.parse(await data.text()) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(normalise)
      .filter((item): item is OrganiserNotification => Boolean(item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

async function writeNotifications(
  tenantId: string,
  notifications: OrganiserNotification[],
): Promise<void> {
  const admin = createAdminClient();
  const trimmed = notifications
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_NOTIFICATIONS);

  const { error } = await admin.storage
    .from(NOTIFICATION_BUCKET)
    .upload(
      notificationsPath(tenantId),
      JSON.stringify(trimmed, null, 2),
      { contentType: "application/json", cacheControl: "0", upsert: true },
    );

  if (error) throw new Error(error.message);
}

export async function addNotification(
  tenantId: string,
  input: Omit<OrganiserNotification, "id" | "createdAt" | "read">,
): Promise<void> {
  if (!storageConfigured()) return;

  try {
    const existing = await readNotifications(tenantId);
    // Collapse repeated edits for the same team so the bell does not fill with
    // one row per player change.
    const sameTeam = existing.find(
      (item) =>
        !item.read &&
        item.kind === input.kind &&
        item.href === input.href &&
        Date.now() - new Date(item.createdAt).getTime() < 10 * 60 * 1000,
    );

    if (sameTeam) {
      sameTeam.title = input.title;
      sameTeam.body = input.body;
      sameTeam.createdAt = new Date().toISOString();
      await writeNotifications(tenantId, existing);
      return;
    }

    await writeNotifications(tenantId, [
      {
        ...input,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...existing,
    ]);
  } catch {
    // A notification failure must never roll back the manager's edit.
  }
}

export async function markAllNotificationsRead(tenantId: string): Promise<void> {
  if (!storageConfigured()) return;
  const existing = await readNotifications(tenantId);
  if (!existing.some((item) => !item.read)) return;
  await writeNotifications(
    tenantId,
    existing.map((item) => ({ ...item, read: true })),
  );
}

export async function unreadNotificationCount(tenantId: string): Promise<number> {
  const list = await readNotifications(tenantId);
  return list.filter((item) => !item.read).length;
}
