"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cloud, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeLifecycle, type Lifecycle } from "@/lib/lifecycle";

const LINKS = [
  { href: "/", label: "Sites" },
  { href: "/new", label: "New Site" },
  { href: "/plan", label: "Plan" },
  { href: "/profile", label: "Profile" },
];

const PILL_TONE: Record<string, string> = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-700",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  danger: "border-red-500/40 bg-red-500/10 text-red-700",
};

/** Trial / subscription pill: the site closest to needing attention. */
function SubscriptionPill() {
  const [pill, setPill] = useState<{ text: string; tone: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/sites", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!alive || !j?.ok) return;
        const now = Date.now();
        const items = ((j.sites || []) as Array<{ lifecycle?: Lifecycle | null }>)
          .map((s) => ({ lc: s.lifecycle ?? null, d: describeLifecycle(s.lifecycle ?? null, now) }))
          .filter((x) => x.lc && x.d);
        if (!items.length) return;
        const rank = { danger: 0, warning: 1, info: 2, success: 3 } as const;
        items.sort((a, b) => rank[a.d!.tone] - rank[b.d!.tone] || (a.lc!.remaining_days ?? 999) - (b.lc!.remaining_days ?? 999));
        const { lc, d } = items[0];
        const text = lc!.lifecycle_status === "TRIAL" && lc!.remaining_days !== null
          ? `Free trial · ${lc!.remaining_days} day${lc!.remaining_days === 1 ? "" : "s"} left`
          : d!.label;
        setPill({ text, tone: d!.tone });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!pill) return null;
  return (
    <Link href="/plan" className={cn("whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold", PILL_TONE[pill.tone])}>
      {pill.text}
    </Link>
  );
}

export function PortalNav() {
  const path = usePathname() || "/";
  const router = useRouter();
  const isAuthPage = path.startsWith("/login") || path.startsWith("/signup");
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");

  async function logout() {
    setMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-border bg-background">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
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
          <>
            <nav className="hidden items-center gap-1 sm:flex">
              <SubscriptionPill />
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

            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="flex size-9 items-center justify-center rounded-lg text-foreground sm:hidden"
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </>
        )}
      </div>

      {!isAuthPage && menuOpen && (
        <nav className="flex flex-col gap-0.5 border-t border-border bg-background px-4 py-2 sm:hidden">
          <div className="px-3 py-1.5"><SubscriptionPill /></div>
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
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
            className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </nav>
      )}
    </header>
  );
}
