import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { priceCents } from "../lib/payments/pricing.ts";
import { moyasar } from "../lib/payments/moyasar.ts";
import { razorpay } from "../lib/payments/razorpay.ts";
import { activeProviders, availableCurrencies, splitSessionId, verifySession } from "../lib/payments/registry.ts";
import type { Deps, Expected } from "../lib/payments/types.ts";

const env: Record<string, string | undefined> = {
  MOYASAR_SECRET_KEY: "sk_test_x",
  NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY: "pk_test_x",
  RAZORPAY_KEY_ID: "rzp_test_x",
  RAZORPAY_KEY_SECRET: "rzp_secret",
};

/** A fake fetch answering by URL suffix with canned JSON bodies. */
function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    if (!key) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(routes[key]), { status: 200 });
  }) as typeof fetch;
}
const deps = (routes: Record<string, unknown>, e = env): Deps => ({ fetch: fakeFetch(routes), env: e });

const proSar: Expected = { plan: "pro", purpose: "provision", amountCents: 4900, currency: "SAR" };
const proInr: Expected = { plan: "pro", purpose: "provision", amountCents: 99900, currency: "INR" };
const binding = "space|provision|pro|-";

test("pricing: per-currency prices and env override", () => {
  assert.equal(priceCents("pro", "SAR", {}), 4900);
  assert.equal(priceCents("pro", "INR", {}), 99900);
  assert.equal(priceCents("basic", "INR", {}), 0);
  assert.equal(priceCents("nope", "SAR", {}), undefined);
  assert.equal(priceCents("pro", "INR", { PLAN_PRICES_JSON: '{"pro":{"INR":1}}' }), 1);
  assert.equal(priceCents("pro", "SAR", { PLAN_PRICES_JSON: "not json" }), 4900);
});

test("registry: only configured, allow-listed providers are active", () => {
  assert.deepEqual(activeProviders({ fetch, env }).map((p) => p.id).sort(), ["moyasar", "razorpay"]);
  assert.deepEqual(activeProviders({ fetch, env: { ...env, PAYMENT_PROVIDERS: "razorpay" } }).map((p) => p.id), ["razorpay"]);
  assert.deepEqual(activeProviders({ fetch, env: {} }), []);
  assert.deepEqual(availableCurrencies("pro", { fetch, env }).sort(), ["INR", "SAR"]);
});

test("session ids: bare ids are legacy Moyasar", () => {
  assert.deepEqual(splitSessionId("abc-123"), { provider: "moyasar", payload: "abc-123" });
  assert.deepEqual(splitSessionId("razorpay:pay_1.order_1.sig"), { provider: "razorpay", payload: "pay_1.order_1.sig" });
  assert.deepEqual(splitSessionId("weird:thing"), { provider: "moyasar", payload: "weird:thing" });
});

test("moyasar verify: paid ok; unpaid / amount / currency / plan / unknown id rejected", async () => {
  const ok = { id: "p1", status: "paid", amount: 4900, currency: "SAR", description: binding };
  assert.deepEqual(await moyasar.verify("p1", proSar, deps({ "/payments/p1": ok })), { ok: true, paymentId: "p1" });
  const bad = async (patch: object, exp = proSar) =>
    (await moyasar.verify("p1", exp, deps({ "/payments/p1": { ...ok, ...patch } }))).ok;
  assert.equal(await bad({ status: "failed" }), false);
  assert.equal(await bad({ amount: 100 }), false);
  assert.equal(await bad({ currency: "USD" }), false);
  assert.equal(await bad({ description: "space|provision|enterprise|-" }), false);
  assert.equal(await bad({}, { ...proSar, plan: "enterprise" }), false);
  assert.equal((await moyasar.verify("zzz", proSar, deps({}))).ok, false);
});

test("moyasar verify: upgrade is bound to the site", async () => {
  const up: Expected = { ...proSar, purpose: "upgrade", hostname: "a.example.com" };
  const rec = (host: string) => ({ id: "p2", status: "paid", amount: 4900, currency: "SAR", description: `space|upgrade|pro|${host}` });
  assert.equal((await moyasar.verify("p2", up, deps({ "/payments/p2": rec("a.example.com") }))).ok, true);
  assert.equal((await moyasar.verify("p2", up, deps({ "/payments/p2": rec("b.example.com") }))).ok, false);
});

const sig = (order: string, pay: string, secret = env.RAZORPAY_KEY_SECRET!) =>
  createHmac("sha256", secret).update(`${order}|${pay}`).digest("hex");
const rzp = (over: { pay?: object; order?: object } = {}) => ({
  "/payments/pay_1": { id: "pay_1", status: "captured", amount: 99900, currency: "INR", order_id: "order_1", ...over.pay },
  "/orders/order_1": { amount: 99900, currency: "INR", notes: { space: binding }, ...over.order },
});

test("razorpay verify: captured + valid signature ok", async () => {
  const payload = `pay_1.order_1.${sig("order_1", "pay_1")}`;
  assert.deepEqual(await razorpay.verify(payload, proInr, deps(rzp())), { ok: true, paymentId: "pay_1" });
});

test("razorpay verify: bad signature, wrong secret, tampered ids rejected", async () => {
  assert.equal((await razorpay.verify("pay_1.order_1.deadbeef", proInr, deps(rzp()))).ok, false);
  assert.equal((await razorpay.verify(`pay_1.order_1.${sig("order_1", "pay_1", "other")}`, proInr, deps(rzp()))).ok, false);
  assert.equal((await razorpay.verify(`pay_9.order_1.${sig("order_1", "pay_1")}`, proInr, deps(rzp()))).ok, false);
  assert.equal((await razorpay.verify("garbage", proInr, deps(rzp()))).ok, false);
});

test("razorpay verify: uncaptured, wrong amount/currency/order/plan rejected", async () => {
  const payload = `pay_1.order_1.${sig("order_1", "pay_1")}`;
  const v = async (o: Parameters<typeof rzp>[0], exp = proInr) => (await razorpay.verify(payload, exp, deps(rzp(o)))).ok;
  assert.equal(await v({ pay: { status: "authorized" } }), false);
  assert.equal(await v({ pay: { status: "failed" } }), false);
  assert.equal(await v({ pay: { amount: 100 } }), false);
  assert.equal(await v({ order: { amount: 100 } }), false);
  assert.equal(await v({ pay: { currency: "USD" } }), false);
  assert.equal(await v({ pay: { order_id: "order_2" } }), false);
  assert.equal(await v({ order: { notes: { space: "space|provision|enterprise|-" } } }), false);
  assert.equal(await v({}, { ...proInr, plan: "enterprise" }), false);
});

test("verifySession: routes by provider, rejects inactive provider and wrong currency", async () => {
  const payload = `razorpay:pay_1.order_1.${sig("order_1", "pay_1")}`;
  const r = await verifySession(payload, proInr, deps(rzp()));
  assert.deepEqual(r, { ok: true, paymentId: "pay_1", sessionId: "razorpay:pay_1" });
  assert.equal((await verifySession(payload, proInr, deps(rzp(), { ...env, PAYMENT_PROVIDERS: "moyasar" }))).ok, false);
  assert.equal((await verifySession(payload, proSar, deps(rzp()))).ok, false); // razorpay can't take SAR
  assert.equal((await verifySession(payload, proInr, deps(rzp(), {}))).ok, false);
});
