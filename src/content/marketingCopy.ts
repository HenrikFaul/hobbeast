export type MarketingCopyStatus = "canonical" | "eligible" | "archived" | "blocked";

export type MarketingCopySlot = "home-cta";

export interface MarketingCopyVariant {
  id: string;
  slot: MarketingCopySlot;
  status: MarketingCopyStatus;
  eyebrow: string;
  heading: string;
  body: string;
  statusReason: string;
}

/**
 * Copy lifecycle:
 * - canonical: the single variant rendered in production;
 * - eligible: approved copy retained for a future editorial decision or experiment;
 * - archived: intentionally retired, but kept as reusable brand history;
 * - blocked: retained for audit only and must never be rendered.
 */
export const MARKETING_COPY_REGISTRY = [
  {
    id: "home-cta-shared-afternoon",
    slot: "home-cta",
    status: "canonical",
    eyebrow: "Egy közös élménnyel kezdődik",
    heading: "Kezdjük egy közös délutánnal.",
    body: "Hozd, amit szeretsz. Találj valakit, aki kíváncsi rá. Tanuljatok, mozogjatok, alkossatok vagy segítsetek együtt — a saját tempótokban.",
    statusReason: "A jelenlegi, jóváhagyott landing CTA.",
  },
  {
    id: "home-cta-find-people-and-experiences",
    slot: "home-cta",
    status: "eligible",
    eyebrow: "Csatlakozz a közösséghez",
    heading: "Készen állsz, hogy új embereket és közös élményeket találj?",
    body: "Lépj be a Hobbeast világába, ahol a közös hobbi, a programok és az új barátságok egyetlen, jól szervezett helyen találkoznak.",
    statusReason: "Korábbi, továbbra is márkahű változat; nem törölhető felülíráskor.",
  },
  {
    id: "home-cta-community-frequency",
    slot: "home-cta",
    status: "archived",
    eyebrow: "Csatlakozz a közösséghez",
    heading: "Készen állsz arra, hogy a saját közösségi frekvenciádat is bekapcsold?",
    body: "Lépj be a Hobbeast világába, ahol az eseménykeresés, a közösségépítés és a közös élmények egy karakteresebb, modernebb élményben találkoznak.",
    statusReason: "Megőrzött korábbi márkahang; automatikusan nem választható.",
  },
  {
    id: "home-cta-mixed-language-signal",
    slot: "home-cta",
    status: "blocked",
    eyebrow: "Join the signal",
    heading: "Készen állsz arra, hogy a saját közösségi frekvenciádat is bekapcsold?",
    body: "Lépj be a Hobbeast világába, ahol az eseménykeresés, a közösségépítés és a közös élmények egy karakteresebb, modernebb élményben találkoznak.",
    statusReason: "A magyar landing felületen kevert nyelvű, ezért nem renderelhető.",
  },
] as const satisfies readonly MarketingCopyVariant[];

export function getCanonicalMarketingCopy(slot: MarketingCopySlot): MarketingCopyVariant {
  const matches = MARKETING_COPY_REGISTRY.filter(
    (variant) => variant.slot === slot && variant.status === "canonical",
  );

  if (matches.length !== 1) {
    throw new Error(`[MarketingCopy] ${slot} must have exactly one canonical variant.`);
  }

  return matches[0];
}

export function getEligibleMarketingCopy(slot: MarketingCopySlot): readonly MarketingCopyVariant[] {
  return MARKETING_COPY_REGISTRY.filter(
    (variant) => variant.slot === slot && (variant.status === "canonical" || variant.status === "eligible"),
  );
}

export const HOME_MARKETING_CONTRACT = {
  hero: {
    accessibleHeading: "A város tele van közös történetekkel.",
    headingLead: "A város tele van",
    headingAccent: "közös történetekkel.",
  },
  cta: {
    primaryAction: {
      accessibleName: "Ingyenes regisztráció",
      route: "/auth",
    },
    secondaryAction: {
      accessibleName: "Tudj meg többet",
      route: "/about",
    },
  },
} as const;

export const HOME_CTA_COPY = getCanonicalMarketingCopy("home-cta");
