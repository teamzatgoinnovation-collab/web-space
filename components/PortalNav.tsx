"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cloud, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Sites" },
  { href: "/new", label: "New Site" },
  { href: "/plan", label: "Plan" },
  { href: "/profile", label: "Profile" },
];

export function PortalNav() {
  const path = usePathname() || "/";
  const router = useRouter();
  const isAuthPage = path.startsWith("/login") || path.startsWith("/signup");

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-border bg-background">
      <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href={isAuthPage ? "/login" : "/"} className="flex items-center gap-2.5">
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

        {!isAuthPage && (
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
            <button
              type="button"
              onClick={logout}
              className="ml-1 flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}
