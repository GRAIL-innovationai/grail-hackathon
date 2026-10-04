import { NextResponse } from "next/server";
import { providerConfig } from "@/lib/agents/provider";
export const dynamic = "force-dynamic";
export function GET() {
  const c = providerConfig();
  return NextResponse.json(
    { provider: c.name, model: c.model, configured: !!c.apiKey },
    { headers: { "Cache-Control": "no-store" } },
  );
}
