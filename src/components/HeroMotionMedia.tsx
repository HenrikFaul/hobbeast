import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { HERO_MEDIA_VARIANTS, type HeroVariantKey } from "@/lib/heroMedia";

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
  variant: HeroVariantKey;
}

const HeroMotionMedia = ({ reduceMotion, variant }: HeroMotionMediaProps) => {
  const media = HERO_MEDIA_VARIANTS[variant];
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const [posterReady, setPosterReady] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [source, setSource] = useState<string | null>(null);
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
    setSource(null);
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
  }, [posterReady, reduceMotion, variant]);

  useEffect(() => {
    if (!eligible) return;

    let cancelled = false;
    void media.loadVideo().then((video) => {
      if (!cancelled) setSource(video.default);
    }).catch(() => {
      if (!cancelled) setVideoFailed(true);
    });

    return () => {
      cancelled = true;
    };
  }, [eligible, media]);

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
  }, [eligible, playWhenAllowed, source]);

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
      <picture className="absolute inset-0" data-testid="hero-poster" data-hero-variant={variant}>
        <source media="(max-width: 767px)" srcSet={media.posterMobile} type="image/webp" />
        <source srcSet={media.poster} type="image/webp" />
        <img
          src={media.posterFallback}
          alt={media.posterAlt}
          width={1672}
          height={941}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onLoad={() => setPosterReady(true)}
          className={`h-full w-full object-cover ${media.objectPosition}`}
        />
      </picture>

      {eligible && source && !videoFailed && (
        <video
          ref={videoRef}
          data-testid="hero-motion-video"
          aria-hidden="true"
          muted
          loop
          playsInline
          autoPlay
          preload="none"
          poster={media.poster}
          onLoadedData={() => {
            setMediaReady(true);
            playWhenAllowed();
          }}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onError={() => setVideoFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ${mediaReady ? "opacity-100" : "opacity-0"}`}
        >
          <source src={source} type="video/mp4" />
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
