import { useEffect, useState } from 'react';

interface TrailerBannerProps {
  youtubeId: string;
  posterUrl: string | null;
  title?: string;
  height?: string;
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
  title = "Anime",
  height = '400px',
}: TrailerBannerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile phone on component mount
    setIsMobile(isMobilePhone());
  }, []);

  // Enhanced URL parameters for better quality and control (desktop/tablet only)
  const origin = typeof window !== "undefined" ? encodeURIComponent(window.location.origin) : "";
  const embedUrl = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&showinfo=0&modestbranding=1&rel=0&playsinline=1&disablekb=1&fs=0&iv_load_policy=3&loop=1&playlist=${youtubeId}&origin=${origin}`;

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
      {!isMobile && !hasError && (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
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
