import animals from "@/assets/stock/categories/animals.webp";
import boardGames from "@/assets/stock/categories/board-games.webp";
import creative from "@/assets/stock/categories/creative.webp";
import dance from "@/assets/stock/categories/dance.webp";
import extreme from "@/assets/stock/categories/extreme.webp";
import fashion from "@/assets/stock/categories/fashion.webp";
import gaming from "@/assets/stock/categories/gaming.webp";
import gastronomy from "@/assets/stock/categories/gastronomy.webp";
import learning from "@/assets/stock/categories/learning.webp";
import music from "@/assets/stock/categories/music.webp";
import nature from "@/assets/stock/categories/nature.webp";
import performingArts from "@/assets/stock/categories/performing-arts.webp";
import photoFilm from "@/assets/stock/categories/photo-film.webp";
import sport from "@/assets/stock/categories/sport.webp";
import tech from "@/assets/stock/categories/tech.webp";
import travel from "@/assets/stock/categories/travel.webp";
import volunteering from "@/assets/stock/categories/volunteering.webp";

export interface CategoryVisual {
  src: string;
  position?: string;
}

export const CATEGORY_VISUALS: Record<string, CategoryVisual> = {
  sport: { src: sport },
  extreme: { src: extreme },
  nature: { src: nature, position: "center 38%" },
  creative: { src: creative },
  music: { src: music },
  dance: { src: dance },
  "board-games": { src: boardGames },
  gaming: { src: gaming },
  gastronomy: { src: gastronomy },
  "photo-film": { src: photoFilm },
  tech: { src: tech },
  learning: { src: learning },
  animals: { src: animals },
  travel: { src: travel },
  fashion: { src: fashion },
  volunteering: { src: volunteering },
  "performing-arts": { src: performingArts },
};
