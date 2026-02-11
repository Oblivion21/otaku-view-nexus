import { useEffect, useRef, useState } from 'react';

interface TrailerBannerProps {
  youtubeId: string;
  posterUrl: string;
  height?: string;
}

// Detect if user is on mobile device
const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export function TrailerBanner({ youtubeId, posterUrl, height = '400px' }: TrailerBannerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loopTimerRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect mobile on component mount
    setIsMobile(isMobileDevice());

    // Set up error detection timeout - if video doesn't load in 5 seconds, show poster
    const errorTimeout = setTimeout(() => {
      if (!isLoaded) {
        setHasError(true);
      }
    }, 5000);

    // Set up loop timer to restart video every 28 seconds (desktop only)
    loopTimerRef.current = window.setInterval(() => {
      if (iframeRef.current && isLoaded && !hasError && !isMobile) {
        const currentSrc = iframeRef.current.src;
        iframeRef.current.src = currentSrc;
      }
    }, 28000);

    return () => {
      clearTimeout(errorTimeout);
      if (loopTimerRef.current) {
        clearInterval(loopTimerRef.current);
      }
    };
  }, [youtubeId, isLoaded, hasError, isMobile]);

  // Enhanced URL parameters for better quality and control (desktop only)
  const embedUrl = `https://www.youtube.com/embed/${youtubeId}?` + new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    showinfo: '0',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
    disablekb: '1',
    fs: '0',
    iv_load_policy: '3',
    vq: 'hd1080',
    start: '30',
    loop: '1',
    playlist: youtubeId,
    enablejsapi: '1',
    origin: window.location.origin,
  }).toString();

  const handleLoad = () => {
    setIsLoaded(true);
  };

  const handleError = () => {
    setHasError(true);
  };

  return (
    <div className="relative overflow-hidden" style={{ height }}>
      {/* Show poster image on mobile or when loading/error on desktop */}
      {(isMobile || !isLoaded || hasError) && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${posterUrl})` }}
        />
      )}

      {/* YouTube Player - Desktop only */}
      {!isMobile && !hasError && (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            ref={iframeRef}
            src={embedUrl}
            allow="autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              border: 'none',
              width: '100vw',
              height: '56.25vw',
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
