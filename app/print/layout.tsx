import type { Metadata } from "next";
import { PrintButton } from "@/components/print/print-button";

export const metadata: Metadata = {
  title: "Printable sheet",
  robots: { index: false, follow: false },
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 print:bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-slate-950 px-4 py-2.5 text-white sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
          LigaPro · official sheet
        </p>
        <PrintButton />
      </div>

      <div className="mx-auto w-full max-w-[860px] bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:p-0 print:shadow-none">
        {children}
      </div>
    </div>
  );
}
