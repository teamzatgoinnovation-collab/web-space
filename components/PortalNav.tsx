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
      {/* ── Fixed navbar ── */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "var(--sp-nav-h)",
          zIndex: 50,
          background: "#0a0d14",
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
                borderRadius: 8,
                background: "var(--sp-accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
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
                  fontSize: "0.62rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "var(--sp-accent)",
                  lineHeight: 1,
                }}
              >
                ZatGo Space
              </span>
              <span style={{ fontSize: "1rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.01em" }}>
                Customer Portal
              </span>
            </span>
          </Link>

          {/* Desktop nav tabs */}
          <nav className="hidden items-center gap-1 lg:flex" style={{ overflowX: "auto" }}>
            {LINKS.map((link) => {
              const active = isActive(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "var(--sp-radius-sm)",
                    fontSize: "0.82rem",
                    fontWeight: active ? 600 : 500,
                    color: active ? "#ffffff" : "var(--sp-muted)",
                    background: active ? "var(--sp-surface2)" : "transparent",
                    border: active ? "1px solid var(--sp-border)" : "1px solid transparent",
                    transition: "all .15s ease",
                    whiteSpace: "nowrap",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* Right side CTA + mobile hamburger */}
          <div className="flex items-center gap-3">
            <a
              href="https://space.zatgo.online"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5"
              style={{
                padding: "6px 12px",
                borderRadius: "var(--sp-radius-sm)",
                fontSize: "0.78rem",
                fontWeight: 600,
                color: "var(--sp-text)",
                background: "var(--sp-surface2)",
                border: "1px solid var(--sp-border)",
              }}
            >
              Open Admin
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            </a>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white"
              style={{ background: "var(--sp-surface2)", border: "1px solid var(--sp-border)" }}
              aria-label="Toggle menu"
            >
              {open ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
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
            bottom: 0,
            zIndex: 40,
            background: "#0a0d14",
            padding: "20px 16px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
          className="lg:hidden"
        >
          {LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                style={{
                  padding: "12px 16px",
                  borderRadius: "var(--sp-radius-sm)",
                  fontSize: "0.9rem",
                  fontWeight: active ? 600 : 500,
                  color: active ? "#ffffff" : "var(--sp-muted)",
                  background: active ? "var(--sp-surface2)" : "transparent",
                  border: active ? "1px solid var(--sp-border)" : "1px solid transparent",
                }}
              >
                {link.label}
              </Link>
            );
          })}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--sp-border)" }}>
            <a
              href="https://space.zatgo.online"
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                padding: "12px",
                borderRadius: "var(--sp-radius-sm)",
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "var(--sp-text)",
                background: "var(--sp-surface2)",
                border: "1px solid var(--sp-border)",
              }}
            >
              Open Admin Desk
            </a>
          </div>
        </div>
      )}
    </>
  );
}
