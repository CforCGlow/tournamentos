import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

const PROTECTED_PREFIXES = ["/superadmin", "/dashboard", "/manager", "/referee", "/portal"];

function isProtected(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { supabase, response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!isProtected(pathname)) {
    return response;
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // The project mailer auto-confirms by default; accounts created through the
  // registration form are made unconfirmed on purpose so an address cannot be
  // used before its verification link is opened.
  if (!user.email_confirmed_at) {
    const url = request.nextUrl.clone();
    url.pathname = "/register/verify";
    url.search = "";
    if (user.email) url.searchParams.set("email", user.email);
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // Platform owners can open any tenant console ("view as organiser") without
  // being a member of that tenant, so resolve the global role once for both
  // guarded areas.
  let isSuperAdmin = false;
  if (pathname.startsWith("/superadmin") || pathname.startsWith("/dashboard/")) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("global_role")
      .eq("id", user.id)
      .maybeSingle();
    isSuperAdmin = profile?.global_role === "SUPER_ADMIN";
  }

  if (pathname.startsWith("/superadmin") && !isSuperAdmin) {
    return NextResponse.redirect(new URL("/portal", request.url));
  }

  if (pathname.startsWith("/dashboard/")) {
    const slug = pathname.split("/")[2];
    if (slug) {
      const { data: tenant } = await supabase
        .from("tenants")
        .select("id, status, valid_until")
        .eq("slug", slug)
        .maybeSingle();

      if (!tenant) {
        return NextResponse.redirect(new URL("/portal", request.url));
      }

      if (!isSuperAdmin) {
        const { data: membership } = await supabase
          .from("tenant_members")
          .select("role")
          .eq("tenant_id", tenant.id)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!membership || membership.role !== "TOURNAMENT_ADMIN") {
          return NextResponse.redirect(new URL("/portal", request.url));
        }
      }

      const expired =
        tenant.status === "suspended" ||
        (tenant.valid_until ? new Date(tenant.valid_until) < new Date() : false);

      if (expired && !isSuperAdmin && !pathname.endsWith("/billing")) {
        const url = request.nextUrl.clone();
        url.pathname = "/suspended";
        url.search = "";
        url.searchParams.set("tenant", slug);
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
