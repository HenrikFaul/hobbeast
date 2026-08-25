import guitarPoster from "@/assets/editorial/moments/moment-guitar-teaching.webp";
import hikingPoster from "@/assets/editorial/moments/moment-hiking-friends.webp";
import hammockPoster from "@/assets/editorial/moments/moment-reading-hammock.webp";
import singingPoster from "@/assets/editorial/moments/moment-singing-together.webp";

type VideoModule = { default: string };

export interface CommunityMoment {
  key: "guitar" | "hammock" | "singing" | "hiking";
  eyebrow: string;
  title: string;
  copy: string;
  poster: string;
  posterAlt: string;
  accent: string;
  loadVideo: () => Promise<VideoModule>;
}

export const COMMUNITY_MOMENTS: readonly CommunityMoment[] = [
  {
    key: "guitar",
    eyebrow: "Mutass valami újat",
    title: "Egy akkordból közös dal lehet.",
    copy: "Amit tudsz, valakinek épp az első bátor lépése lehet. Taníts, kérdezz, próbáljátok ki együtt.",
    poster: guitarPoster,
    posterAlt: "Két barát egymástól tanul gitározni",
    accent: "#ff8f72",
    loadVideo: () => import("@/assets/editorial/moments/moment-guitar-teaching.mp4"),
  },
  {
    key: "hammock",
    eyebrow: "Lassuljatok le együtt",
    title: "Egy könyv. Két nézőpont. Egy délután.",
    copy: "A kapcsolódás néha nem program, hanem figyelem: leülni egymás mellé, és időt adni a beszélgetésnek.",
    poster: hammockPoster,
    posterAlt: "Barátok olvasnak és beszélgetnek egy függőágy mellett",
    accent: "#dfff62",
    loadVideo: () => import("@/assets/editorial/moments/moment-reading-hammock.mp4"),
  },
  {
    key: "singing",
    eyebrow: "Engedd ki a hangod",
    title: "Néha a legjobb kórus véletlenül alakul.",
    copy: "Nem kell tökéletesnek lennie. Elég egy refrén, egy nevetés és néhány ember, aki marad még egy dalra.",
    poster: singingPoster,
    posterAlt: "Barátok felszabadultan együtt énekelnek",
    accent: "#c9b7ff",
    loadVideo: () => import("@/assets/editorial/moments/moment-singing-together.mp4"),
  },
  {
    key: "hiking",
    eyebrow: "Menjetek egy irányba",
    title: "Az út közben lesztek csapat.",
    copy: "Egy emelkedő, egy megosztott kulacs, egy közös nézőpont — az élmény közelebb hoz, lépésről lépésre.",
    poster: hikingPoster,
    posterAlt: "Barátok együtt túráznak egy erdei ösvényen",
    accent: "#83d6c5",
    loadVideo: () => import("@/assets/editorial/moments/moment-hiking-friends.mp4"),
  },
] as const;

export const selectCommunityMomentIndex = (randomValue: number, count = COMMUNITY_MOMENTS.length) => {
  if (!Number.isFinite(randomValue) || count <= 0) return 0;
  return Math.min(count - 1, Math.floor(Math.max(0, randomValue) * count));
};

export const getSessionCommunityMomentIndex = () => {
  const key = "hobbeast.community-moment.v1";
  try {
    const stored = Number.parseInt(window.sessionStorage.getItem(key) || "", 10);
    if (Number.isInteger(stored) && stored >= 0 && stored < COMMUNITY_MOMENTS.length) return stored;

    const selected = selectCommunityMomentIndex(Math.random());
    window.sessionStorage.setItem(key, String(selected));
    return selected;
  } catch {
    return selectCommunityMomentIndex(Math.random());
  }
};
