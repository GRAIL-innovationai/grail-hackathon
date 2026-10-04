import { NextRequest, NextResponse } from "next/server";
import { runs } from "@/lib/agents/runStore";
import { generateMarkdownReport } from "@/backend/src/reporters/generateMarkdownReport.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  const run = runs.get(request.nextUrl.searchParams.get("id") || "");
  if (!run)
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status === "running")
    return NextResponse.json(
      { error: "Wait for the run to finish before exporting." },
      { status: 409 },
    );
  const findings = run.findings;
  const summary = {
    totalFindings: findings.length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };
  const markdown =
    `Target: ${run.target}\nMode: ${run.mode}\n\n` +
    generateMarkdownReport(summary, findings) +
    `\n## Verification status\n${findings.map((f) => `- ${f.title}: ${f.validationStatus}`).join("\n")}\n\n## Coverage gaps\n${run.gaps.map((g) => "- " + g).join("\n") || "- None recorded; this is not proof of exhaustive coverage."}`;
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="ghostqa-${run.id}.md"`,
    },
  });
}
