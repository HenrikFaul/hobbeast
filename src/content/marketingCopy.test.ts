import { describe, expect, it } from "vitest";
import {
  getCanonicalMarketingCopy,
  getEligibleMarketingCopy,
  ABOUT_CTA_COPY,
  ABOUT_VISION_COPY,
  AUTH_INTRO_COPY,
  EXPLORE_HERO_COPY,
  FEATURES_EXPLORE_COPY,
  HOME_MARKETING_CONTRACT,
  MARKETING_COPY_REGISTRY,
  type MarketingCopyStatus,
} from "@/content/marketingCopy";

describe("marketing copy registry", () => {
  it("keeps exactly one canonical home CTA", () => {
    expect(getCanonicalMarketingCopy("home-cta")).toMatchObject({
      id: "home-cta-shared-afternoon",
      eyebrow: "Egy közös élménnyel kezdődik",
      heading: "Kezdjük egy közös délutánnal.",
    });
    expect(MARKETING_COPY_REGISTRY.filter(
      (variant) => variant.slot === "home-cta" && variant.status === "canonical",
    )).toHaveLength(1);
  });

  it("frames Explore around sharing while preserving the previous approved hero", () => {
    expect(EXPLORE_HERO_COPY).toMatchObject({
      id: "explore-hero-bring-it-to-us",
      heading: "Amit szeretsz, hozd közénk.",
      headingAccent: "hozd közénk.",
    });
    expect(MARKETING_COPY_REGISTRY).toContainEqual(expect.objectContaining({
      id: "explore-hero-discover-your-hobby",
      slot: "explore-hero",
      status: "eligible",
      heading: "Fedezd fel a hobbidat",
    }));
  });

  it("carries the sharing-first direction through key fixed copy without deleting prior variants", () => {
    expect(ABOUT_CTA_COPY.heading).toBe("Hozd közénk, amit szeretsz");
    expect(ABOUT_VISION_COPY.body).toContain("megoszthatja, amit szeret");
    expect(FEATURES_EXPLORE_COPY.heading).toBe("Mutasd meg, vagy próbáld ki együtt");
    expect(AUTH_INTRO_COPY.body).toContain("Hozd magaddal, ami lelkesít");
    expect(getEligibleMarketingCopy("about-cta")).toContainEqual(expect.objectContaining({
      status: "eligible",
      heading: "Találj egy hobbit",
    }));
    expect(getEligibleMarketingCopy("features-explore-link")).toContainEqual(expect.objectContaining({
      status: "eligible",
      heading: "Fedezd fel az összes hobbit",
    }));
  });

  it("preserves the previous approved CTA instead of overwriting it", () => {
    expect(MARKETING_COPY_REGISTRY).toContainEqual(expect.objectContaining({
      id: "home-cta-find-people-and-experiences",
      status: "eligible",
      eyebrow: "Csatlakozz a közösséghez",
      heading: "Készen állsz, hogy új embereket és közös élményeket találj?",
      body: "Lépj be a Hobbeast világába, ahol a közös hobbi, a programok és az új barátságok egyetlen, jól szervezett helyen találkoznak.",
    }));
  });

  it("models every editorial lifecycle state and never returns blocked copy as eligible", () => {
    const statuses = new Set<MarketingCopyStatus>(MARKETING_COPY_REGISTRY.map((variant) => variant.status));
    expect(statuses).toEqual(new Set<MarketingCopyStatus>(["canonical", "eligible", "archived", "blocked"]));
    expect(getEligibleMarketingCopy("home-cta").map((variant) => variant.status)).toEqual([
      "canonical",
      "eligible",
    ]);
    expect(getEligibleMarketingCopy("explore-hero").map((variant) => variant.status)).toEqual([
      "canonical",
      "eligible",
    ]);
  });

  it("locks the home H1 accessible name and CTA route contracts", () => {
    expect(HOME_MARKETING_CONTRACT).toMatchObject({
      hero: { accessibleHeading: "A város tele van közös történetekkel." },
      cta: {
        primaryAction: { accessibleName: "Ingyenes regisztráció", route: "/auth" },
        secondaryAction: { accessibleName: "Tudj meg többet", route: "/about" },
      },
    });
  });
});
