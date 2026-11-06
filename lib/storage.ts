import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Private buckets (ID documents, payment proofs) are never exposed publicly.
 * Pages generate short-lived signed URLs server-side instead.
 */
export async function signedUrl(
  bucket: "id-documents" | "payment-proofs" | "logos" | "player-photos",
  path: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
