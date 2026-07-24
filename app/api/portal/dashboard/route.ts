import { NextResponse } from "next/server";
import {
  frappeControlEnabled,
  frappePortalDashboard,
  frappeListUsage,
  frappeListInvoices,
  frappeListJobs,
  frappeListBackups,
  frappeListDomains,
  frappeListNotifications,
  frappeGetProfile,
  frappeListSubscriptions,
} from "@/lib/frappe-space";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unwrap(message: unknown) {
  if (message && typeof message === "object" && "ok" in (message as object)) {
    return message as { ok: boolean; data?: unknown; error?: string };
  }
  return { ok: true, data: message };
}

async function handle(fn: () => Promise<unknown>) {
  try {
    if (!frappeControlEnabled()) {
      return NextResponse.json({ ok: false, error: "Frappe control plane disabled" }, { status: 503 });
    }
    const message = unwrap(await fn());
    if (message.ok === false) {
      return NextResponse.json(message, { status: 400 });
    }
    return NextResponse.json({ ok: true, data: message.data ?? message });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String((e as Error).message || e) }, { status: 500 });
  }
}

export async function GET() {
  return handle(() => frappePortalDashboard());
}
