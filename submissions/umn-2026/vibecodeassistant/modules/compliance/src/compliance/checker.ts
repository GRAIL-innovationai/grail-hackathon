import { complianceRules } from "./rules.js";
import type { ComplianceCheckResult, ComplianceSignal } from "./types.js";

export function runComplianceChecks(signal: ComplianceSignal): ComplianceCheckResult {
  const findings = complianceRules.map((rule) => rule.evaluate(signal));
  const passedChecks = findings.filter((finding) => finding.passed).length;
  const failedChecks = findings.length - passedChecks;

  return {
    findings,
    summary: {
      totalChecks: findings.length,
      passedChecks,
      failedChecks
    }
  };
}
