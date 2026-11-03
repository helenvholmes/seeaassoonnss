import { NextResponse } from "next/server";
import { healthReport } from "@/lib/health";

export const dynamic = "force-dynamic";

/**
 * GET /seasons/api/health: which parts of the setup work. Names missing settings
 * and explains failures, but never shows a value or a connection string.
 */
export async function GET() {
  const report = await healthReport();
  return NextResponse.json(report, { status: report.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
