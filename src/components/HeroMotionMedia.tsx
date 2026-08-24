import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import heroPoster from "@/assets/editorial/hero-budapest-night.webp";
import heroPosterFallback from "@/assets/editorial/hero-budapest-night.jpg";
import heroPosterMobile from "@/assets/editorial/hero-budapest-night-mobile.webp";

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface HeroMotionMediaProps {
  reduceMotion: boolean;
}

const HeroMotionMedia = ({ reduceMotion }: HeroMotionMediaProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const [posterReady, setPosterReady] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [sources, setSources] = useState<{ webm: string; mp4: string } | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [paused, setPaused] = useState(false);

  const playWhenAllowed = useCallback(() => {
    const video = videoRef.current;
    if (!video || userPausedRef.current || document.hidden) return;
    void video.play().catch(() => setPaused(true));
  }, []);

  useEffect(() => {
    setEligible(false);
    setMediaReady(false);
    setVideoFailed(false);
    setSources(null);
    userPausedRef.current = false;

    if (!posterReady || reduceMotion || window.matchMedia("(max-width: 767px)").matches) return;

    const connection = (navigator as NavigatorWithConnection).connection;
    if (connection?.saveData || connection?.effectiveType?.includes("2g")) return;

    const idleWindow = window as WindowWithIdleCallback;
    if (idleWindow.requestIdleCallback) {
      const idleHandle = idleWindow.requestIdleCallback(() => setEligible(true), { timeout: 900 });
      return () => idleWindow.cancelIdleCallback?.(idleHandle);
    }

    const timer = window.setTimeout(() => setEligible(true), 450);
    return () => window.clearTimeout(timer);
  }, [posterReady, reduceMotion]);

  useEffect(() => {
    if (!eligible) return;

    let cancelled = false;
    void Promise.all([
      import("@/assets/editorial/hero-budapest-night-motion.webm"),
      import("@/assets/editorial/hero-budapest-night-motion.mp4"),
    ]).then(([webm, mp4]) => {
      if (!cancelled) setSources({ webm: webm.default, mp4: mp4.default });
    }).catch(() => {
      if (!cancelled) setVideoFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [eligible]);

  useEffect(() => {
    const video = videoRef.current;
    if (!eligible || !video) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
      } else {
        playWhenAllowed();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) playWhenAllowed();
        else video.pause();
      },
      { threshold: 0.3 },
    );

    observer.observe(video);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [eligible, playWhenAllowed]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      userPausedRef.current = false;
      void video.play().catch(() => setPaused(true));
    } else {
      userPausedRef.current = true;
      video.pause();
    }
  };

  return (
    <>
      <picture className="absolute inset-0" data-testid="hero-poster">
        <source media="(max-width: 767px)" srcSet={heroPosterMobile} type="image/webp" />
        <source srcSet={heroPoster} type="image/webp" />
        <img
          src={heroPosterFallback}
          alt="Barátok nevetnek egy budapesti nyári estén az óriáskerék fényei előtt"
          width={1672}
          height={941}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onLoad={() => setPosterReady(true)}
          className="h-full w-full object-cover object-[64%_center] sm:object-[61%_center] lg:object-center"
        />
      </picture>

      {eligible && sources && !videoFailed && (
        <video
          ref={videoRef}
          data-testid="hero-motion-video"
          aria-hidden="true"
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          poster={heroPoster}
          onLoadedData={() => {
            setMediaReady(true);
            playWhenAllowed();
          }}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onError={() => setVideoFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${mediaReady ? "opacity-100" : "opacity-0"}`}
        >
          <source src={sources.webm} type="video/webm" />
          <source src={sources.mp4} type="video/mp4" />
        </video>
      )}

      {eligible && mediaReady && !videoFailed && (
        <button
          type="button"
          data-testid="hero-motion-toggle"
          aria-label={paused ? "Háttérvideó lejátszása" : "Háttérvideó szüneteltetése"}
          aria-pressed={paused}
          onClick={togglePlayback}
          className="absolute right-5 top-5 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white shadow-lg backdrop-blur-md transition-colors hover:bg-black/65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfff62] focus-visible:ring-offset-2 focus-visible:ring-offset-[#12251c] sm:right-7 sm:top-7"
        >
          {paused ? <Play size={17} fill="currentColor" aria-hidden="true" /> : <Pause size={17} fill="currentColor" aria-hidden="true" />}
        </button>
      )}
    </>
  );
};

export default HeroMotionMedia;
