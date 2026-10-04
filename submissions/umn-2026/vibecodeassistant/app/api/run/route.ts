import { hasModelCredentials, providerConfig } from "@/lib/agents/provider";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runs } from "@/lib/agents/runStore";
import { createGhosts } from "@/lib/agents/personas";
import { executeRun } from "@/lib/agents/agentLoop";
import { validateTarget, localHost } from "@/lib/security/target";
import type { RunState } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const requestSchema = z.object({
  target: z.string().url().max(2000),
  watch: z.boolean().default(false),
  profile: z.enum(["demo", "website"]).default("demo"),
  authorized: z.boolean().default(false),
  allowForms: z.boolean().default(false),
  includeSource: z.boolean().default(false),
  goal: z.string().max(1000).default(""),
});
export async function POST(request: NextRequest) {
  try {
    const body = requestSchema.parse(await request.json());
    const target = new URL(body.target),
      server = new URL(request.url);
    if (
      body.profile === "demo" &&
      (!localHost(target.hostname) ||
        !localHost(server.hostname) ||
        target.protocol !== server.protocol ||
        target.port !== server.port ||
        target.pathname !== "/demo" ||
        target.search ||
        target.hash ||
        target.username ||
        target.password)
    )
      return NextResponse.json(
        {
          error:
            "Demo mode requires this server’s bundled /demo URL. Select Website audit for another target.",
        },
        { status: 400 },
      );
    if (body.profile === "website" && !body.authorized)
      return NextResponse.json(
        {
          error: "Confirm that you own or are authorized to test this target.",
        },
        { status: 400 },
      );
    await validateTarget(body.target);
    if ([...runs.values()].some((r) => r.status === "running"))
      return NextResponse.json(
        { error: "A deployment is already running." },
        { status: 409 },
      );
    if (runs.size >= 10) runs.delete(runs.keys().next().value!);
    const run: RunState = {
      id: crypto.randomUUID(),
      status: "running",
      target: target.href,
      watch: body.watch,
      profile: body.profile,
      allowForms: body.profile === "demo" || body.allowForms,
      includeSource: body.includeSource,
      userGoal: body.goal,
      mode:
        body.profile === "website"
          ? hasModelCredentials()
            ? `${providerConfig().name} website agents · real browser`
            : "Heuristic website exploration · no API key"
          : process.env.DEMO_MODE === "true" || !hasModelCredentials()
            ? "Deterministic demo · real browser"
            : `${providerConfig().name} demo agents · real browser`,
      ghosts: createGhosts(),
      activity: [],
      bugs: [],
      findings: [],
      gaps:
        body.profile === "website" && !hasModelCredentials()
          ? [
              "AI provider key is not configured. AI decisions and functional reflection are unavailable; heuristic navigation and passive modules still run.",
            ]
          : [],
      modules: [
        {
          id: "planner",
          name: "Goal planner",
          status: body.profile === "demo" ? "complete" : "idle",
          summary:
            body.profile === "demo"
              ? "Bundled demo goals selected."
              : "Waiting for the current landing page.",
          count: 0,
        },
        ...["runtime", "compliance", "static", "orchestrator"].map((id) => ({
          id,
          name: (
            {
              runtime: "Runtime inspector",
              compliance: "Compliance checker",
              static: "Source analyzer",
              orchestrator: "Team orchestrator",
            } as Record<string, string>
          )[id],
          status: "idle" as const,
          summary: "Waiting for browser evidence.",
          count: 0,
        })),
      ],
      startedAt: new Date().toISOString(),
    };
    if (body.profile === "website")
      run.ghosts.forEach((g, i) => {
        g.persona = `Website ghost ${i + 1} · planning role`;
        g.personality = "Waiting for the target landing page.";
        g.goal = "Waiting for a goal based on the target website.";
      });
    runs.set(run.id, run);
    void executeRun(run);
    return NextResponse.json(run);
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Invalid run options."
            : e instanceof Error
              ? e.message
              : "Provide a valid target URL.",
      },
      { status: 400 },
    );
  }
}
export async function GET(request: NextRequest) {
  const run = runs.get(request.nextUrl.searchParams.get("id") || "");
  return run
    ? NextResponse.json(run, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json(
        { error: "Run not found. The server may have restarted." },
        { status: 404 },
      );
}
