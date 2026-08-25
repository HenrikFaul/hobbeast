export type MarketingCopyStatus = "canonical" | "eligible" | "archived" | "blocked";

export type MarketingCopySlot =
  | "home-cta"
  | "explore-hero"
  | "about-cta"
  | "about-vision"
  | "features-explore-link"
  | "auth-intro";

export interface MarketingCopyVariant {
  id: string;
  slot: MarketingCopySlot;
  status: MarketingCopyStatus;
  eyebrow: string;
  heading: string;
  headingLead?: string;
  headingAccent?: string;
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
    id: "about-cta-bring-what-you-love",
    slot: "about-cta",
    status: "canonical",
    eyebrow: "Megosztás",
    heading: "Hozd közénk, amit szeretsz",
    body: "A meglévő szenvedélyed éppúgy közös élmény lehet, mint valami új kipróbálása.",
    statusReason: "A hobbi megtalálása helyett a megosztást és a közös megélést teszi elsődlegessé.",
  },
  {
    id: "about-cta-find-a-hobby",
    slot: "about-cta",
    status: "eligible",
    eyebrow: "Felfedezés",
    heading: "Találj egy hobbit",
    body: "A korábbi rövid CTA későbbi szerkesztői felhasználásra megőrizve.",
    statusReason: "Korábbi működő CTA; nem törölhető, de már nem az elsődleges márkaígéret.",
  },
  {
    id: "about-vision-share-and-try-together",
    slot: "about-vision",
    status: "canonical",
    eyebrow: "Víziónk",
    heading: "Amit szeretünk, együtt többet ér.",
    body: "Egy világ, ahol bárki megoszthatja, amit szeret, társakat találhat hozzá, és másoktól kíváncsian kipróbálhat valami újat — legyen szó sportról, művészetről vagy kalandról.",
    statusReason: "Megőrzi az új élmények lehetőségét, de a közös megosztást teszi a vízió középpontjába.",
  },
  {
    id: "about-vision-find-partner-for-new-hobby",
    slot: "about-vision",
    status: "eligible",
    eyebrow: "Víziónk",
    heading: "Találj társat egy új hobbihoz.",
    body: "Egy világ, ahol bárki könnyedén talál társat egy új hobbi kipróbálásához, legyen szó sportról, művészetről vagy kalandról.",
    statusReason: "Korábbi víziószöveg változtatás nélkül megőrizve.",
  },
  {
    id: "features-explore-share-or-try",
    slot: "features-explore-link",
    status: "canonical",
    eyebrow: "Közös élmény",
    heading: "Mutasd meg, vagy próbáld ki együtt",
    body: "A katalógus megmarad, de nem önismereti hobbi-tesztként pozicionáljuk.",
    statusReason: "A megosztás és a közös kipróbálás kettős belépési pontját teszi láthatóvá.",
  },
  {
    id: "features-explore-all-hobbies",
    slot: "features-explore-link",
    status: "eligible",
    eyebrow: "Felfedezés",
    heading: "Fedezd fel az összes hobbit",
    body: "Korábbi katalógus CTA változtatás nélkül megőrizve.",
    statusReason: "Hasznos discovery-változat, de már nem kizárólagos márkaüzenet.",
  },
  {
    id: "auth-intro-bring-your-enthusiasm",
    slot: "auth-intro",
    status: "canonical",
    eyebrow: "Az új kedvenc társaságod itt kezdődik",
    heading: "Találd meg a te embereidet.",
    body: "Hozd magaddal, ami lelkesít, kapcsolódj helyi közösségekhez, és osszatok meg valódi programokat és élményeket.",
    statusReason: "A belépést közösségi részvételként, nem puszta hobby-discoveryként keretezi.",
  },
  {
    id: "auth-intro-discover-hobby-communities",
    slot: "auth-intro",
    status: "eligible",
    eyebrow: "Az új kedvenc társaságod itt kezdődik",
    heading: "Találd meg a te embereidet.",
    body: "Fedezd fel a hobbi közösségeket a közeledben, szervezz programokat és találj barátokat.",
    statusReason: "Korábbi belépőszöveg változtatás nélkül megőrizve.",
  },
  {
    id: "explore-hero-bring-it-to-us",
    slot: "explore-hero",
    status: "canonical",
    eyebrow: "A hobbidból közös történet lesz",
    heading: "Amit szeretsz, hozd közénk.",
    headingLead: "Amit szeretsz,",
    headingAccent: "hozd közénk.",
    body: "Mutasd meg másoknak, miért lelkesít, vagy csatlakozz kíváncsian egy új élményhez. Tanuljunk, játsszunk, alkossunk és fejlődjünk együtt.",
    statusReason: "A megosztást és a közös élményt teszi elsődlegessé az önismereti felfedezés helyett.",
  },
  {
    id: "explore-hero-discover-your-hobby",
    slot: "explore-hero",
    status: "eligible",
    eyebrow: "Közös érdeklődésből valódi élmény",
    heading: "Fedezd fel a hobbidat",
    headingLead: "Fedezd fel a",
    headingAccent: "hobbidat",
    body: "Válassz kategóriát, és találd meg azokat az embereket, akikkel közös a szenvedélyed.",
    statusReason: "Korábbi, márkahű Explore hero; megőrzendő későbbi szerkesztői döntéshez.",
  },
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
export const EXPLORE_HERO_COPY = getCanonicalMarketingCopy("explore-hero");
export const ABOUT_CTA_COPY = getCanonicalMarketingCopy("about-cta");
export const ABOUT_VISION_COPY = getCanonicalMarketingCopy("about-vision");
export const FEATURES_EXPLORE_COPY = getCanonicalMarketingCopy("features-explore-link");
export const AUTH_INTRO_COPY = getCanonicalMarketingCopy("auth-intro");
