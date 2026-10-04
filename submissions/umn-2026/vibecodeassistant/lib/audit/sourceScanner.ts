import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { AuditFinding } from "@/lib/types";
import { finding } from "./findings";
import { redact } from "@/lib/security/redact";
// Executable implementation of the teammate's static-code-analysis rules.
const skipped = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".venv",
  "venv",
  "__pycache__",
  ".codex",
  ".aws",
]);
export async function sourceScan(
  root: string,
): Promise<{ findings: AuditFinding[]; count: number; capped: boolean }> {
  const files: string[] = [];
  let capped = false;
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (files.length >= 250) {
        capped = true;
        return;
      }
      if (entry.isSymbolicLink() || skipped.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (
        /\.(?:[cm]?js|jsx|tsx?|py)$/.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
      )
        files.push(absolute);
    }
  }
  await walk(root);
  const findings: AuditFinding[] = [];
  const report = (
    file: string,
    line: number,
    rule: string,
    title: string,
    summary: string,
    evidence: string,
    severity: AuditFinding["severity"] = "low",
  ) =>
    findings.push(
      finding({
        title,
        source: "static-analyzer",
        category: rule === "GOD_COMPONENT" ? "architecture" : "performance",
        ruleId: rule,
        severity,
        confidence: "low",
        validationStatus: "unverified",
        summary,
        locations: [{ file: path.relative(root, file), line }],
        evidence: [{ type: "source", value: redact(evidence.slice(0, 500)) }],
        dedupeKey: `static:${path.relative(root, file)}:${line}:${rule}`,
        suggestedFix:
          rule === "MISSING_COMPONENT"
            ? "Resolve the import or correct its path."
            : rule === "GOD_COMPONENT"
              ? "Review whether this function or file has unrelated responsibilities and split where appropriate."
              : "Check ownership and lifecycle; close or remove the resource when its owner ends.",
      }),
    );
  for (const file of files) {
    if ((await stat(file)).size > 150000) continue;
    const text = await readFile(file, "utf8");
    const lines = text.split("\n");
    if (file.endsWith(".py")) {
      if (/\bopen\(/.test(text) && !/(with\s+open\(|\.close\()/.test(text))
        report(
          file,
          Math.max(1, lines.findIndex((l) => /\bopen\(/.test(l)) + 1),
          "UNCLOSED_RESOURCE",
          "Possible file handle without cleanup",
          "A file-open operation has no visible managed context or close in this file.",
          lines.find((l) => /\bopen\(/.test(l)) || "",
        );
      continue;
    }
    const tree = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    async function inspect(node: ts.Node): Promise<void> {
      const line =
        tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1;
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const spec = node.moduleSpecifier.text;
        if (spec.startsWith(".") || spec.startsWith("@/")) {
          const base = spec.startsWith("@/")
            ? path.join(root, spec.slice(2))
            : path.resolve(path.dirname(file), spec);
          const candidates = [
            base,
            ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"].map(
              (ext) => base + ext,
            ),
            ...["index.ts", "index.tsx", "index.js"].map((n) =>
              path.join(base, n),
            ),
            base.replace(/\.js$/, ".ts"),
          ];
          const exists = (
            await Promise.all(
              candidates.map(async (p) => {
                try {
                  return (await stat(p)).isFile();
                } catch {
                  return false;
                }
              }),
            )
          ).some(Boolean);
          if (!exists)
            report(
              file,
              line,
              "MISSING_COMPONENT",
              `Possible unresolved import: ${spec}`,
              "No matching source file was found using relative and @/ root resolution. Custom aliases and generated modules require review.",
              node.getText(tree),
              "medium",
            );
        }
      }
      if (
        ts.isCallExpression(node) &&
        node.expression.getText(tree) === "useEffect"
      ) {
        const body = node.arguments[0]?.getText(tree) || "";
        const pairs = [
          ["addEventListener", "removeEventListener"],
          ["setInterval", "clearInterval"],
          ["subscribe", "unsubscribe"],
        ];
        for (const [open, close] of pairs)
          if (body.includes(open + "(") && !body.includes(close))
            report(
              file,
              line,
              "LISTENER_LEAK",
              `Possible missing ${close} in effect`,
              `${open} appears inside an effect without ${close} in that effect.`,
              body,
              "medium",
            );
      }
      if (
        ts.isNewExpression(node) &&
        node.expression.getText(tree) === "WebSocket" &&
        !text.includes(".close(")
      )
        report(
          file,
          line,
          "UNCLOSED_RESOURCE",
          "Possible WebSocket without cleanup",
          "A WebSocket is created with no visible close in this file.",
          node.getText(tree),
          "medium",
        );
      for (const child of node.getChildren(tree)) await inspect(child);
    }
    await inspect(tree);
  }
  return { findings, count: files.length, capped };
}
