import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/utils";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next ? safeNextPath(params.next, "") : undefined;

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your organiser, manager or referee workspace."
      footer={
        <>
          New to LigaPro?{" "}
          <Link href="/register" className="font-semibold text-primary hover:underline">
            Create a free account
          </Link>
        </>
      }
    >
      <LoginForm next={next} initialError={params.error} />
    </AuthShell>
  );
}
