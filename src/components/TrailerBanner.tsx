import { useCallback, useEffect, useRef, useState } from 'react';

interface TrailerBannerProps {
  youtubeId: string;
  posterUrl: string;
  height?: string;
  startSeconds?: number;
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
  posterUrl,
  height = '400px',
  startSeconds = 0,
}: TrailerBannerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loopTimerRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile phone on component mount
    setIsMobile(isMobilePhone());
  }, []);

  const restartVideoFromOffset = useCallback(() => {
    if (!iframeRef.current?.contentWindow) {
      return;
    }

    const seekTarget = Math.max(0, Math.floor(startSeconds));
    const sendCommand = (func: string, args: unknown[] = []) => {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({
          event: "command",
          func,
          args,
        }),
        "https://www.youtube.com",
      );
    };

    sendCommand("seekTo", [seekTarget, true]);
    sendCommand("playVideo");
  }, [startSeconds]);

  useEffect(() => {
    if (isMobile) return; // Skip video setup on mobile phones

    // Set up loop timer to restart video every 28 seconds (desktop/tablet only)
    loopTimerRef.current = window.setInterval(() => {
      if (iframeRef.current && isLoaded && !hasError) {
        restartVideoFromOffset();
      }
    }, 28000);

    return () => {
      if (loopTimerRef.current) {
        clearInterval(loopTimerRef.current);
      }
    };
  }, [youtubeId, isLoaded, hasError, isMobile, startSeconds, restartVideoFromOffset]);

  useEffect(() => {
    if (!isLoaded || hasError || isMobile || startSeconds <= 0) {
      return;
    }

    const attemptTimers = [
      window.setTimeout(restartVideoFromOffset, 250),
      window.setTimeout(restartVideoFromOffset, 1000),
      window.setTimeout(restartVideoFromOffset, 2000),
    ];

    return () => {
      attemptTimers.forEach((timer) => clearTimeout(timer));
    };
  }, [isLoaded, hasError, isMobile, startSeconds, youtubeId, restartVideoFromOffset]);

  // Enhanced URL parameters for better quality and control (desktop/tablet only)
  const origin = typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
  const embedUrl = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&showinfo=0&modestbranding=1&rel=0&playsinline=1&disablekb=1&fs=0&iv_load_policy=3&loop=1&playlist=${youtubeId}&enablejsapi=1&origin=${origin}&start=${Math.max(0, Math.floor(startSeconds))}`;

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
  };

  return (
    <div className="relative overflow-hidden" style={{ height }}>
      {/* Show poster image on mobile phones or when loading/error on desktop/tablet */}
      {(isMobile || !isLoaded || hasError) && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${posterUrl})` }}
        />
      )}

      {/* YouTube Player - Desktop and Tablet only (not mobile phones) */}
      {!isMobile && !hasError && (
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
            title={`Trailer ${youtubeId}`}
            onLoad={handleLoad}
            onError={handleError}
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
