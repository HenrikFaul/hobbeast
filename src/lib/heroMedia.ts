import dayPoster from "@/assets/hero-community-v2.webp";
import dayPosterFallback from "@/assets/hero-community.jpg";
import dayPosterMobile from "@/assets/editorial/hero-community-day-mobile.webp";
import nightPoster from "@/assets/editorial/hero-budapest-night.webp";
import nightPosterFallback from "@/assets/editorial/hero-budapest-night.jpg";
import nightPosterMobile from "@/assets/editorial/hero-budapest-night-mobile.webp";

export type HeroVariantKey = "day" | "night";

type HeroVideoModule = { default: string };

export interface HeroMediaVariant {
  key: HeroVariantKey;
  kicker: string;
  poster: string;
  posterFallback: string;
  posterMobile: string;
  posterAlt: string;
  objectPosition: string;
  loadVideo: () => Promise<HeroVideoModule>;
}

export const HERO_MEDIA_VARIANTS: Record<HeroVariantKey, HeroMediaVariant> = {
  day: {
    key: "day",
    kicker: "Budapest · együtt úton",
    poster: dayPoster,
    posterFallback: dayPosterFallback,
    posterMobile: dayPosterMobile,
    posterAlt: "Baráti társaság együtt nevet egy napfényes szabadtéri programon",
    objectPosition: "object-[54%_center] sm:object-[52%_center] lg:object-center",
    loadVideo: () => import("@/assets/editorial/hero-together-day.mp4"),
  },
  night: {
    key: "night",
    kicker: "Budapest · közösség élőben",
    poster: nightPoster,
    posterFallback: nightPosterFallback,
    posterMobile: nightPosterMobile,
    posterAlt: "Barátok nevetnek egy budapesti nyári estén az óriáskerék fényei előtt",
    objectPosition: "object-[64%_center] sm:object-[61%_center] lg:object-center",
    loadVideo: () => import("@/assets/editorial/hero-together-night.mp4"),
  },
};

const seasonForMonth = (month: number) => {
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "autumn";
};

const daylightWindow = {
  winter: { start: 8, end: 16 },
  spring: { start: 7, end: 19 },
  summer: { start: 6, end: 21 },
  autumn: { start: 7, end: 18 },
} as const;

export const selectHeroVariant = (date: Date, randomValue: number): HeroVariantKey => {
  const season = seasonForMonth(date.getMonth());
  const daylight = daylightWindow[season];
  const preferred: HeroVariantKey = date.getHours() >= daylight.start && date.getHours() < daylight.end
    ? "day"
    : "night";

  // A small editorial variation keeps both loved scenes in circulation without
  // turning the hero into a distracting carousel.
  return randomValue < 0.16 ? (preferred === "day" ? "night" : "day") : preferred;
};

export const getSessionHeroVariant = (): HeroVariantKey => {
  const now = new Date();
  const key = `hobbeast.hero.${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

  try {
    const stored = window.sessionStorage.getItem(key);
    if (stored === "day" || stored === "night") return stored;

    const selected = selectHeroVariant(now, Math.random());
    window.sessionStorage.setItem(key, selected);
    return selected;
  } catch {
    return selectHeroVariant(now, Math.random());
  }
};
