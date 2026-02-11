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
  const playerRef = useRef<any>(null);
  const loopTimerRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);

  useEffect(() => {
    // Detect mobile on component mount
    setIsMobile(isMobileDevice());

    // On mobile, show play button after a brief delay
    if (isMobileDevice()) {
      setTimeout(() => setShowPlayButton(true), 1000);
    }

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
              pointerEvents: isMobile ? 'auto' : 'none',
            }}
            title={`Trailer ${youtubeId}`}
            onLoad={handleLoad}
            onError={handleError}
          />
        </div>
      )}

      {/* Mobile Play Button Overlay */}
      {isMobile && showPlayButton && !isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/30 backdrop-blur-sm">
          <button
            onClick={() => {
              setShowPlayButton(false);
              // Try to trigger autoplay by reloading iframe
              if (iframeRef.current) {
                const currentSrc = iframeRef.current.src;
                iframeRef.current.src = currentSrc;
              }
            }}
            className="flex flex-col items-center gap-3 text-white hover:scale-110 transition-transform"
          >
            <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border-2 border-white/50">
              <svg className="w-10 h-10 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="text-sm font-medium">اضغط لتشغيل العرض الدعائي</span>
          </button>
        </div>
      )}

      {/* Fade overlay on video for design effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-transparent pointer-events-none z-10" />

      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30 pointer-events-none z-10" />
    </div>
  );
}
