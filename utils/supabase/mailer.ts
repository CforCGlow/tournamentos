import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Client used only to ask Supabase to send verification and recovery emails.
 *
 * The regular SSR client uses the PKCE flow. Its email links come back as a
 * one-time `?code=` that can only be redeemed by the exact browser that
 * requested it, because the matching verifier lives in that browser's cookie
 * jar. People routinely open their inbox on a phone after registering on a
 * laptop (or the mail app opens its own in-app browser), which made every such
 * link fail with "PKCE code verifier not found".
 *
 * Asking for the email with the implicit flow removes the browser-bound
 * verifier: the link carries the session in the URL fragment, and the confirm
 * screen exchanges it for cookies on whichever device opens it. No session is
 * persisted here — this client is only used to trigger the email.
 */
export function createEmailClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
