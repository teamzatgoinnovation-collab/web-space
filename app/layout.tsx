import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZatGo Space",
  description: "Manage your ERPNext sites on zatgo.online",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
