import { NextResponse } from "next/server";
import { isDevConsoleEnabled } from "@/lib/dev-console";
import { sitesLogClear, sitesLogLines } from "@/lib/sites-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dev-only: poll Sites activity log while /api/sites is collecting. */
export async function GET() {
  if (!isDevConsoleEnabled()) {
    return NextResponse.json({ ok: false, error: "Dev console disabled" }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    lines: sitesLogLines(250),
  });
}

export async function DELETE() {
  if (!isDevConsoleEnabled()) {
    return NextResponse.json({ ok: false, error: "Dev console disabled" }, { status: 404 });
  }
  sitesLogClear();
  return NextResponse.json({ ok: true });
}
