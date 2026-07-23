import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZatGo Space",
  description: "Create your ERPNext site on zatgo.online",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
