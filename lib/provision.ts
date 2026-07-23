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
import {
  buildCatalog,
  createOrder,
  DEFAULT_PLANS,
  getPlan,
  optionalFrappeNotify,
  updateOrder,
} from "./control-plane";

export type ProvisionPayload = {
  slug: string;
  adminPassword: string;
  apps: string[];
  plan: string;
  paymentMethod?: string;
  orderName?: string;
};

export async function getLocalCatalog() {
  return buildCatalog();
}

export async function createControlOrder(payload: ProvisionPayload): Promise<string> {
  const result = createOrder({
    slug: payload.slug,
    plan: payload.plan,
    apps: payload.apps,
    paymentMethod: payload.paymentMethod || "Mock",
  });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.order.name;
}

async function notifyOrder(
  orderName: string | undefined,
  patch: Parameters<typeof updateOrder>[1] & {
    stage?: string;
    stage_status?: string;
    message?: string;
  },
) {
  if (!orderName) return;
  const {
    stage: _s,
    stage_status: _ss,
    message: _m,
    ...localPatch
  } = patch;
  updateOrder(orderName, localPatch);
  await optionalFrappeNotify({
    name: orderName,
    status: patch.status,
    job_id: patch.jobId,
    error_message: patch.errorMessage,
    admin_password_set: patch.adminPasswordSet ? 1 : undefined,
    stage: patch.stage,
    stage_status: patch.stage_status,
    message: patch.message,
  });
}

export function toUserError(raw: string): string {
  const msg = (raw || "").trim();
  const lower = msg.toLowerCase();
  if (!msg) return "Something went wrong while creating your site. Please try again.";
  if (lower.includes("reserved")) {
    return "That site name is reserved. Please go back and choose a different name.";
  }
  if (lower.includes("invalid subdomain") || lower.includes("invalid slug")) {
    return "That site name is not valid. Use lowercase letters, numbers, and hyphens.";
  }
  if (lower.includes("password")) {
    return "The Administrator password must be at least 8 characters.";
  }
  if (lower.includes("already exists") || lower.includes("hostname_taken") || lower.includes("taken")) {
    return "A site with this name already exists. Please choose another subdomain.";
  }
  if (lower.includes("dns") || lower.includes("resolve") || lower.includes("namecheap")) {
    return "Your subdomain is not reachable yet. Wait a few minutes for DNS, then try again.";
  }
  if (lower.includes("do_db_root") || lower.includes("mariadb") || lower.includes("db root")) {
    return "The server is not fully configured for new sites. Contact ZatGo support.";
  }
  if (lower.includes("ssh") || lower.includes("not found") || lower.includes("connection")) {
    return "Could not reach the server. Check your connection and try again.";
  }
  if (lower.includes("rate limit")) {
    return "Too many attempts. Please wait a while and try again.";
  }
  if (lower.includes("not enough ram") || lower.includes("pool_ram") || lower.includes("ram in the server pool")) {
    return "The server RAM pool is full for this plan. Free capacity or choose a smaller plan.";
  }
  if (lower.includes("not enough disk") || lower.includes("pool_disk") || lower.includes("disk in the server pool")) {
    return "The server disk pool is full for this plan. Free capacity or choose a smaller plan.";
  }
  if (lower.includes("unknown plan")) {
    return "That billing plan is not available. Go back and choose another plan.";
  }
  if (lower.includes("install-app") || lower.includes("new-site")) {
    return "We could not finish installing your site. Please try again, or contact support if it keeps failing.";
  }
  if (msg.length > 180 || /traceback|stderr|docker|bench |--mariadb/i.test(msg)) {
    return "Installation stopped unexpectedly. Please try again. If it fails again, contact ZatGo support.";
  }
  return msg;
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
      if (!getPlan(payload.plan) && !DEFAULT_PLANS.some((p) => p.code === payload.plan)) {
        throw new Error(`Unknown plan: ${payload.plan}`);
      }
      finishStage(jobId, "validate", "succeeded");

      if (!orderName) {
        orderName = await createControlOrder(payload);
        appendLog(jobId, `Order ${orderName} (space-web control plane)`);
      }

      await notifyOrder(orderName, {
        status: "Provisioning",
        jobId,
        adminPasswordSet: true,
        stage: "validate",
        stage_status: "succeeded",
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

      await notifyOrder(orderName, {
        status: "Active",
        jobId,
        deskUrl,
        stage: "ready",
        stage_status: "succeeded",
        message: deskUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      appendLog(jobId, `ERROR: ${message}`);
      setJobStatus(jobId, "failed", toUserError(message));
      const running = job.stages.find((s) => s.status === "running");
      if (running) finishStage(jobId, running.id, "failed");
      await notifyOrder(orderName, {
        status: "Failed",
        jobId,
        errorMessage: toUserError(message),
        stage: running?.id || "failed",
        stage_status: "failed",
        message: toUserError(message),
      });
    }
  })();

  return jobId;
}
