"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoyasarCheckout, type CheckoutSuccess } from "@/components/MoyasarCheckout";
import { currencyForLocale, formatMoney } from "@/lib/payments/pricing";
import type { Currency, ProviderId } from "@/lib/payments/types";

export type { CheckoutSuccess };

type Option = {
  currency: Currency;
  priceCents: number;
  providers: { id: ProviderId; label: string; methods: string[] }[];
};

type Props = {
  plan: string;
  planTitle: string;
  purpose: "provision" | "upgrade" | "activate";
  hostname?: string;
  onSuccess: (result: CheckoutSuccess) => void;
  onCancel?: () => void;
};

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void };
  }
}

let rzpScript: Promise<void> | null = null;
function loadRazorpay(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) return Promise.resolve();
  if (rzpScript) return rzpScript;
  rzpScript = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      rzpScript = null;
      reject(new Error("Could not load Razorpay. Check your connection."));
    };
    document.head.appendChild(s);
  });
  return rzpScript;
}

function RazorpayLauncher({
  plan,
  planTitle,
  purpose,
  hostname,
  onSuccess,
  onError,
}: Props & { onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    setBusy(true);
    onError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, purpose, hostname, provider: "razorpay", currency: "INR" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Could not start checkout");
      await loadRazorpay();
      const c = data.session.client as { orderId: string; keyId: string; amount: number; currency: string; name: string };
      const rz = new window.Razorpay!({
        key: c.keyId,
        order_id: c.orderId,
        amount: c.amount,
        currency: c.currency,
        name: c.name,
        description: `${planTitle} plan`,
        theme: { color: "#4f46e5" },
        handler: (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          onSuccess({
            sessionId: `razorpay:${r.razorpay_payment_id}.${r.razorpay_order_id}.${r.razorpay_signature}`,
            plan,
            planTitle,
            currency: "INR",
          });
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on("payment.failed", () => {
        onError("Payment failed. Try another method.");
        setBusy(false);
      });
      rz.open();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Checkout failed to start");
      setBusy(false);
    }
  };

  return (
    <Button type="button" onClick={pay} disabled={busy} className="w-full">
      {busy ? "Waiting for payment…" : "Pay with UPI, card or netbanking"}
    </Button>
  );
}

export function CheckoutPanel(props: Props) {
  const { plan, planTitle, onCancel, onSuccess } = props;
  const [options, setOptions] = useState<Option[] | null>(null);
  const [period, setPeriod] = useState<"Monthly" | "Yearly">("Monthly");
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [provider, setProvider] = useState<ProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const freeDone = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/billing/options?plan=${encodeURIComponent(plan)}${
            props.purpose === "activate" && props.hostname ? `&site=${encodeURIComponent(props.hostname)}` : ""
          }`,
        );
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Could not load payment options");
        if (cancelled) return;
        const opts = data.currencies as Option[];
        setPeriod(data.period === "Yearly" ? "Yearly" : "Monthly");
        setOptions(opts);
        const preferred = currencyForLocale(navigator.language);
        const first = opts.find((o) => o.currency === preferred) || opts[0];
        if (first) {
          setCurrency(first.currency);
          setProvider(first.providers[0]?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load payment options");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan]);

  // A plan priced at 0 needs no gateway: ask the server for the free session and move on.
  const current = options?.find((o) => o.currency === currency);
  const isFree = Boolean(current && current.priceCents === 0);
  useEffect(() => {
    if (!isFree || freeDone.current) return;
    freeDone.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, purpose: props.purpose, hostname: props.hostname, currency }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Could not start checkout");
        onSuccess({ sessionId: data.session.id, plan, planTitle: data.session.planTitle, currency: data.session.currency });
      } catch (err) {
        freeDone.current = false;
        setError(err instanceof Error ? err.message : "Could not start checkout");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFree]);

  const providers = current?.providers ?? [];

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="border-b border-border bg-secondary/40 !py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Secure checkout</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Subscribe to {planTitle}</h3>
          </div>
          <p className="text-base font-semibold tabular-nums text-primary">
            {current ? (current.priceCents > 0 ? `${formatMoney(current.priceCents, current.currency)}${period === "Yearly" ? "/yr" : "/mo"}` : "Free") : ""}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 py-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!options && !error && <p className="text-sm text-muted-foreground">Loading payment options…</p>}
        {options && options.length === 0 && (
          <Alert>
            <AlertDescription>Payments are not available for this plan yet. Please try again later.</AlertDescription>
          </Alert>
        )}

        {isFree && !error && <p className="text-sm text-muted-foreground">Activating your plan…</p>}

        {options && options.length > 1 && !isFree && (
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Currency">
            {options.map((o) => (
              <Button
                key={o.currency}
                type="button"
                size="sm"
                variant={o.currency === currency ? "default" : "outline"}
                role="radio"
                aria-checked={o.currency === currency}
                onClick={() => {
                  setCurrency(o.currency);
                  setProvider(o.providers[0]?.id ?? null);
                }}
              >
                {o.currency}
              </Button>
            ))}
          </div>
        )}

        {current && !isFree && providers.length > 1 && (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Payment method">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={p.id === provider}
                onClick={() => setProvider(p.id)}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  p.id === provider ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/60"
                }`}
              >
                <span className="font-medium text-foreground">{p.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{p.methods.join(" · ")}</span>
              </button>
            ))}
          </div>
        )}

        {current && !isFree && provider === "moyasar" && (
          <MoyasarCheckout
            key="moyasar"
            plan={plan}
            planTitle={planTitle}
            listPriceCents={current.priceCents}
            purpose={props.purpose}
            hostname={props.hostname}
            onSuccess={onSuccess}
          />
        )}
        {current && !isFree && provider === "razorpay" && (
          <RazorpayLauncher {...props} onError={(m) => setError(m || null)} />
        )}

        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="w-full">
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
