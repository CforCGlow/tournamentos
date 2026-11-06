"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";
import { safeNextPath } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function resolveNext(value: string | null, type: string | null): string {
  return safeNextPath(value, type === "recovery" ? "/reset-password" : "/portal");
}

/** Provider errors are rewritten into plain language people can act on. */
function friendlyError(raw: string | null, isRecovery: boolean): string {
  const message = (raw ?? "").replace(/\+/g, " ").trim();

  if (/pkce|code verifier|code exchange|different browser|different device/i.test(message)) {
    return "This link was opened somewhere other than the browser or device that asked for it. Request a fresh link and open it right here.";
  }

  if (/expired|invalid|not found|already|used/i.test(message)) {
    return isRecovery
      ? "This reset link has expired or has already been used. Request a fresh one and open it right away."
      : "This link has expired or has already been used. Request a fresh verification link and open it right away.";
  }

  return isRecovery
    ? "We could not open this reset link. Request a fresh one and try again."
    : "We could not verify this link. Request a fresh one and try again.";
}

/**
 * Landing point for every Supabase auth email (verification, recovery, invite).
 *
 * Links arrive in one of three shapes:
 *
 *   otp       ->  ?token_hash=...&type=signup      (query string)
 *   implicit  ->  #access_token=...&refresh_token=  (fragment, browser only)
 *   pkce      ->  ?code=...                         (query string)
 *
 * Everything is exchanged in the browser so the session cookies are written
 * before we land on the page that needs the session. Older PKCE links are still
 * accepted, but their failures are explained instead of shown as raw errors.
 */
function ConfirmLink() {
  const search = useSearchParams();
  const query = search.toString();
  const [error, setError] = useState<string | null>(null);

  const type = search.get("type");
  const isRecovery = type === "recovery";
  const email = (search.get("email") ?? "").trim().toLowerCase();
  const next = safeNextPath(search.get("next"), isRecovery ? "/reset-password" : "/portal");

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const finish = () => {
      if (!active) return;
      // Full navigation so the new cookies are visible to the server render.
      window.location.replace(resolveNext(search.get("next"), type));
    };

    const fail = (raw?: string | null) => {
      if (active) setError(friendlyError(raw ?? null, isRecovery));
    };

    void (async () => {
      const params = new URLSearchParams(query);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      // GoTrue may send failures in the query string, the fragment, or both.
      const urlError =
        params.get("error_description") ??
        params.get("error") ??
        hash.get("error_description") ??
        hash.get("error");
      if (urlError) {
        fail(urlError);
        return;
      }

      // Token-hash links (the recommended server-side shape) work on any
      // device because nothing is stored locally before the link is opened.
      const tokenHash = params.get("token_hash");
      const otpType = (params.get("type") as EmailOtpType | null) ?? "email";
      if (tokenHash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          type: otpType,
          token_hash: tokenHash,
        });
        if (!otpError) {
          finish();
          return;
        }
        fail(otpError.message);
        return;
      }

      // Implicit links carry the session in the fragment. Only this device
      // reads it, so there is no verifier to lose.
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!sessionError) {
          finish();
          return;
        }
        fail(sessionError.message);
        return;
      }

      // Legacy PKCE links: only redeemable in the browser that requested them.
      const code = params.get("code");
      if (code) {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!codeError) {
          finish();
          return;
        }
        fail(codeError.message);
        return;
      }

      // supabase-js may already have consumed the fragment when the client was
      // created; in that case a session simply exists.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        finish();
        return;
      }

      fail("This link has expired or has already been used.");
    })();

    return () => {
      active = false;
    };
  }, [query, type, isRecovery]);

  if (!error) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="font-display text-lg font-semibold">Checking your link…</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          You will be taken straight to the next step.
        </p>
      </div>
    );
  }

  const resendHref = email
    ? `/register/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`
    : "/register/verify";

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-600">
        <ShieldAlert className="h-5 w-5" />
      </span>
      <div className="space-y-1.5">
        <h1 className="font-display text-xl font-semibold">That link didn&apos;t work</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Links work once and expire for your security.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {isRecovery ? (
          <Button asChild>
            <Link href="/forgot-password">Send a new reset link</Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href={resendHref}>Resend verification email</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
      {isRecovery ? null : (
        <Link
          href="/forgot-password"
          className="text-xs font-semibold text-muted-foreground hover:text-foreground hover:underline"
        >
          Forgot your password instead?
        </Link>
      )}
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm">
        <Suspense
          fallback={
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="font-display text-lg font-semibold">Checking your link…</p>
            </div>
          }
        >
          <ConfirmLink />
        </Suspense>
      </div>
    </div>
  );
}
