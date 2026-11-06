import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "error";

const styles: Record<Tone, { wrap: string; icon: React.ReactNode }> = {
  info: {
    wrap: "border-sky-200 bg-sky-50 text-sky-900",
    icon: <Info className="h-4 w-4 text-sky-600" />,
  },
  success: {
    wrap: "border-emerald-200 bg-emerald-50 text-emerald-900",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  },
  warning: {
    wrap: "border-amber-200 bg-amber-50 text-amber-900",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  },
  error: {
    wrap: "border-2 border-rose-300 bg-rose-50 font-medium text-rose-900 shadow-sm dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100",
    icon: <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-300" />,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        styles[tone].wrap,
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">{styles[tone].icon}</span>
      <div className="min-w-0 space-y-0.5">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-[13px] leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}
