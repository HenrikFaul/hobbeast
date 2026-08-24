import { lazy, Suspense } from "react";
import HeroSection from "@/components/HeroSection";

const HomeBelowFold = lazy(() => import("@/components/HomeBelowFold"));

const Index = () => {
  return (
    <main>
      <HeroSection />
      <Suspense fallback={<div aria-hidden="true" className="min-h-[28rem] bg-[#fffdf7]" />}>
        <HomeBelowFold />
      </Suspense>
    </main>
  );
};

export default Index;
