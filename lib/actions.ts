import { redirect } from "next/navigation";

export type ActionState =
  | {
      ok: boolean;
      error?: string;
      message?: string;
      data?: Record<string, string>;
    }
  | null;

export function fail(error: string, data?: Record<string, string>): ActionState {
  return { ok: false, error, data };
}

export function succeed(message: string, data?: Record<string, string>): ActionState {
  return { ok: true, message, data };
}

export function explainDbError(error: unknown): string {
  if (!error) return "Something went wrong. Please try again.";

  const e = error as { message?: string; code?: string; details?: string | null };
  const message = e.message ?? "Something went wrong.";

  switch (e.code) {
    case "23505":
      return "That value already exists — check for a duplicate name, slug, short code, jersey number or email.";
    case "23503":
      return "That record is referenced by other data and cannot be changed right now.";
    case "23514":
      return "One of the values breaks a database rule (for example a score or squad limit).";
    case "42501":
      return "You do not have permission to do that. Sign in with the right role and try again.";
    case "42P01":
    case "42703":
      return "This part of LigaPro is not set up yet. Please contact support so we can finish the setup.";
    default:
      if (message.includes("row-level security")) {
        return "You do not have permission to change that record.";
      }
      return message;
  }
}

export function withFlash(
  path: string,
  key: "flash" | "error",
  message: string,
): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(message)}`;
}

export function redirectWithFlash(path: string, message: string): never {
  redirect(withFlash(path, "flash", message));
}

export function redirectWithError(path: string, message: string): never {
  redirect(withFlash(path, "error", message));
}

export function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function optionalText(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

export function bool(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}
