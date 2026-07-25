"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

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
    <Card className="overflow-hidden py-0">
      <CardHeader className="border-b border-border bg-secondary/40 !py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Secure checkout</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Subscribe to {planTitle}</h3>
          </div>
          <div className="text-right">
            {listPriceCents > 0 ? (
              <>
                <p className="text-sm text-muted-foreground line-through">{formatUsd(listPriceCents)}/mo</p>
                <p className="text-base font-semibold tabular-nums text-primary">$0.00 due today</p>
              </>
            ) : (
              <p className="text-base font-semibold tabular-nums text-primary">Free</p>
            )}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Space billing is free. Card details authorize your subscription — you will not be charged.
        </p>
      </CardHeader>

      <CardContent className="py-4">
        <form onSubmit={pay} className="space-y-3">
          {bootError && (
            <Alert variant="destructive">
              <AlertDescription>{bootError}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Name on card</Label>
            <Input
              type="text"
              required
              autoComplete="cc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Card number</Label>
            <Input
              type="text"
              required
              inputMode="numeric"
              autoComplete="cc-number"
              value={card}
              onChange={(e) => setCard(formatCardInput(e.target.value))}
              className="font-mono"
              placeholder="4242 4242 4242 4242"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Expiry</Label>
              <Input
                type="text"
                required
                inputMode="numeric"
                autoComplete="cc-exp"
                value={exp}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 4);
                  setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                }}
                className="font-mono"
                placeholder="MM/YY"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>CVC</Label>
              <Input
                type="password"
                required
                inputMode="numeric"
                autoComplete="cc-csc"
                value={cvc}
                onChange={(e) => setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                className="font-mono"
                placeholder="123"
              />
            </div>
          </div>

          <Button type="submit" disabled={busy || !sessionId || !!bootError} className="mt-2 w-full">
            {busy ? "Processing…" : `Pay $0.00 — subscribe to ${planTitle}`}
          </Button>

          {onCancel && (
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel} className="w-full">
              Cancel
            </Button>
          )}

          <p className="pt-1 text-center text-[10px] tracking-wide text-muted-foreground uppercase">
            Stripe-compatible · Free Space billing · Test card 4242…
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
