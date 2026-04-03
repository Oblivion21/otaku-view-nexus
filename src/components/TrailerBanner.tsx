import { useEffect, useMemo, useRef, useState } from 'react';

interface TrailerBannerProps {
  youtubeId: string;
  fallbackYoutubeId?: string | null;
  posterUrl: string | null;
  title?: string;
  height?: string;
}

type YoutubePlayerInstance = {
  destroy?: () => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLIFrameElement,
        options: Record<string, unknown>,
      ) => YoutubePlayerInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeIframeApiPromise: Promise<Window["YT"]> | null = null;

function loadYoutubeIframeApi() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube iframe API requires a browser"));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (youtubeIframeApiPromise) {
    return youtubeIframeApiPromise;
  }

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://www.youtube.com/iframe_api"]',
    );
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();

      if (window.YT?.Player) {
        resolve(window.YT);
        return;
      }

      youtubeIframeApiPromise = null;
      reject(new Error("YouTube iframe API loaded without Player"));
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      youtubeIframeApiPromise = null;
      reject(new Error("Failed to load YouTube iframe API"));
    };
    document.head.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

// Detect if user is on mobile device (phone only, not tablets)
const isMobilePhone = () => {
  const ua = navigator.userAgent;
  // Exclude tablets from mobile detection
  const isTablet = /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(ua.toLowerCase());
  const isMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  return isMobile && !isTablet;
};

export function TrailerBanner({
  youtubeId,
  fallbackYoutubeId = null,
  posterUrl,
  title = "Anime",
  height = '400px',
}: TrailerBannerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [candidateIndex, setCandidateIndex] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<YoutubePlayerInstance | null>(null);
  const candidateYoutubeIds = useMemo(
    () => Array.from(new Set([youtubeId, fallbackYoutubeId].filter(Boolean))) as string[],
    [fallbackYoutubeId, youtubeId],
  );
  const activeYoutubeId = candidateYoutubeIds[candidateIndex] ?? null;
  const candidatesKey = candidateYoutubeIds.join(",");

  useEffect(() => {
    // Detect mobile phone on component mount
    setIsMobile(isMobilePhone());
  }, []);

  useEffect(() => {
    setCandidateIndex(0);
    setIsLoaded(false);
    setHasError(false);
  }, [candidatesKey]);

  useEffect(() => {
    if (isMobile || !activeYoutubeId || hasError || !iframeRef.current) {
      return;
    }

    let isCancelled = false;

    loadYoutubeIframeApi()
      .then((YT) => {
        if (isCancelled || !YT?.Player || !iframeRef.current) {
          return;
        }

        playerRef.current?.destroy?.();
        playerRef.current = new YT.Player(iframeRef.current, {
          events: {
            onReady: () => {
              if (!isCancelled) {
                setIsLoaded(true);
              }
            },
            onError: () => {
              if (isCancelled) {
                return;
              }

              const hasFallback = candidateIndex + 1 < candidateYoutubeIds.length;
              if (hasFallback) {
                setIsLoaded(false);
                setCandidateIndex((currentIndex) => currentIndex + 1);
                return;
              }

              setHasError(true);
            },
          },
        });
      })
      .catch(() => {
        // Keep the regular iframe path working even if the JS API is blocked or unavailable.
      });

    return () => {
      isCancelled = true;
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, [activeYoutubeId, candidateIndex, candidateYoutubeIds.length, hasError, isMobile]);

  // Enhanced URL parameters for better quality and control (desktop/tablet only)
  const origin = typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
  const embedUrl = activeYoutubeId
    ? `https://www.youtube.com/embed/${activeYoutubeId}?autoplay=1&mute=1&controls=0&showinfo=0&modestbranding=1&rel=0&playsinline=1&disablekb=1&fs=0&iv_load_policy=3&loop=1&playlist=${activeYoutubeId}&origin=${origin}&enablejsapi=1`
    : null;

  const handleIframeLoad = () => {
    setIsLoaded(true);
  };

  const handleIframeError = () => {
    const hasFallback = candidateIndex + 1 < candidateYoutubeIds.length;
    if (hasFallback) {
      setIsLoaded(false);
      setCandidateIndex((currentIndex) => currentIndex + 1);
      return;
    }

    setHasError(true);
  };

  return (
    <div className="relative overflow-hidden" style={{ height }}>
      {/* Show poster image on mobile phones or when loading/error on desktop/tablet */}
      {(isMobile || !isLoaded || hasError) && (
        posterUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${posterUrl})` }}
          />
        ) : (
          <div
            aria-label={`${title} banner unavailable`}
            className="absolute inset-0 bg-slate-950"
          />
        )
      )}

      {/* YouTube Player - Desktop and Tablet only (not mobile phones) */}
      {!isMobile && !hasError && embedUrl && (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            ref={iframeRef}
            src={embedUrl}
            allow="autoplay; encrypted-media"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              border: 'none',
              width: '100vw',
              height: '56.25vw', // 16:9 aspect ratio
              minWidth: '177.77vh',
              minHeight: '100vh',
              pointerEvents: 'none',
            }}
            title={`Trailer ${activeYoutubeId}`}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </div>
      )}

      {/* Fade overlay on video for design effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-transparent pointer-events-none z-10" />

      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30 pointer-events-none z-10" />
    </div>
  );
}
