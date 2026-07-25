"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Sites" },
  { href: "/new", label: "New Site" },
  { href: "/plan", label: "Plan" },
  { href: "/profile", label: "Profile" },
];

export function PortalNav() {
  const path = usePathname() || "/";

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-background">
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8.5 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Cloud className="size-5" />
          </span>
          <span>
            <span className="block text-[0.62rem] font-bold uppercase tracking-[0.12em] text-primary">
              ZatGo Space
            </span>
            <span className="text-base font-extrabold text-foreground">Customer Portal</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                isActive(link.href)
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
