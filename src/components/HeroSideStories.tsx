import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import climbingFriends from "@/assets/stock/categories/extreme.webp";
import gamingFriends from "@/assets/stock/categories/gaming.webp";

const HeroSideStories = () => (
  <div aria-label="Gyors aktivitásötletek" className="pointer-events-none absolute inset-0 z-10 hidden min-[1820px]:block">
    <Link
      to="/events?q=mászás&mode=search"
      className="pointer-events-auto absolute left-4 w-40 -rotate-3 overflow-hidden border border-white/70 bg-card p-2 transition-transform hover:-translate-y-1 hover:-rotate-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ top: "15rem", borderRadius: "1.6rem", boxShadow: "0 24px 60px -34px rgba(24,49,36,0.72)" }}
      aria-label="Mászós és túrás programok felfedezése"
    >
      <img src={climbingFriends} alt="" width={720} height={480} className="h-36 w-full object-cover" style={{ borderRadius: "1.15rem" }} />
      <span className="flex items-center justify-between gap-2 px-2 pb-2 pt-3 text-xs font-extrabold text-foreground">
        Mászás · túra
        <ArrowUpRight size={14} aria-hidden="true" />
      </span>
    </Link>

    <div aria-hidden="true" className="absolute left-12 rotate-6 rounded-full border-2 border-[#183124] bg-[#dfff62] px-4 py-2 text-xs font-extrabold text-[#183124] shadow-lg" style={{ bottom: "8.5rem" }}>
      ☮ együtt jobb
    </div>

    <Link
      to="/events?q=gaming&mode=search"
      className="pointer-events-auto absolute right-4 w-40 rotate-3 overflow-hidden border border-white/70 bg-card p-2 transition-transform hover:-translate-y-1 hover:rotate-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      style={{ top: "27rem", borderRadius: "1.6rem", boxShadow: "0 24px 60px -34px rgba(37,27,67,0.72)" }}
      aria-label="Közös gaming és konzolos programok felfedezése"
    >
      <img src={gamingFriends} alt="" width={720} height={480} className="h-36 w-full object-cover" style={{ borderRadius: "1.15rem" }} />
      <span className="flex items-center justify-between gap-2 px-2 pb-2 pt-3 text-xs font-extrabold text-foreground">
        Közös game night
        <ArrowUpRight size={14} aria-hidden="true" />
      </span>
    </Link>
  </div>
);

export default HeroSideStories;
