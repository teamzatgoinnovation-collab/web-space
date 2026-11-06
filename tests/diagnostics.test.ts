import assert from "node:assert/strict";
import { test } from "node:test";
import { isOwnSiteHost, runDiagnostics, type DiagDeps } from "../lib/diagnostics.ts";

const env = { SPACE_DOMAIN_SUFFIX: "zatgoinnovation.com", SPACE_DROPLET_IP: "2.29.17.8" };
const deps = (over: Partial<DiagDeps> = {}): DiagDeps => ({
  resolve4: async () => ["2.29.17.8"],
  fetch: (async () => new Response("{}", { status: 200 })) as typeof fetch,
  env,
  ...over,
});
const active = (hostname: string) => ({ hostname, status: "Active" });
const by = (cs: Awaited<ReturnType<typeof runDiagnostics>>, id: string) => cs.find((c) => c.id === id);

test("host guard: only <slug>.<suffix>; no nested, foreign, IP, or look-alike hosts", () => {
  assert.equal(isOwnSiteHost("qa-x.zatgoinnovation.com", "zatgoinnovation.com"), true);
  for (const h of ["evil.com", "a.b.zatgoinnovation.com", "zatgoinnovation.com", "x.zatgoinnovation.com.evil.com", "127.0.0.1", "localhost", "x.zatgoinnovationXcom", "-x.zatgoinnovation.com", ""]) {
    assert.equal(isOwnSiteHost(h, "zatgoinnovation.com"), false, h);
  }
  assert.equal(isOwnSiteHost("x.zatgoinnovation.com", ""), false);
});

test("a foreign host is refused and nothing is fetched or resolved", async () => {
  let touched = false;
  const cs = await runDiagnostics(active("evil.com"), deps({ fetch: (async () => { touched = true; return new Response(); }) as typeof fetch, resolve4: async () => { touched = true; return []; } }));
  assert.equal(touched, false);
  assert.equal(cs[0].status, "fail");
});

test("healthy site: all checks pass", async () => {
  const cs = await runDiagnostics(active("a.zatgoinnovation.com"), deps());
  assert.deepEqual(cs.map((c) => c.status), ["pass", "pass", "pass", "pass"]);
});

test("DNS pointing elsewhere or not resolving fails", async () => {
  assert.equal(by(await runDiagnostics(active("a.zatgoinnovation.com"), deps({ resolve4: async () => ["1.2.3.4"] })), "dns")?.status, "fail");
  assert.equal(by(await runDiagnostics(active("a.zatgoinnovation.com"), deps({ resolve4: async () => { throw new Error("ENOTFOUND"); } })), "dns")?.status, "fail");
});

test("TLS failure vs plain connection failure are told apart; ping not 200 fails", async () => {
  const tls = await runDiagnostics(active("a.zatgoinnovation.com"), deps({ fetch: (async () => { throw new Error("fetch failed", { cause: { code: "ERR_TLS_CERT_ALTNAME_INVALID" } }); }) as typeof fetch }));
  assert.match(by(tls, "https")!.detail!, /certificate/);
  const down = await runDiagnostics(active("a.zatgoinnovation.com"), deps({ fetch: (async () => { throw new Error("fetch failed"); }) as typeof fetch }));
  assert.match(by(down, "https")!.detail!, /Could not connect/);
  const five = await runDiagnostics(active("a.zatgoinnovation.com"), deps({ fetch: (async () => new Response("", { status: 503 })) as typeof fetch }));
  assert.equal(by(five, "ping")?.status, "fail");
});

test("record state: provisioning is pending, deleted/failed fail", async () => {
  const st = async (status: string) => by(await runDiagnostics({ hostname: "a.zatgoinnovation.com", status }, deps()), "record")?.status;
  assert.equal(await st("Active"), "pass");
  assert.equal(await st("Provisioning"), "pending");
  assert.equal(await st("Failed"), "fail");
  assert.equal(await st("Deleted"), "fail");
});
