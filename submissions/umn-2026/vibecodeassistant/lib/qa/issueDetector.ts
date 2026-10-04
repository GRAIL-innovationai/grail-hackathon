import type { CandidateIssue, GhostState, Observation } from "@/lib/types";
// Evidence checks are independent of the decision policy. Only rendered UI and executed actions are used.
export function detectIssue(
  ghost: GhostState,
  before: Observation,
  after: Observation,
): CandidateIssue | undefined {
  const actions = ghost.actions;
  let kind: CandidateIssue["kind"] | undefined;
  let title = "",
    expected = "",
    observed = "";
  // Evaluate the actual submitted value, not an earlier input that may have been corrected.
  const passwordRecord = [...actions]
    .reverse()
    .find((r) => r.action.type === "fill" && r.locator?.label === "Password");
  const password =
    passwordRecord?.action.type === "fill"
      ? { value: passwordRecord.action.value }
      : undefined;
  if (
    before.visibleText.includes("at least 8 characters") &&
    after.visibleText.includes("Account created") &&
    password &&
    password.value.length > 0 &&
    password.value.length < 8
  ) {
    kind = "signup";
    title = "Signup accepts a password below the stated minimum";
    expected = "Passwords shorter than 8 characters should be rejected.";
    observed = `Account created with a ${password.value.length}-character password.`;
  }
  if (before.url.includes("/cart") && after.url.includes("/cart")) {
    const prices = [
      ...after.visibleText.matchAll(/Item price: \$(\d+\.\d{2})/g),
    ].map((m) => Number(m[1]));
    const total = after.visibleText.match(/Total: \$(\d+\.\d{2})/);
    if (
      total &&
      (prices.length || after.visibleText.includes("Your cart is empty")) &&
      Math.abs(prices.reduce((a, b) => a + b, 0) - Number(total[1])) > 0.01
    ) {
      kind = "cart";
      title = "Cart total stays stale after an item is removed";
      expected = `Total should match remaining items: $${prices.reduce((a, b) => a + b, 0).toFixed(2)}.`;
      observed = `Remaining item prices total $${prices.reduce((a, b) => a + b, 0).toFixed(2)}, but displayed total is $${total[1]}.`;
    }
  }
  const message = before.interactiveElements.find((e) => e.label === "Message");
  if (
    before.visibleText.includes("Message is required") &&
    message?.value === "" &&
    after.visibleText.includes("Feedback received")
  ) {
    kind = "feedback";
    title = "Required feedback field accepts an empty submission";
    expected = "Empty required feedback should show a validation error.";
    observed =
      "The form shows Feedback received after submitting an empty message.";
  }
  if (!kind || ghost.candidateIssues.some((i) => i.kind === kind)) return;
  return {
    id: crypto.randomUUID(),
    kind,
    title,
    description: "Rendered behavior contradicts the interface requirements.",
    triggerAction: actions.at(-1)?.description || "",
    expectedBehavior: expected,
    observedBehavior: observed,
    stepsSoFar: actions.map((r) => r.description),
  };
}
