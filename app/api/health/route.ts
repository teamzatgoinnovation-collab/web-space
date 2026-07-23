import { NextResponse } from "next/server";
import { getDoSshConfig, benchEnv } from "@/lib/bench";

export const runtime = "nodejs";

export async function GET() {
  const env = benchEnv();
  if (env === "cloud") {
    const cfg = getDoSshConfig();
    return NextResponse.json({
      ok: !("error" in cfg),
      env,
      ssh: "error" in cfg ? cfg.error : "configured",
      dbPasswordSet: !("error" in cfg) && Boolean(cfg.dbRootPassword),
    });
  }
  return NextResponse.json({
    ok: true,
    env,
    dbPasswordSet: Boolean(process.env.LOCAL_DB_ROOT_PASSWORD?.trim()),
  });
}
