import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/providers";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "LigaPro — Football tournament operations",
    template: "%s · LigaPro",
  },
  description:
    "Run a football tournament end to end: online team entry, group draws and fixtures, pitch-side refereeing, and a public site with live scores, tables and brackets.",
  keywords: [
    "football tournament software",
    "league management",
    "fixture generator",
    "referee app",
    "live football scores",
  ],
  openGraph: {
    title: "LigaPro — Football tournament operations",
    description:
      "Run registration, draws, fixtures, live scoring and public fan pages from one platform.",
    type: "website",
    url: siteUrl,
  },
};

export const viewport: Viewport = {
  themeColor: "#10B981",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("ligapro-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}var d=t==="dark";document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-dvh font-sans">
        <QueryProvider>{children}</QueryProvider>
        <Toaster richColors position="top-center" closeButton />
      </body>
    </html>
  );
}
