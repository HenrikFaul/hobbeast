import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ArrowRight, Pause, Play, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import {
  COMMUNITY_MOMENTS,
  getSessionCommunityMomentIndex,
} from "@/lib/communityMoments";

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean; effectiveType?: string };
};

const CommunityMomentsSection = () => {
  const reduceMotion = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const [momentIndex, setMomentIndex] = useState(getSessionCommunityMomentIndex);
  const [nearViewport, setNearViewport] = useState(false);
  const [videoSource, setVideoSource] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const moment = COMMUNITY_MOMENTS[momentIndex];

  const playWhenAllowed = useCallback(() => {
    const video = videoRef.current;
    if (!video || userPausedRef.current || document.hidden) return;
    void video.play().catch(() => setPaused(true));
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setNearViewport(Boolean(entry?.isIntersecting)), {
      rootMargin: "240px 0px",
      threshold: 0.08,
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setVideoSource(null);
    setVideoReady(false);
    setVideoFailed(false);
    userPausedRef.current = false;
    setPaused(false);

    const connection = (navigator as NavigatorWithConnection).connection;
    if (
      !nearViewport
      || reduceMotion
      || connection?.saveData
      || connection?.effectiveType?.includes("2g")
    ) return;

    let cancelled = false;
    void moment.loadVideo()
      .then((module) => {
        if (!cancelled) setVideoSource(module.default);
      })
      .catch(() => {
        if (!cancelled) setVideoFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [moment, nearViewport, reduceMotion]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handleVisibility = () => document.hidden ? video.pause() : playWhenAllowed();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [playWhenAllowed, videoSource]);

  const chooseNextMoment = () => {
    setMomentIndex((current) => {
      const next = (current + 1) % COMMUNITY_MOMENTS.length;
      try {
        window.sessionStorage.setItem("hobbeast.community-moment.v1", String(next));
      } catch {
        // Session storage is an enhancement; the editorial switch still works without it.
      }
      return next;
    });
  };

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
    <section ref={sectionRef} className="relative overflow-hidden bg-[#fffaf1] py-20 sm:py-24 lg:py-28">
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(255,143,114,0.18),transparent_22rem),radial-gradient(circle_at_92%_80%,rgba(201,183,255,0.24),transparent_24rem)]" />
      <div aria-hidden="true" className="absolute -left-10 top-12 rotate-[-9deg] text-7xl opacity-[0.08] sm:text-9xl">☮</div>

      <div className="container relative mx-auto px-4">
        <div className="mb-9 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-[#183124]/10 bg-white/75 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-[#183124] shadow-sm backdrop-blur">
              <Sparkles size={14} aria-hidden="true" /> Emberi pillanatok
            </p>
            <h2 className="mt-5 max-w-3xl font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.055em] text-[#183124] sm:text-5xl lg:text-6xl">
              Nem kell nagy dolog. <span className="text-[#e86f55]">Csak valódi.</span>
            </h2>
          </div>
          <p className="max-w-xl text-base font-medium leading-relaxed text-[#425247] sm:text-lg">
            Tanítani egy akkordot. Megosztani egy történetet. Együtt elindulni. Ezekből a kis mozdulatokból lesz újra közösség.
          </p>
        </div>

        <article
          className="group relative overflow-hidden rounded-[2.25rem] bg-[#12251c] lg:rounded-[3rem]"
          style={{ minHeight: 610, boxShadow: "0 30px 80px rgba(24,49,36,0.22)" }}
        >
          <img
            key={`${moment.key}-poster`}
            src={moment.poster}
            alt={moment.posterAlt}
            width={960}
            height={540}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-[1.02]"
          />
          {videoSource && !videoFailed && (
            <video
              key={moment.key}
              ref={videoRef}
              aria-hidden="true"
              muted
              loop
              playsInline
              autoPlay
              preload="none"
              poster={moment.poster}
              onLoadedData={() => {
                setVideoReady(true);
                playWhenAllowed();
              }}
              onPlay={() => setPaused(false)}
              onPause={() => setPaused(true)}
              onError={() => setVideoFailed(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${videoReady ? "opacity-100" : "opacity-0"}`}
            >
              <source src={videoSource} type="video/mp4" />
            </video>
          )}

          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: "linear-gradient(90deg,rgba(10,28,19,0.92) 0%,rgba(10,28,19,0.7) 44%,rgba(10,28,19,0.08) 82%),linear-gradient(0deg,rgba(10,28,19,0.7),transparent 55%)" }}
          />

          <div className="relative z-10 flex flex-col justify-between p-6 sm:p-10 lg:p-14" style={{ minHeight: 610 }}>
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex rotate-[-2deg] rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.14em] text-[#183124] shadow-lg" style={{ backgroundColor: moment.accent }}>
                {moment.eyebrow}
              </span>
              {videoReady && !videoFailed && (
                <button
                  type="button"
                  onClick={togglePlayback}
                  aria-label={paused ? "Pillanat lejátszása" : "Pillanat szüneteltetése"}
                  aria-pressed={paused}
                  className="grid h-12 w-12 place-items-center rounded-full border border-white/30 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfff62]"
                >
                  {paused ? <Play size={17} fill="currentColor" aria-hidden="true" /> : <Pause size={17} fill="currentColor" aria-hidden="true" />}
                </button>
              )}
            </div>

            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.6)" }}>Egy történet a sok közül · {momentIndex + 1}/{COMMUNITY_MOMENTS.length}</p>
              <h3 className="font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                {moment.title}
              </h3>
              <p className="mt-5 max-w-xl text-base font-medium leading-relaxed sm:text-lg" style={{ color: "rgba(255,255,255,0.78)" }}>{moment.copy}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link to="/events" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#dfff62] px-6 text-sm font-extrabold text-[#183124] transition-colors hover:bg-[#e8ff91] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
                  Keress közös pillanatot <ArrowRight size={17} aria-hidden="true" />
                </Link>
                <button type="button" onClick={chooseNextMoment} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#dfff62]">
                  <RefreshCw size={16} aria-hidden="true" /> Másik történet
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
};

export default CommunityMomentsSection;
