import { createClient as createSupabase } from "@supabase/supabase-js";

/** Small helper so server components can compute storage public URLs. */
export function publicUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  return `${url}/storage/v1/object/public/${bucket}/${path}`;
}

/** Used only for typing brand-new Supabase clients in helpers. */
export type BareSupabase = ReturnType<typeof createSupabase>;
