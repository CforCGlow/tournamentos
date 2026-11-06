"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";

export function PrintButton() {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/20 px-2.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-emerald-950 transition-colors hover:bg-emerald-400"
      >
        <Printer className="h-3.5 w-3.5" /> Print sheet
      </button>
    </div>
  );
}
