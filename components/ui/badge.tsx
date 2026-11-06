import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold leading-5 transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary-soft text-emerald-800",
        success: "border-emerald-200 bg-emerald-100 text-emerald-800",
        warning: "border-amber-200 bg-amber-100 text-amber-800",
        danger: "border-rose-200 bg-rose-100 text-rose-800",
        info: "border-sky-200 bg-sky-100 text-sky-800",
        neutral: "border-slate-200 bg-slate-100 text-slate-700",
        outline: "border-border bg-transparent text-foreground",
        live: "border-transparent bg-emerald-600 text-white",
        dark: "border-slate-700 bg-slate-900 text-slate-100",
        purple: "border-violet-200 bg-violet-100 text-violet-800",
        gold: "border-amber-300 bg-amber-50 text-amber-900",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
