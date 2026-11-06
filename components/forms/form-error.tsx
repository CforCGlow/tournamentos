import { AlertCircle } from "lucide-react";

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-2.5 rounded-lg border-2 border-rose-300 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-900 shadow-sm dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

export function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
      <AlertCircle className="h-3 w-3 shrink-0" />
      {messages[0]}
    </p>
  );
}
