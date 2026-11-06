import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/components/auth/register-form";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ? safeNextPath(params.next, "") : undefined;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Register to manage a tournament, enter a team, or officiate matches."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-primary hover:underline">
            Sign in
          </Link>
          <span className="mt-2 block text-[11px]">
            Player accounts are issued by their club manager. SuperAdmin access is
            provisioned by the platform owner.
          </span>
        </>
      }
    >
      <RegisterForm next={next} />
    </AuthShell>
  );
}
