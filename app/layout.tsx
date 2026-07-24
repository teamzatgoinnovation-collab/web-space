import type { Metadata } from "next";
import "./globals.css";
import { PortalNav } from "@/components/PortalNav";

export const metadata: Metadata = {
  title: "ZatGo Space — Customer Portal",
  description: "Manage your ERPNext sites on ZatGo Space.",
  themeColor: "#090d14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <PortalNav />
        <main
          style={{ paddingTop: "var(--sp-nav-h)" }}
          className="mx-auto max-w-5xl px-4 py-8 sm:px-6"
        >
          {children}
        </main>
      </body>
    </html>
  );
}
