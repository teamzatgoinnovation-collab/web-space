import {
  appendLog,
  createJob,
  finishStage,
  setJobResult,
  setJobStatus,
  startStage,
} from "./jobs";
import {
  benchEnv,
  clearCache,
  domainSuffix,
  installApp,
  listAppsOnSite,
  listBenchApps,
  newSite,
  redactSecrets,
  RESERVED_SLUGS,
  SLUG_RE,
  verifyDns,
} from "./bench";

export type ProvisionPayload = {
  slug: string;
  adminPassword: string;
  apps: string[];
  plan: string;
  paymentMethod?: string;
  inviteCode?: string;
  orderName?: string;
};

const MOCK_PLANS = [
  {
    code: "basic",
    title: "Basic",
    mock_price: "$0 / mo (mock)",
    features: ["1 site", "ERPNext core", "Community support"],
  },
  {
    code: "pro",
    title: "Pro",
    mock_price: "$49 / mo (mock)",
    features: ["1 site", "ERPNext + HRMS", "Priority email support"],
  },
  {
    code: "enterprise",
    title: "Enterprise",
    mock_price: "$199 / mo (mock)",
    features: ["Multi-site ready", "Custom apps", "Dedicated onboarding"],
  },
];

const DEFAULT_APPS = [
  { package: "frappe", title: "Frappe Framework", required: true },
  { package: "erpnext", title: "ERPNext", required: false },
  { package: "hrms", title: "HRMS", required: false },
];

export function getLocalCatalog() {
  return {
    ok: true,
    domainSuffix: domainSuffix(),
    apps: DEFAULT_APPS,
    plans: MOCK_PLANS,
    inviteRequired: Boolean(process.env.SPACE_INVITE_CODE?.trim()),
  };
}

export function checkInvite(code?: string): string | null {
  const expected = process.env.SPACE_INVITE_CODE?.trim();
  if (!expected) return null;
  if ((code || "") !== expected) return "Valid invite code required";
  return null;
}

async function notifyControlSite(body: Record<string, unknown>) {
  const base = process.env.FRAPPE_BASE_URL?.replace(/\/$/, "");
  const token = process.env.SPACE_INTERNAL_TOKEN?.trim();
  if (!base || !token) return;
  try {
    await fetch(
      `${base}/api/method/zatgo_space.api.v1.space.update_order_status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Space-Token": token,
          ...(process.env.FRAPPE_API_KEY && process.env.FRAPPE_API_SECRET
            ? {
                Authorization: `token ${process.env.FRAPPE_API_KEY}:${process.env.FRAPPE_API_SECRET}`,
              }
            : {}),
        },
        body: JSON.stringify(body),
      },
    );
  } catch {
    // best-effort
  }
}

export async function createControlOrder(payload: ProvisionPayload): Promise<string | undefined> {
  const base = process.env.FRAPPE_BASE_URL?.replace(/\/$/, "");
  if (!base) return undefined;
  try {
    const res = await fetch(`${base}/api/method/zatgo_space.api.v1.space.create_order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: payload.slug,
        plan: payload.plan,
        apps: payload.apps,
        payment_method: payload.paymentMethod || "Mock",
        invite_code: payload.inviteCode,
      }),
    });
    const json = (await res.json()) as {
      message?: { success?: boolean; data?: { name?: string } };
    };
    return json.message?.data?.name;
  } catch {
    return undefined;
  }
}

export function startProvisionJob(payload: ProvisionPayload): string {
  const slug = payload.slug.trim().toLowerCase();
  const hostname = `${slug}.${domainSuffix()}`;
  const job = createJob("space:provision", { slug, hostname, plan: payload.plan });
  const jobId = job.id;
  const env = benchEnv();

  void (async () => {
    let orderName = payload.orderName;
    try {
      startStage(jobId, "validate", "Validate slug");
      appendLog(jobId, `Validating ${hostname}`);
      if (!SLUG_RE.test(slug)) throw new Error("Invalid subdomain slug");
      if (RESERVED_SLUGS.has(slug)) throw new Error(`Subdomain '${slug}' is reserved`);
      if (!payload.adminPassword || payload.adminPassword.length < 8) {
        throw new Error("Administrator password must be at least 8 characters");
      }
      if (!MOCK_PLANS.some((p) => p.code === payload.plan)) {
        throw new Error(`Unknown plan: ${payload.plan}`);
      }
      finishStage(jobId, "validate", "succeeded");

      if (!orderName) {
        orderName = await createControlOrder(payload);
      }

      await notifyControlSite({
        name: orderName,
        status: "Provisioning",
        job_id: jobId,
        stage: "validate",
        stage_status: "succeeded",
        admin_password_set: 1,
      });

      startStage(jobId, "dns", "DNS check");
      appendLog(jobId, `Checking DNS for ${hostname}`);
      const dns = await verifyDns(hostname);
      appendLog(jobId, dns.message);
      if (!dns.ok) throw new Error(dns.message);
      finishStage(jobId, "dns", "succeeded");

      const apps = [...new Set(payload.apps.filter(Boolean))];
      if (!apps.includes("frappe")) apps.unshift("frappe");
      const installErpnext = apps.includes("erpnext");
      const extraApps = apps.filter((a) => a !== "frappe" && a !== "erpnext");

      startStage(jobId, "new-site", "Create site");
      appendLog(jobId, `bench new-site ${hostname}`);
      const created = await newSite(env, {
        site: hostname,
        adminPassword: payload.adminPassword,
        installErpnext,
      });
      appendLog(jobId, redactSecrets(created.stdout || created.stderr || ""));
      if (!created.ok) throw new Error(created.stderr || "new-site failed");
      finishStage(jobId, "new-site", "succeeded");

      startStage(jobId, "apps", "Install apps");
      const onBench = await listBenchApps(env);
      for (const pkg of extraApps) {
        if (!onBench.includes(pkg)) {
          appendLog(jobId, `Skip ${pkg} (not on bench)`);
          continue;
        }
        appendLog(jobId, `install-app ${pkg}`);
        const r = await installApp(env, hostname, pkg);
        appendLog(jobId, redactSecrets(r.stdout || r.stderr || ""));
        if (!r.ok) throw new Error(`install-app ${pkg} failed: ${r.stderr}`);
      }
      finishStage(jobId, "apps", "succeeded");

      startStage(jobId, "cache", "Clear cache");
      const cache = await clearCache(env, hostname);
      appendLog(jobId, cache.stdout || cache.stderr || "clear-cache done");
      const listed = await listAppsOnSite(env, hostname);
      appendLog(jobId, listed.stdout || "");
      finishStage(jobId, "cache", "succeeded");

      const deskUrl = `https://${hostname}`;
      setJobResult(jobId, { deskUrl, hostname, orderName });
      setJobStatus(jobId, "succeeded");
      appendLog(jobId, `Ready: ${deskUrl}`);

      if (orderName) {
        await notifyControlSite({
          name: orderName,
          status: "Active",
          job_id: jobId,
          stage: "ready",
          stage_status: "succeeded",
          message: deskUrl,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendLog(jobId, `ERROR: ${message}`);
      setJobStatus(jobId, "failed", message);
      const running = job.stages.find((s) => s.status === "running");
      if (running) finishStage(jobId, running.id, "failed");
      if (orderName) {
        await notifyControlSite({
          name: orderName,
          status: "Failed",
          job_id: jobId,
          error_message: message,
          stage: running?.id || "failed",
          stage_status: "failed",
          message,
        });
      }
    }
  })();

  return jobId;
}
