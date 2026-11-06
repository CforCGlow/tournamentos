import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { VerifyEmailForm } from "@/components/auth/verify-email";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const email = (params.email ?? "").trim().toLowerCase();
  const next = params.next ? safeNextPath(params.next, "") : undefined;

  return (
    <AuthShell
      title="Verify your email"
      subtitle="One quick step keeps every entry, payment and squad tied to a real address."
      footer={
        <>
          Wrong address?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Start again
          </Link>
        </>
      }
    >
      <VerifyEmailForm email={email} next={next} />
    </AuthShell>
  );
}
