import type { Page } from "playwright";
import type { AgentAction, Observation, RecordedAction } from "@/lib/types";
export async function executeAction(
  page: Page,
  action: AgentAction,
  observation: Observation,
): Promise<RecordedAction> {
  const record: RecordedAction = {
    action,
    description: action.reasoningSummary,
  };
  if (action.type === "click" || action.type === "fill") {
    const el = observation.interactiveElements.find(
      (e) => e.id === action.elementId,
    );
    if (!el) throw new Error("Unknown element ID");
    record.description =
      action.type === "fill"
        ? `Fill ${el.label || el.text} with ${JSON.stringify(action.value)}.`
        : `Click ${JSON.stringify(el.text || el.label)}.`;
    const matches = observation.interactiveElements.filter(
      (e) => e.text === el.text && e.label === el.label && e.role === el.role,
    );
    record.locator = {
      text: el.text,
      label: el.label,
      role: el.role,
      occurrence: matches.findIndex((e) => e.id === el.id),
    };
    // Refresh the snapshot mapping to survive React hydration and changing DOM IDs.
    const { observePage } = await import("./observePage");
    const fresh = await observePage(page);
    const rebound = fresh.interactiveElements.filter(
      (e) => e.text === el.text && e.label === el.label && e.role === el.role,
    )[record.locator.occurrence];
    if (!rebound)
      throw new Error(
        "Selected element changed before execution; observe again.",
      );
    const locator = page.locator(`[data-ghost-id="${rebound.id}"]`);
    const href = el.role === "link" ? await locator.getAttribute("href") : null;
    if (action.type === "fill")
      await locator.fill(action.value, { timeout: 5000 });
    else await locator.click({ timeout: 5000 });
    if (href && !href.startsWith("#") && !href.startsWith("javascript:"))
      await page
        .waitForURL(new URL(href, observation.url).href, { timeout: 10000 })
        .catch(() => {});
  } else if (action.type === "press") await page.keyboard.press(action.key);
  else if (action.type === "wait") await page.waitForTimeout(500);
  await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await page.waitForLoadState("networkidle", { timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(300);
  return record;
}
export async function replayAction(page: Page, record: RecordedAction) {
  const { observePage } = await import("./observePage");
  const obs = await observePage(page);
  const a = record.action;
  if (a.type === "click" || a.type === "fill") {
    const l = record.locator;
    if (!l) throw new Error("Missing replay locator");
    const el = obs.interactiveElements.filter(
      (e) => e.text === l.text && e.label === l.label && e.role === l.role,
    )[l.occurrence];
    if (!el) throw new Error(`Replay element missing: ${l.label || l.text}`);
    await executeAction(page, { ...a, elementId: el.id }, obs);
  } else if (a.type === "press" || a.type === "wait")
    await executeAction(page, a, obs);
}
