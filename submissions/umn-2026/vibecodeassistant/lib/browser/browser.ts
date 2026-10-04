import { chromium, type BrowserContext } from "playwright";
import type { RunState } from "@/lib/types";
import { validateTarget, localHost, riskyAction } from "@/lib/security/target";
export function launchBrowser(watch = false) {
  return chromium.launch({ headless: !watch, slowMo: watch ? 100 : 0 });
}
export async function confineToDemo(context: BrowserContext, target: string) {
  const origin = new URL(target).origin;
  await context.route("**/*", (route) => {
    const u = new URL(route.request().url());
    return u.origin === origin &&
      (u.pathname === "/demo" ||
        u.pathname.startsWith("/demo/") ||
        u.pathname.startsWith("/_next/"))
      ? route.continue()
      : route.abort();
  });
}
export async function confineToTarget(
  context: BrowserContext,
  run: Pick<RunState, "profile" | "target" | "allowForms">,
) {
  if (run.profile === "demo") return confineToDemo(context, run.target);
  const target = new URL(run.target);
  const approved = new Map<string, number>();
  await context.route("**/*", async (route) => {
    const req = route.request();
    try {
      const u = new URL(req.url());
      if (!["http:", "https:"].includes(u.protocol)) return route.abort();
      if (req.isNavigationRequest() && u.origin !== target.origin)
        return route.abort();
      if (riskyAction.test(u.pathname + u.search)) return route.abort();
      if (
        !["GET", "HEAD", "OPTIONS"].includes(req.method()) &&
        !(
          run.allowForms &&
          req.method() === "POST" &&
          u.origin === target.origin
        )
      )
        return route.abort();
      if (localHost(u.hostname) && u.origin !== target.origin)
        return route.abort();
      if (
        !approved.has(u.origin) ||
        Date.now() - approved.get(u.origin)! > 10000
      ) {
        await validateTarget(u.href);
        approved.set(u.origin, Date.now());
      }
      return route.continue();
    } catch {
      return route.abort();
    }
  });
  // WebSocket messages could mutate state without passing the HTTP method guard.
  await context.routeWebSocket("**/*", (ws) =>
    ws.close({
      code: 1008,
      reason: "Website audit does not permit WebSocket writes.",
    }),
  );
}
