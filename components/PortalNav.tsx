"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Sites" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/usage", label: "Usage" },
  { href: "/plan", label: "Plan" },
  { href: "/invoices", label: "Invoices" },
  { href: "/deployments", label: "Deployments" },
  { href: "/backups", label: "Backups" },
  { href: "/domains", label: "Domains" },
  { href: "/notifications", label: "Alerts" },
  { href: "/profile", label: "Profile" },
];

function CloudIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function PortalNav() {
  const path = usePathname() || "/";
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path === href || path.startsWith(href + "/");

  return (
    <>
      {/* ── Fixed glass navbar ── */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "var(--sp-nav-h)",
          zIndex: 50,
          background: "rgba(9, 13, 20, 0.85)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid var(--sp-border)",
        }}
      >
        <div className="mx-auto flex h-full max-w-5xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2.5 select-none"
            style={{ color: "var(--sp-text)" }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: "linear-gradient(135deg, var(--sp-accent), var(--sp-accent2))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 18px rgba(124,92,252,.4)",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <CloudIcon />
            </span>
            <span>
              <span
                style={{
                  display: "block",
                  fontSize: "0.6rem",
                  fontWeight: 600,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--sp-muted)",
                  lineHeight: 1,
                }}
              >
                ZatGo
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "0.95rem",
                  fontWeight: 700,
                  background: "linear-gradient(90deg, var(--sp-accent), var(--sp-accent2))",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  lineHeight: 1.3,
                }}
              >
                Space Portal
              </span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: "0.82rem",
                  fontWeight: 500,
                  transition: "all .15s ease",
                  color: isActive(l.href) ? "#fff" : "var(--sp-muted)",
                  background: isActive(l.href)
                    ? "linear-gradient(135deg, var(--sp-accent), #6046d4)"
                    : "transparent",
                  boxShadow: isActive(l.href)
                    ? "0 2px 10px rgba(124,92,252,.35)"
                    : "none",
                }}
              >
                {l.label}
              </Link>
            ))}
            <a
              href="https://space.zatgo.online"
              target="_blank"
              rel="noreferrer"
              style={{
                marginLeft: 8,
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: "0.82rem",
                fontWeight: 500,
                color: "var(--sp-muted)",
                border: "1px solid var(--sp-border)",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Admin
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="flex items-center justify-center md:hidden"
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "var(--sp-surface2)",
              border: "1px solid var(--sp-border)",
              color: "var(--sp-text)",
              cursor: "pointer",
            }}
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ── */}
      {open && (
        <div
          style={{
            position: "fixed",
            top: "var(--sp-nav-h)",
            left: 0,
            right: 0,
            zIndex: 40,
            background: "rgba(9, 13, 20, 0.97)",
            borderBottom: "1px solid var(--sp-border)",
            backdropFilter: "blur(16px)",
            padding: "12px 16px 20px",
          }}
        >
          <nav className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                style={{
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  color: isActive(l.href) ? "#fff" : "var(--sp-muted)",
                  background: isActive(l.href)
                    ? "linear-gradient(135deg, var(--sp-accent), #6046d4)"
                    : "transparent",
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
