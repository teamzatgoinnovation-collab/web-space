import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PortalNav } from "@/components/PortalNav";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "ZatGo Space — Customer Portal",
  description: "Manage your ERP sites on ZatGo Space. 1 month free, then a simple monthly subscription.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <PortalNav />
        <main className="mx-auto max-w-5xl px-4 pt-24 pb-8 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
