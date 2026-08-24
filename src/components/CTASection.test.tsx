import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOME_CTA_COPY, HOME_MARKETING_CONTRACT } from "@/content/marketingCopy";

const routerMocks = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => routerMocks.navigate };
});

import CTASection from "@/components/CTASection";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  routerMocks.navigate.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function button(accessibleName: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((candidate) => candidate.textContent?.trim() === accessibleName);
}

describe("CTASection", () => {
  it("renders only the canonical copy while keeping action names and routes stable", () => {
    act(() => root.render(<CTASection />));

    expect(container.querySelector("h2")?.textContent).toBe(HOME_CTA_COPY.heading);
    expect(container.textContent).toContain(HOME_CTA_COPY.eyebrow);
    expect(container.textContent).toContain(HOME_CTA_COPY.body);

    const primary = button(HOME_MARKETING_CONTRACT.cta.primaryAction.accessibleName);
    const secondary = button(HOME_MARKETING_CONTRACT.cta.secondaryAction.accessibleName);
    expect(primary).toBeDefined();
    expect(secondary).toBeDefined();

    act(() => primary?.click());
    expect(routerMocks.navigate).toHaveBeenLastCalledWith(HOME_MARKETING_CONTRACT.cta.primaryAction.route);

    act(() => secondary?.click());
    expect(routerMocks.navigate).toHaveBeenLastCalledWith(HOME_MARKETING_CONTRACT.cta.secondaryAction.route);
  });
});
