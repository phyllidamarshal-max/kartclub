import { icon } from "./icons.ts";

/** The original RGBA asset is only clipped at its outer transparent margins. */
export function brandLogo() {
  return '<span class="club-logo"><img src="/brand/kart-club-original.png" alt="KART CLUB" width="1254" height="1254"></span>';
}

export function button(
  label: string,
  action: string,
  variant = "primary",
  extra = "",
) {
  return `<button class="button ${variant}" data-action="${action}" ${extra}>${label}</button>`;
}

export function dialog(
  content: string,
  label: string,
  className = "",
  closable = true,
) {
  return `<div class="modal-backdrop"><section class="modal ${className}" role="dialog" aria-modal="true" aria-label="${label}">${closable ? `<button class="modal-close icon-button" data-action="close" aria-label="Close">${icon("close")}</button>` : ""}${content}</section></div>`;
}

let returnFocus: HTMLElement | null = null;
let returnSelector = "";
let isOpen = false;

function focusSelector(element: HTMLElement | null) {
  if (!element) return "";
  for (const name of [
    "data-action",
    "data-track",
    "data-binding",
    "data-page",
  ]) {
    if (element.hasAttribute(name))
      return `[${name}="${CSS.escape(element.getAttribute(name)!)}"]`;
  }
  return element.id ? `#${CSS.escape(element.id)}` : "";
}

export function focusDialog(root: HTMLElement) {
  if (!isOpen) {
    returnFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    returnSelector = focusSelector(returnFocus);
    isOpen = true;
  }
  for (const sibling of root.parentElement?.children ?? []) {
    if (sibling instanceof HTMLElement && sibling !== root)
      sibling.inert = true;
  }
  const panel = root.querySelector<HTMLElement>(".modal");
  panel?.setAttribute("role", "dialog");
  panel?.setAttribute("aria-modal", "true");
  const heading = root.querySelector<HTMLElement>("h2");
  if (heading) {
    if (!panel?.hasAttribute("aria-label"))
      panel?.setAttribute("aria-label", heading.textContent || "KART CLUB");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
}

export async function withPending(
  button: HTMLElement,
  operation: () => Promise<unknown>,
) {
  if (button.getAttribute("aria-busy") === "true") return;
  button.setAttribute("aria-busy", "true");
  if (button instanceof HTMLButtonElement) button.disabled = true;
  try {
    await operation();
  } finally {
    button.removeAttribute("aria-busy");
    if (button instanceof HTMLButtonElement) button.disabled = false;
  }
}

export function releaseDialog(restore = true) {
  for (const element of document.querySelectorAll<HTMLElement>(
    "#app > [inert]",
  ))
    element.inert = false;
  const target = returnFocus?.isConnected
    ? returnFocus
    : returnSelector
      ? document.querySelector<HTMLElement>(returnSelector)
      : null;
  if (restore) target?.focus({ preventScroll: true });
  isOpen = false;
  returnFocus = null;
  returnSelector = "";
}
