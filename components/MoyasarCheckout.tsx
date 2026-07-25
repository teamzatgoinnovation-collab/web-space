"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Verify this version against your Moyasar dashboard/docs before going
// live — could not fully confirm it from an automated docs fetch.
const MOYASAR_FORM_VERSION = "1.7.3";
const MOYASAR_JS = `https://cdn.moyasar.com/mpf/${MOYASAR_FORM_VERSION}/moyasar.js`;
const MOYASAR_CSS = `https://cdn.moyasar.com/mpf/${MOYASAR_FORM_VERSION}/moyasar.css`;

declare global {
  interface Window {
    Moyasar?: {
      init: (opts: {
        element: string;
        amount: number;
        currency: string;
        description: string;
        publishable_api_key: string;
        callback_url: string;
        supported_networks?: string[];
        methods?: string[];
        on_completed?: (payment: { id: string; status: string }) => void | Promise<void>;
      }) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadMoyasarScript(): Promise<void> {
  if (typeof window !== "undefined" && window.Moyasar) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MOYASAR_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MOYASAR_CSS;
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = MOYASAR_JS;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment form. Check your connection."));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export type CheckoutSuccess = {
  sessionId: string;
  plan: string;
  planTitle: string;
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

function formatSar(cents: number): string {
  return `${(Math.max(0, cents) / 100).toFixed(2)} SAR`;
}

export function MoyasarCheckout({ plan, planTitle, listPriceCents, purpose, hostname, onSuccess, onCancel }: Props) {
  const elementId = useRef(`mysr-${Math.random().toString(36).slice(2)}`);
  const [bootError, setBootError] = useState<string | null>(null);
  const [skippedFree, setSkippedFree] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Returning from a redirect-based payment method (Moyasar appends ?id=).
    const returnedId = new URLSearchParams(window.location.search).get("id");
    if (returnedId) {
      onSuccess({ sessionId: returnedId, plan, planTitle });
      return;
    }

    void (async () => {
      try {
        const res = await fetch("/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, purpose, hostname }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Could not start checkout");
        if (cancelled) return;

        if (data.session.status === "complete") {
          setSkippedFree(true);
          onSuccess({ sessionId: data.session.id, plan, planTitle: data.session.planTitle });
          return;
        }

        await loadMoyasarScript();
        if (cancelled) return;

        window.Moyasar?.init({
          element: `#${elementId.current}`,
          amount: data.session.form.amount,
          currency: data.session.form.currency,
          description: data.session.form.description,
          publishable_api_key: data.session.form.publishableKey,
          callback_url: window.location.href,
          supported_networks: ["visa", "mastercard", "mada"],
          methods: ["creditcard"],
          on_completed: async (payment) => {
            if (payment.status === "paid") {
              onSuccess({ sessionId: payment.id, plan, planTitle });
            } else {
              setBootError("Payment was not completed.");
            }
          },
        });
        setReady(true);
      } catch (err) {
        if (!cancelled) setBootError(err instanceof Error ? err.message : "Checkout failed to start");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, purpose, hostname]);

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="border-b border-border bg-secondary/40 !py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Secure checkout</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Subscribe to {planTitle}</h3>
          </div>
          <p className="text-base font-semibold tabular-nums text-primary">
            {listPriceCents > 0 ? `${formatSar(listPriceCents)}/mo` : "Free"}
          </p>
        </div>
      </CardHeader>
      <CardContent className="py-4">
        {bootError && (
          <Alert variant="destructive">
            <AlertDescription>{bootError}</AlertDescription>
          </Alert>
        )}
        {!bootError && skippedFree && <p className="text-sm text-muted-foreground">Activating your plan…</p>}
        {!bootError && !skippedFree && (
          <>
            {!ready && <p className="mb-3 text-sm text-muted-foreground">Loading payment form…</p>}
            <div id={elementId.current} className="mysr-form" />
          </>
        )}
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} className="mt-4 w-full">
            Cancel
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
