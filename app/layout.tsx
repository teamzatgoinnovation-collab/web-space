import type { Metadata } from "next";
import "./globals.css";
import { PortalNav } from "@/components/PortalNav";

export const metadata: Metadata = {
  title: "ZatGo Space",
  description: "Manage your ERPNext sites on zatgo.online",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-8 sm:px-6">
          <PortalNav />
          {children}
        </div>
      </body>
    </html>
  );
}
