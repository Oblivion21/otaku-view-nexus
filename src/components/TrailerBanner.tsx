import { useEffect, useRef, useState } from 'react';

interface TrailerBannerProps {
  youtubeId: string;
  posterUrl: string;
  height?: string;
}

export function TrailerBanner({ youtubeId, posterUrl, height = '400px' }: TrailerBannerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<any>(null);
  const loopTimerRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // Set up error detection timeout - if video doesn't load in 5 seconds, show poster
    const errorTimeout = setTimeout(() => {
      if (!isLoaded) {
        setHasError(true);
      }
    }, 5000);

    // Set up loop timer to restart video every 25 seconds
    loopTimerRef.current = window.setInterval(() => {
      if (iframeRef.current && isLoaded && !hasError) {
        const currentSrc = iframeRef.current.src;
        iframeRef.current.src = currentSrc;
      }
    }, 28000); // 28 seconds

    return () => {
      clearTimeout(errorTimeout);
      if (loopTimerRef.current) {
        clearInterval(loopTimerRef.current);
      }
    };
  }, [youtubeId, isLoaded, hasError]);

  // Enhanced URL parameters for better quality and control
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
    // Request HD quality
    vq: 'hd1080',
    // Start from 30 seconds (roughly middle of most trailers)
    start: '30',
    // Prevent related videos
    loop: '1',
    playlist: youtubeId,
    // Enable autoplay
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
      {/* Background Poster (shown while loading or on error) */}
      {(!isLoaded || hasError) && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${posterUrl})` }}
        />
      )}

      {/* YouTube Player Container */}
      {!hasError && (
        <div className="absolute inset-0 overflow-hidden">
          <iframe
            ref={iframeRef}
            src={embedUrl}
            allow="autoplay; encrypted-media; picture-in-picture; accelerometer; gyroscope"
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
