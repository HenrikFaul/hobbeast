import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import climbingFriends from "@/assets/stock/categories/extreme.webp";
import gamingFriends from "@/assets/stock/categories/gaming.webp";

const HeroSideStories = () => (
  <div aria-label="Gyors aktivitásötletek" className="pointer-events-none absolute inset-0 z-10 hidden min-[1820px]:block">
    <Link
      to="/events?q=mászás&mode=search"
      className="pointer-events-auto absolute left-4 top-[15rem] w-40 -rotate-3 overflow-hidden rounded-[1.6rem] border border-white/70 bg-card p-2 shadow-[0_24px_60px_-34px_rgba(24,49,36,0.72)] transition-transform hover:-translate-y-1 hover:rotate-[-1deg] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label="Mászós és túrás programok felfedezése"
    >
      <img src={climbingFriends} alt="" width={720} height={480} className="h-36 w-full rounded-[1.15rem] object-cover" />
      <span className="flex items-center justify-between gap-2 px-2 pb-2 pt-3 text-xs font-extrabold text-foreground">
        Mászás · túra
        <ArrowUpRight size={14} aria-hidden="true" />
      </span>
    </Link>

    <div aria-hidden="true" className="absolute bottom-[8.5rem] left-12 rotate-6 rounded-full border-2 border-[#183124] bg-[#dfff62] px-4 py-2 text-xs font-extrabold text-[#183124] shadow-lg">
      ☮ együtt jobb
    </div>

    <Link
      to="/events?q=gaming&mode=search"
      className="pointer-events-auto absolute right-4 top-[27rem] w-40 rotate-3 overflow-hidden rounded-[1.6rem] border border-white/70 bg-card p-2 shadow-[0_24px_60px_-34px_rgba(37,27,67,0.72)] transition-transform hover:-translate-y-1 hover:rotate-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label="Közös gaming és konzolos programok felfedezése"
    >
      <img src={gamingFriends} alt="" width={720} height={480} className="h-36 w-full rounded-[1.15rem] object-cover" />
      <span className="flex items-center justify-between gap-2 px-2 pb-2 pt-3 text-xs font-extrabold text-foreground">
        Közös game night
        <ArrowUpRight size={14} aria-hidden="true" />
      </span>
    </Link>
  </div>
);

export default HeroSideStories;
