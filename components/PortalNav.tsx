"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Sites" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/usage", label: "Usage" },
  { href: "/plan", label: "Plan" },
  { href: "/invoices", label: "Invoices" },
  { href: "/deployments", label: "Deployments" },
  { href: "/backups", label: "Backups" },
  { href: "/domains", label: "Domains" },
  { href: "/notifications", label: "Alerts" },
  { href: "/profile", label: "Profile" },
  { href: "/new", label: "New site" },
];

export function PortalNav() {
  const path = usePathname() || "/";
  return (
    <nav className="mb-8 border-b border-[var(--space-ink)]/10 pb-4">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-[var(--space-accent)]">ZatGo</p>
          <p className="text-lg font-semibold text-[var(--space-ink)]">Space Portal</p>
        </div>
        <a
          className="text-sm text-[var(--space-ink)]/60 hover:text-[var(--space-accent)]"
          href="https://space.zatgo.online"
          target="_blank"
          rel="noreferrer"
        >
          Cloud Manager
        </a>
      </div>
      <ul className="flex flex-wrap gap-2">
        {LINKS.map((l) => {
          const active = l.href === "/" ? path === "/" : path === l.href || path.startsWith(l.href + "/");
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                className={
                  active
                    ? "rounded-lg bg-[var(--space-accent)] px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-lg px-3 py-1.5 text-sm text-[var(--space-ink)]/70 hover:bg-white/70"
                }
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
