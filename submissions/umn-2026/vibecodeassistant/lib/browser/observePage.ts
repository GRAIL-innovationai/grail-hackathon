import type { Page } from "playwright";
import type { Observation } from "@/lib/types";
import { redact } from "@/lib/security/redact";
export async function observePage(page: Page): Promise<Observation> {
  const observation = await page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=tab]",
      ),
    );
    const banner = document.getElementById("ghostqa-watch-banner");
    const bannerDisplay = banner?.style.display;
    if (banner) banner.style.display = "none";
    const visibleText = (
      document.querySelector("main")?.innerText || document.body.innerText
    ).slice(0, 6500);
    if (banner) banner.style.display = bannerDisplay || "";
    const interactiveElements = elements
      .filter(
        (el) =>
          !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
      )
      .slice(0, 100)
      .map((el, i) => {
        const id = `el-${i + 1}`;
        el.setAttribute("data-ghost-id", id);
        const input = el as HTMLInputElement;
        const form = el.closest("form");
        const label =
          el.getAttribute("aria-label") ||
          Array.from(document.querySelectorAll("label"))
            .find((l) => l.htmlFor === el.id)
            ?.textContent?.trim() ||
          el.closest("label")?.textContent?.trim() ||
          el.getAttribute("placeholder") ||
          el.getAttribute("name") ||
          "";
        return {
          id,
          role:
            el.tagName === "A"
              ? "link"
              : el.tagName === "BUTTON" ||
                  ["button", "tab"].includes(el.getAttribute("role") || "")
                ? "button"
                : el.tagName === "SELECT"
                  ? "select"
                  : "textbox",
          text:
            input.type === "password"
              ? ""
              : el.textContent?.trim().slice(0, 100) ||
                el.getAttribute("value") ||
                "",
          label,
          value:
            input.type === "password" && input.value
              ? "[PASSWORD]"
              : (input.value || "").slice(0, 2000),
          href: el instanceof HTMLAnchorElement ? el.href : undefined,
          inputType: input.type || "",
          required: input.required || false,
          disabled:
            input.disabled || el.getAttribute("aria-disabled") === "true",
          inForm: !!form,
          formText: form?.innerText.slice(0, 500) || "",
          formMethod: form?.method || "",
          formAction: form?.action || "",
        };
      });
    return {
      url: location.href,
      pageTitle: document.title,
      visibleText,
      interactiveElements,
    };
  });
  observation.visibleText = redact(observation.visibleText);
  observation.url = redact(observation.url);
  observation.pageTitle = redact(observation.pageTitle);
  observation.interactiveElements = observation.interactiveElements.map(
    (el) => ({
      ...el,
      text: redact(el.text),
      label: redact(el.label),
      value: redact(el.value),
      href: el.href ? redact(el.href) : undefined,
      formText: redact(el.formText),
      formAction: redact(el.formAction),
    }),
  );
  return observation;
}
