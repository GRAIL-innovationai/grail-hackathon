import { NextRequest, NextResponse } from "next/server";
import { inspect, MODES, preflight, type Mode } from "@/lib/runtime/inspector.ts";
import { redactText } from "@/lib/runtime/models.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const globalStore = globalThis as typeof globalThis & { runtimeBusy?: boolean };

// POST { target, action: "preflight" }                      -> reachability, stack, external backend hosts
// POST { target, mode?, credentials?, maxPages?, maxDepth? } -> full runtime report (waits for the crawl)
// The UI must show preflight.backend_hosts and get the user's OK before any mode other than read_only.
export async function POST(request: NextRequest) {
  let body: {
    target?: string; action?: string; mode?: Mode; maxPages?: number; maxDepth?: number;
    credentials?: { username: string; password: string; login_url?: string | null };
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with a localhost target URL." }, { status: 400 });
  }
  const { target, action, mode = "read_only", credentials = null, maxPages = 50, maxDepth = 4 } = body;
  if (!target) return NextResponse.json({ error: "Provide a localhost target URL." }, { status: 400 });
  if (!MODES.includes(mode)) return NextResponse.json({ error: `mode must be one of ${MODES.join(", ")}` }, { status: 400 });
  if (globalStore.runtimeBusy) return NextResponse.json({ error: "A runtime inspection is already running." }, { status: 409 });
  globalStore.runtimeBusy = true;
  try {
    const result = action === "preflight"
      ? await preflight(target)
      : await inspect(target, { mode, credentials, maxPages: Math.min(maxPages, 200), maxDepth: Math.min(maxDepth, 10) });
    // Same redaction as toJson(): never ship tokens to the browser.
    return new NextResponse(redactText(JSON.stringify(result)), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: message.startsWith("refusing target") ? 400 : 500 });
  } finally {
    globalStore.runtimeBusy = false;
  }
}
