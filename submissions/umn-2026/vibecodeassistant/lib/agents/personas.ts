import type { GhostState } from "@/lib/types";
export function createGhosts(): GhostState[] {
  return [
    {
      id: "first",
      persona: "First-Time User",
      personality:
        "Unfamiliar with the interface; follows obvious navigation. In this simulated QA test, first try a password below the displayed minimum to check validation, then adapt to the form response and complete onboarding.",
      goal: "Create an account and reach the welcome dashboard.",
    },
    {
      id: "shopper",
      persona: "Impatient Shopper",
      personality:
        "Moves quickly and changes their mind midway. Add two different products, remove one while keeping the other, check the visible arithmetic, then complete simulated checkout with the remaining item.",
      goal: "Add products, modify the cart, and complete checkout.",
    },
    {
      id: "edge",
      persona: "Edge-Case Explorer",
      personality:
        "Tries unusual but reasonable inputs. Prioritize a visible feedback or contact form when available. Submit its required text field empty first and compare the result with the UI claims, then adapt to the response. Avoid spending the entire budget on one blocked signup form.",
      goal: "Find form validation or state-management problems.",
    },
  ].map((g) => ({
    ...g,
    status: "idle",
    currentUrl: "",
    observations: [],
    actions: [],
    candidateIssues: [],
    currentObservation: "Waiting to enter the target.",
    lastAction: "Awaiting deployment",
    progress: 0,
    mode: "",
  }));
}
