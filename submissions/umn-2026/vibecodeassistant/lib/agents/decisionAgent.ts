import { hasModelCredentials, providerConfig } from "@/lib/agents/provider";
import { z } from "zod";
import {
  actionSchema,
  type AgentAction,
  type GhostState,
  type Observation,
} from "@/lib/types";
import { demoPrompt } from "./prompts";
import { modelCall } from "./model";
const responseSchema = z.object({ action: actionSchema });
// Deterministic, observation-driven fallback. This chooses actions, never synthesizes reports.
export function demoDecision(g: GhostState, o: Observation): AgentAction {
  const click = (text: string, reasoningSummary: string): AgentAction => {
    const aliases: Record<string, string[]> = {
      "Create an account →": ["Sign up"],
      "Browse products →": ["Shop & cart"],
      "Send feedback →": ["Feedback"],
    };
    const el =
      o.interactiveElements.find((e) => e.text.includes(text)) ||
      o.interactiveElements.find((e) => aliases[text]?.includes(e.text));
    if (!el) throw new Error(`Cannot find ${text}`);
    return { type: "click", elementId: el.id, reasoningSummary };
  };
  const fill = (
    label: string,
    value: string,
    reasoningSummary: string,
  ): AgentAction => ({
    type: "fill",
    elementId: o.interactiveElements.find((e) => e.label === label)!.id,
    value,
    reasoningSummary,
  });
  if (g.id === "first") {
    if (o.visibleText.includes("Account created"))
      return {
        type: "complete",
        outcome: "Reached the welcome dashboard.",
        reasoningSummary:
          "The account is created and the welcome dashboard is visible.",
      };
    if (!o.url.includes("/signup"))
      return click(
        "Create an account →",
        "Follow the obvious account creation link.",
      );
    if (
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
        o.interactiveElements.find((e) => e.label === "Email")?.value || "",
      )
    )
      return fill("Email", "ghost@example.com", "Enter a valid email address.");
    const typedPassword = [...g.actions]
      .reverse()
      .find((r) => r.action.type === "fill" && r.locator?.label === "Password");
    const passwordValue =
      typedPassword?.action.type === "fill" ? typedPassword.action.value : "";
    if (!passwordValue || passwordValue.length >= 8)
      return fill(
        "Password",
        "abc",
        "Try a short password and see whether the stated minimum is enforced.",
      );
    return click(
      "Create account",
      "Submit the account form and inspect the result.",
    );
  }
  if (g.id === "shopper") {
    if (!o.url.includes("/cart"))
      return click(
        "Browse products →",
        "Open the product collection to build a cart.",
      );
    if (o.visibleText.includes("Order confirmed"))
      return {
        type: "complete",
        outcome: "Checkout completed after modifying cart.",
        reasoningSummary: "The order confirmation is visible.",
      };
    const removed = g.actions.some((r) =>
      r.locator?.text.startsWith("Remove "),
    );
    if (
      removed &&
      o.interactiveElements.some((e) => e.text.startsWith("Remove "))
    )
      return click(
        "Complete checkout",
        "Complete checkout with the remaining item after testing cart changes.",
      );
    if (
      !removed &&
      !o.interactiveElements.some((e) => e.text === "Remove Everyday Notebook")
    )
      return click(
        "Add Everyday Notebook",
        "Add a notebook to start the cart.",
      );
    if (!o.interactiveElements.some((e) => e.text === "Remove Studio Cup"))
      return click(
        "Add Studio Cup",
        "Add a second product before changing the cart.",
      );
    if (!removed)
      return click(
        "Remove Everyday Notebook",
        "Remove one item to verify that the total updates.",
      );
    return click(
      "Complete checkout",
      "Complete checkout with the remaining item.",
    );
  }
  if (o.visibleText.includes("Feedback received"))
    return {
      type: "complete",
      outcome: "Required-field boundary tested.",
      reasoningSummary: "The feedback submission result is visible.",
    };
  if (!o.url.includes("/feedback"))
    return click(
      "Send feedback →",
      "Explore the feedback form and its required fields.",
    );
  if (o.interactiveElements.find((e) => e.label === "Message")?.value)
    return fill(
      "Message",
      "",
      "Clear the required message to test its empty-input boundary.",
    );
  return click(
    "Send feedback",
    "Submit an empty message to verify the required-field rule.",
  );
}

// Demo-only coverage requirements constrain the test goal, never the resulting report.
// Website audit remains unchanged. Interventions are visibly labeled, not attributed to the model.
export function demoCoverageReason(
  g: GhostState,
  o: Observation,
  a: AgentAction,
): string | undefined {
  const completed = o.visibleText.includes(
    g.id === "first"
      ? "Account created"
      : g.id === "shopper"
        ? "Order confirmed"
        : "Feedback received",
  );
  if (completed)
    return a.type === "complete"
      ? undefined
      : "The observed persona goal is complete; finish this ghost’s demo workflow.";
  if (a.type === "complete")
    return "The demo goal has not reached its visible completion state.";
  if (g.actions.length >= 8)
    return "Keep the remaining demo budget focused on the required boundary and completion checks.";
  if (a.type === "investigate")
    return "Evidence is evaluated after every action; continue the required workflow after investigation.";
  if (a.type === "wait" || a.type === "press")
    return "Use an explicit visible control to finish the demo check instead of an ambiguous keyboard or wait action.";
  const el = o.interactiveElements.find((e) => e.id === a.elementId);
  if (!el || el.disabled)
    return "The requested demo control is unavailable or disabled.";
  const route =
    g.id === "first" ? "/signup" : g.id === "shopper" ? "/cart" : "/feedback";
  if (el.href && !new URL(el.href, o.url).pathname.endsWith(route))
    return "Keep this ghost on its assigned demo workflow so each persona’s check is covered.";
  if (g.id === "first") {
    if (
      a.type === "fill" &&
      el.label === "Password" &&
      (!a.value.length || a.value.length >= 8)
    )
      return "Test a password below the displayed minimum before completing signup.";
    if (
      a.type === "fill" &&
      el.label === "Email" &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.value)
    )
      return "Use a valid synthetic email so native email validation does not hide the password check.";
    if (a.type === "click" && el.role === "button") {
      const password = [...g.actions]
        .reverse()
        .find(
          (r) => r.action.type === "fill" && r.locator?.label === "Password",
        );
      if (
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(
          o.interactiveElements.find((e) => e.label === "Email")?.value || "",
        ) ||
        password?.action.type !== "fill" ||
        !password.action.value.length ||
        password.action.value.length >= 8
      )
        return "Complete the valid-email and short-password setup before submitting signup.";
    }
  }
  if (
    g.id === "edge" &&
    a.type === "fill" &&
    el.label === "Message" &&
    a.value !== ""
  )
    return "Exercise the required feedback field’s empty-input boundary before entering a valid message.";
  if (g.id === "shopper" && a.type === "click") {
    const items = o.interactiveElements.filter((e) =>
      e.text.startsWith("Remove "),
    );
    const removed = g.actions.some((r) =>
      r.locator?.text.startsWith("Remove "),
    );
    if (el.text.startsWith("Remove ") && items.length < 2)
      return "Keep one item for checkout and remove only after adding two different products.";
    if (el.text === "Complete checkout" && !removed)
      return "Modify the cart before checkout so its state and arithmetic are exercised.";
  }
  const last = g.actions.at(-1)?.action;
  if (
    last &&
    last.type === a.type &&
    (a.type === "click" || a.type === "fill") &&
    (last.type === "click" || last.type === "fill") &&
    last.elementId === a.elementId &&
    (a.type !== "fill" || last.type !== "fill" || last.value === a.value)
  )
    return "Avoid repeating the same demo action without completing the next coverage step.";
}

export async function decide(
  g: GhostState,
  o: Observation,
): Promise<{ action: AgentAction; mode: string; notice?: string }> {
  if (process.env.DEMO_MODE === "true" || !hasModelCredentials())
    return { action: demoDecision(g, o), mode: "Deterministic demo" };
  if (g.actions.length >= 8)
    return {
      action: demoDecision(g, o),
      mode: "Demo coverage guard",
      notice:
        "Finishing the required demo checks within the bounded action budget.",
    };
  try {
    const result = await modelCall(
      responseSchema,
      "ghost_action",
      demoPrompt,
      {
        persona: g.persona,
        personality: g.personality,
        goal: g.goal,
        allowForms: true,
        observation: o,
        history: g.actions,
        candidates: g.candidateIssues,
        remainingActions: 12 - g.actions.length,
        coverageRequirements:
          "First-time: valid synthetic email, password below the visible minimum, then welcome. Shopper: two products, remove one, then checkout with remaining item. Edge: submit empty required feedback, then inspect the actual response. These are test requirements, not claims of defects.",
      },
      { timeoutMs: 8000 },
    );
    const action = result.action;
    if (
      (action.type === "click" || action.type === "fill") &&
      !o.interactiveElements.some((e) => e.id === action.elementId)
    )
      throw new Error("Invalid element reference");
    const reason = demoCoverageReason(g, o, action);
    if (reason)
      return {
        action: demoDecision(g, o),
        mode: "Demo coverage guard",
        notice: `${reason} This step uses an observation-driven coverage action, not the model proposal.`,
      };
    return { action, mode: `${providerConfig().name} agent` };
  } catch {
    /* Clearly labeled demo fallback. */
  }
  return {
    action: demoDecision(g, o),
    mode: "Deterministic fallback",
    notice:
      "AI response could not be used; using the observation-driven demo policy for this step.",
  };
}
