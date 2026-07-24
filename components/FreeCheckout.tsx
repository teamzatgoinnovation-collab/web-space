"use client";

import { useEffect, useMemo, useState } from "react";

export type CheckoutSuccess = {
  sessionId: string;
  plan: string;
  planTitle: string;
  cardLast4?: string;
  cardBrand?: string;
  email?: string;
};

type Props = {
  plan: string;
  planTitle: string;
  listPriceCents: number;
  purpose: "provision" | "upgrade";
  hostname?: string;
  onSuccess: (result: CheckoutSuccess) => void;
  onCancel?: () => void;
};

function formatUsd(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

function formatCardInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export function FreeCheckout({
  plan,
  planTitle,
  listPriceCents,
  purpose,
  hostname,
  onSuccess,
  onCancel,
}: Props) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSessionId(null);
    setBootError(null);
    setError(null);
    void (async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, purpose, hostname }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Could not start checkout");
        if (!cancelled) setSessionId(data.session.id as string);
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : "Checkout failed to start");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, purpose, hostname]);

  const expParts = useMemo(() => {
    const cleaned = exp.replace(/\D/g, "").slice(0, 4);
    return {
      month: cleaned.slice(0, 2),
      year: cleaned.slice(2, 4),
    };
  }, [exp]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          email,
          name,
          cardNumber: card,
          expMonth: expParts.month,
          expYear: expParts.year,
          cvc,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Payment failed");
      onSuccess({
        sessionId: data.session.id,
        plan: data.session.plan,
        planTitle: data.session.planTitle,
        cardLast4: data.session.cardLast4,
        cardBrand: data.session.cardBrand,
        email: data.session.customerEmail,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--space-ink)]/10 bg-white shadow-sm">
      <div className="border-b border-[var(--space-ink)]/8 bg-[var(--space-ink)]/[0.03] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--space-ink)]/45">
              Secure checkout
            </p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--space-ink)]">
              Subscribe to {planTitle}
            </h3>
          </div>
          <div className="text-right">
            {listPriceCents > 0 ? (
              <>
                <p className="text-sm text-[var(--space-ink)]/40 line-through">
                  {formatUsd(listPriceCents)}/mo
                </p>
                <p className="text-base font-semibold tabular-nums text-[var(--space-accent)]">
                  $0.00 due today
                </p>
              </>
            ) : (
              <p className="text-base font-semibold tabular-nums text-[var(--space-accent)]">
                Free
              </p>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-[var(--space-ink)]/55">
          Space billing is free. Card details authorize your subscription — you will not be charged.
        </p>
      </div>

      <form onSubmit={pay} className="space-y-3 px-5 py-4">
        {bootError && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{bootError}</p>
        )}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
        )}

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--space-ink)]/70">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2.5 outline-none focus:border-[var(--space-accent)]"
            placeholder="you@company.com"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--space-ink)]/70">Name on card</span>
          <input
            type="text"
            required
            autoComplete="cc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2.5 outline-none focus:border-[var(--space-accent)]"
            placeholder="Jane Doe"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-[var(--space-ink)]/70">Card number</span>
          <input
            type="text"
            required
            inputMode="numeric"
            autoComplete="cc-number"
            value={card}
            onChange={(e) => setCard(formatCardInput(e.target.value))}
            className="w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2.5 font-mono outline-none focus:border-[var(--space-accent)]"
            placeholder="4242 4242 4242 4242"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--space-ink)]/70">Expiry</span>
            <input
              type="text"
              required
              inputMode="numeric"
              autoComplete="cc-exp"
              value={exp}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
              }}
              className="w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2.5 font-mono outline-none focus:border-[var(--space-accent)]"
              placeholder="MM/YY"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-[var(--space-ink)]/70">CVC</span>
            <input
              type="password"
              required
              inputMode="numeric"
              autoComplete="cc-csc"
              value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="w-full rounded-xl border border-[var(--space-ink)]/15 bg-white px-3 py-2.5 font-mono outline-none focus:border-[var(--space-accent)]"
              placeholder="123"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={busy || !sessionId || !!bootError}
          className="mt-2 w-full rounded-xl bg-[var(--space-accent)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Processing…" : `Pay $0.00 — subscribe to ${planTitle}`}
        </button>

        {onCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="w-full rounded-xl border border-[var(--space-ink)]/10 px-4 py-2 text-sm text-[var(--space-ink)]/60"
          >
            Cancel
          </button>
        )}

        <p className="pt-1 text-center text-[10px] uppercase tracking-wide text-[var(--space-ink)]/35">
          Stripe-compatible · Free Space billing · Test card 4242…
        </p>
      </form>
    </div>
  );
}
