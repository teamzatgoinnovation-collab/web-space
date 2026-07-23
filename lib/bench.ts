import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import dns from "node:dns/promises";

export type BenchEnv = "local" | "cloud";

export type RunResult = {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  command: string;
};

export const SITE_NAME_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i;
export const PACKAGE_NAME_RE = /^[a-z][a-z0-9_]*$/;
export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export const RESERVED_SLUGS = new Set([
  "www",
  "erp",
  "space",
  "bench",
  "api",
  "mail",
  "ftp",
  "ns1",
  "ns2",
  "cdn",
  "admin",
  "status",
  "docs",
  "app",
  "apps",
  "portal",
]);

const ALLOWED = new Set(["docker", "ssh"]);

export function domainSuffix(): string {
  return process.env.SPACE_DOMAIN_SUFFIX?.trim() || "zatgo.online";
}

export function dropletIp(): string {
  return process.env.SPACE_DROPLET_IP?.trim() || "157.230.8.164";
}

export function benchEnv(): BenchEnv {
  return process.env.SPACE_BENCH_ENV === "local" ? "local" : "cloud";
}

export function assertSiteName(site: string): string {
  if (!SITE_NAME_RE.test(site) || site.length > 128) {
    throw new Error(`Invalid site name: ${site}`);
  }
  return site;
}

export function assertPackageName(pkg: string): string {
  if (!PACKAGE_NAME_RE.test(pkg) || pkg.length > 64) {
    throw new Error(`Invalid package name: ${pkg}`);
  }
  return pkg;
}

function truncate(s: string, max = 200_000): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated]`;
}

function shQuote(arg: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/--mariadb-root-password\s+\S+/g, "--mariadb-root-password ***")
    .replace(/--admin-password\s+\S+/g, "--admin-password ***");
}

export function runCommand(
  command: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<RunResult> {
  if (!ALLOWED.has(command)) {
    return Promise.resolve({
      ok: false,
      code: 1,
      stdout: "",
      stderr: `Command not allowlisted: ${command}`,
      command: `${command} ${args.join(" ")}`,
    });
  }

  const display = redactSecrets(
    `${command} ${args.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ")}`,
  );
  const timeoutMs = opts?.timeoutMs ?? 10 * 60_000;

  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, env: process.env });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      settled = true;
      resolve({
        ok: false,
        code: null,
        stdout: truncate(stdout),
        stderr: truncate(`${stderr}\nTimed out after ${timeoutMs}ms`),
        command: display,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        code: 1,
        stdout: truncate(stdout),
        stderr: truncate(err.message),
        command: display,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: code === 0,
        code,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        command: display,
      });
    });
  });
}

export type DoSshConfig = {
  host: string;
  user: string;
  port: number;
  keyPath: string;
  backendContainer: string;
  dbRootPassword?: string;
};

export function getDoSshConfig(): DoSshConfig | { error: string } {
  const host = process.env.DO_SSH_HOST?.trim() || "157.230.8.164";
  const user = process.env.DO_SSH_USER?.trim() || "root";
  const port = Number(process.env.DO_SSH_PORT?.trim() || "22");
  const keyPath =
    process.env.DO_SSH_KEY_PATH?.trim() || path.join(os.homedir(), ".ssh", "id_ed25519");
  const backendContainer =
    process.env.DO_BACKEND_CONTAINER?.trim() || "frappe_docker-backend-1";
  const dbRootPassword = process.env.DO_DB_ROOT_PASSWORD?.trim() || undefined;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: `Invalid DO_SSH_PORT` };
  }
  if (!path.isAbsolute(keyPath)) {
    return { error: "DO_SSH_KEY_PATH must be absolute" };
  }
  const sshDir = path.join(os.homedir(), ".ssh");
  const resolved = path.resolve(keyPath);
  if (!resolved.startsWith(sshDir + path.sep) && resolved !== sshDir) {
    return { error: `DO_SSH_KEY_PATH must be under ${sshDir}` };
  }
  if (!fs.existsSync(resolved)) {
    return { error: `SSH key not found: ${resolved}` };
  }

  return {
    host,
    user,
    port,
    keyPath: resolved,
    backendContainer,
    dbRootPassword,
  };
}

function sshBaseArgs(cfg: DoSshConfig): string[] {
  return [
    "-i",
    cfg.keyPath,
    "-o",
    "BatchMode=yes",
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-p",
    String(cfg.port),
    `${cfg.user}@${cfg.host}`,
  ];
}

export async function runOnBench(
  env: BenchEnv,
  argv: string[],
  opts?: { timeoutMs?: number },
): Promise<RunResult> {
  for (const a of argv) {
    if (typeof a !== "string" || a.includes("\0")) {
      return {
        ok: false,
        code: 1,
        stdout: "",
        stderr: "Invalid argv token",
        command: argv.join(" "),
      };
    }
  }

  if (env === "local") {
    const container = process.env.LOCAL_BACKEND_CONTAINER?.trim() || "erpnext-backend-1";
    return runCommand("docker", ["exec", container, ...argv], opts);
  }

  const cfg = getDoSshConfig();
  if ("error" in cfg) {
    return { ok: false, code: 1, stdout: "", stderr: cfg.error, command: "ssh" };
  }

  const remote =
    `docker exec ${shQuote(cfg.backendContainer)} ` + argv.map(shQuote).join(" ");
  return runCommand("ssh", [...sshBaseArgs(cfg), "--", remote], opts);
}

export function getDbRootPassword(env: BenchEnv): string | undefined {
  if (env === "local") {
    return process.env.LOCAL_DB_ROOT_PASSWORD?.trim() || undefined;
  }
  const cfg = getDoSshConfig();
  if ("error" in cfg) return undefined;
  return cfg.dbRootPassword;
}

export async function listSites(env: BenchEnv): Promise<{ sites: string[]; result: RunResult }> {
  const result = await runOnBench(env, ["ls", "-1", "sites"]);
  if (!result.ok) return { sites: [], result };
  const noise = new Set([
    "apps",
    "assets",
    "common_site_config.json",
    "apps.txt",
    "apps.json",
    "currentsite.txt",
  ]);
  const sites = result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !noise.has(l) && !l.endsWith(".json") && !l.endsWith(".txt") && SITE_NAME_RE.test(l));
  return { sites, result };
}

export async function listBenchApps(env: BenchEnv): Promise<string[]> {
  const result = await runOnBench(env, ["ls", "-1", "apps"]);
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && PACKAGE_NAME_RE.test(l));
}

export async function newSite(
  env: BenchEnv,
  opts: { site: string; adminPassword: string; installErpnext: boolean },
): Promise<RunResult> {
  const site = assertSiteName(opts.site);
  if (!opts.adminPassword || opts.adminPassword.length < 8) {
    return {
      ok: false,
      code: 1,
      stdout: "",
      stderr: "Admin password must be at least 8 characters",
      command: "bench new-site",
    };
  }
  const dbRoot = getDbRootPassword(env);
  if (!dbRoot) {
    return {
      ok: false,
      code: 1,
      stdout: "",
      stderr: env === "cloud" ? "Set DO_DB_ROOT_PASSWORD" : "Set LOCAL_DB_ROOT_PASSWORD",
      command: "bench new-site",
    };
  }
  const existing = await listSites(env);
  if (existing.sites.includes(site)) {
    return {
      ok: false,
      code: 1,
      stdout: "",
      stderr: `Site already exists: ${site}`,
      command: "bench new-site",
    };
  }
  const args = [
    "bench",
    "new-site",
    site,
    "--mariadb-root-password",
    dbRoot,
    "--admin-password",
    opts.adminPassword,
  ];
  if (opts.installErpnext) {
    args.push("--install-app", "erpnext");
  }
  return runOnBench(env, args, { timeoutMs: 60 * 60_000 });
}

export async function installApp(env: BenchEnv, site: string, pkg: string): Promise<RunResult> {
  return runOnBench(
    env,
    ["bench", "--site", assertSiteName(site), "install-app", assertPackageName(pkg)],
    { timeoutMs: 30 * 60_000 },
  );
}

export async function clearCache(env: BenchEnv, site: string): Promise<RunResult> {
  return runOnBench(env, ["bench", "--site", assertSiteName(site), "clear-cache"]);
}

export async function listAppsOnSite(env: BenchEnv, site: string): Promise<RunResult> {
  return runOnBench(env, ["bench", "--site", assertSiteName(site), "list-apps"]);
}

/** Verify hostname resolves to droplet IP (wildcard DNS). */
export async function verifyDns(hostname: string): Promise<{ ok: boolean; message: string }> {
  const expected = dropletIp();
  try {
    const addrs = await dns.resolve4(hostname);
    if (addrs.includes(expected)) {
      return { ok: true, message: `${hostname} → ${expected}` };
    }
    return {
      ok: false,
      message: `${hostname} resolves to ${addrs.join(", ") || "(none)"}; expected ${expected}. Add Namecheap A record host=* → ${expected}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: `DNS lookup failed for ${hostname}: ${err instanceof Error ? err.message : String(err)}. Add Namecheap A record host=* → ${expected}`,
    };
  }
}

const rateMap = new Map<string, number[]>();

export function rateLimitOk(ip: string, maxPerHour = 5): boolean {
  const now = Date.now();
  const windowMs = 60 * 60_000;
  const hits = (rateMap.get(ip) || []).filter((t) => now - t < windowMs);
  if (hits.length >= maxPerHour) {
    rateMap.set(ip, hits);
    return false;
  }
  hits.push(now);
  rateMap.set(ip, hits);
  return true;
}
