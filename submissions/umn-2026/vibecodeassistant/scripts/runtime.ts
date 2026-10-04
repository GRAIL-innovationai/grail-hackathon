// CLI: node scripts/runtime.ts http://localhost:3000 --mode read_only --out runs/run.json
// Test credentials come from env (VIBEAUDIT_USERNAME / VIBEAUDIT_PASSWORD / VIBEAUDIT_LOGIN_URL) so they never land in shell history.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { inspect, MODES, preflight, type Mode } from "../lib/runtime/inspector.ts";
import { toJson } from "../lib/runtime/models.ts";

const { values: a, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    mode: { type: "string", default: "read_only" },
    "max-pages": { type: "string", default: "50" },
    "max-depth": { type: "string", default: "4" },
    out: { type: "string" },
    "preflight-only": { type: "boolean", default: false },
    "storage-state": { type: "string" },
    yes: { type: "boolean", default: false }, // skip the confirmation for modes that submit forms
  },
});
const fail = (msg: string, code = 2): never => {
  console.error(`error: ${msg}`);
  process.exit(code);
};
const url = positionals[0] ?? fail("usage: node scripts/runtime.ts <localhost-url> [--mode read_only|fake_data|authenticated] [--out file]");
const mode = a.mode as Mode;
if (!MODES.includes(mode)) fail(`--mode must be one of ${MODES.join(", ")}`);

const pf = await preflight(url).catch((e: Error) => fail(e.message));
if (a["preflight-only"]) {
  console.log(toJson(pf));
  process.exit(0);
}
if (!pf.reachable) fail(`${pf.target} not reachable (${pf.error ?? pf.status})`);

const env = process.env;
const credentials = env.VIBEAUDIT_USERNAME
  ? { username: env.VIBEAUDIT_USERNAME, password: env.VIBEAUDIT_PASSWORD ?? "", login_url: env.VIBEAUDIT_LOGIN_URL ?? null }
  : null;
if (mode === "authenticated" && !(credentials || a["storage-state"]))
  fail("authenticated mode needs VIBEAUDIT_USERNAME/VIBEAUDIT_PASSWORD or --storage-state");

if (mode !== "read_only" && !a.yes) {
  const hosts = pf.backend_hosts.map((h) => `${h.host} (${h.kind})`).join(", ") || "none seen on landing page";
  console.error(`mode ${mode} submits forms with fake data. External backends: ${hosts}`);
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const answer = await rl.question("Writes may reach those backends. Type 'yes' to continue: ");
  rl.close();
  if (answer.trim() !== "yes") process.exit(1);
}

const report = await inspect(url, {
  mode, credentials, storageState: a["storage-state"] ?? null,
  maxPages: Number(a["max-pages"]), maxDepth: Number(a["max-depth"]), outDir: a.out ? dirname(a.out) : null,
});
const text = toJson(report);
if (a.out) {
  mkdirSync(dirname(a.out), { recursive: true });
  writeFileSync(a.out, text);
  const counts: Record<string, number> = {};
  for (const f of report.findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  console.error(`${report.run.pages_visited} pages, ${report.findings.length} findings ${JSON.stringify(counts)}, ${report.gaps.length} gaps -> ${a.out}`);
} else console.log(text);
