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

// Declare YouTube API types
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export function TrailerBanner({ youtubeId, posterUrl, height = '400px' }: TrailerBannerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<any>(null);
  const loopTimerRef = useRef<number | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showTapOverlay, setShowTapOverlay] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const mobile = isMobileDevice();
    setIsMobile(mobile);

    if (mobile) {
      // On mobile, show tap overlay
      setShowTapOverlay(true);

      // Load YouTube IFrame API
      if (!window.YT) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
      }
    }

    // Set up error detection timeout - if video doesn't load in 5 seconds, show poster
    const errorTimeout = setTimeout(() => {
      if (!isLoaded) {
        setHasError(true);
      }
    }, 5000);

    // Set up loop timer to restart video every 28 seconds
    loopTimerRef.current = window.setInterval(() => {
      if (playerRef.current && isPlaying && !hasError) {
        try {
          playerRef.current.seekTo(30); // Restart from 30 seconds
        } catch (e) {
          // Fallback to iframe reload if API fails
          if (iframeRef.current) {
            const currentSrc = iframeRef.current.src;
            iframeRef.current.src = currentSrc;
          }
        }
      } else if (iframeRef.current && isLoaded && !hasError && !isMobile) {
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
  }, [youtubeId, isLoaded, hasError, isPlaying, isMobile]);

  // Initialize YouTube Player on mobile
  useEffect(() => {
    if (isMobile && window.YT && window.YT.Player) {
      const onPlayerReady = (event: any) => {
        playerRef.current = event.target;
        setIsLoaded(true);
      };

      const onPlayerStateChange = (event: any) => {
        if (event.data === window.YT.PlayerState.PLAYING) {
          setIsPlaying(true);
        }
      };

      // Wait for API to be ready
      const initPlayer = () => {
        if (playerContainerRef.current && !playerRef.current) {
          playerRef.current = new window.YT.Player(playerContainerRef.current, {
            videoId: youtubeId,
            playerVars: {
              autoplay: 0, // Don't autoplay, wait for user tap
              mute: 1,
              controls: 0,
              showinfo: 0,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              disablekb: 1,
              fs: 0,
              iv_load_policy: 3,
              vq: 'hd1080',
              start: 30,
              loop: 1,
              playlist: youtubeId,
              enablejsapi: 1,
              origin: window.location.origin,
            },
            events: {
              onReady: onPlayerReady,
              onStateChange: onPlayerStateChange,
            },
          });
        }
      };

      if (window.YT.loaded) {
        initPlayer();
      } else {
        window.onYouTubeIframeAPIReady = initPlayer;
      }
    }
  }, [isMobile, youtubeId]);

  const handleMobileTap = () => {
    if (playerRef.current && playerRef.current.playVideo) {
      playerRef.current.playVideo();
      setShowTapOverlay(false);
    }
  };

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
          {isMobile ? (
            // Mobile: Use YouTube IFrame API player
            <div
              ref={playerContainerRef}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                width: '100vw',
                height: '56.25vw',
                minWidth: '177.77vh',
                minHeight: '100vh',
              }}
            />
          ) : (
            // Desktop: Use regular iframe with autoplay
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
          )}
        </div>
      )}

      {/* Mobile tap overlay to trigger playback */}
      {isMobile && showTapOverlay && (
        <div
          onClick={handleMobileTap}
          className="absolute inset-0 z-20 flex items-center justify-center cursor-pointer bg-black/20"
        >
          <div className="text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border-2 border-white/50 mb-3">
              <svg className="w-10 h-10 ml-1 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <p className="text-white text-sm font-medium">اضغط لتشغيل العرض الدعائي</p>
          </div>
        </div>
      )}

      {/* Invisible overlay to block controls after video starts on mobile */}
      {isMobile && !showTapOverlay && (
        <div className="absolute inset-0 z-20 pointer-events-auto" style={{ background: 'transparent' }} />
      )}

      {/* Fade overlay on video for design effect */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-transparent pointer-events-none z-10" />

      {/* Dark gradient overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30 pointer-events-none z-10" />
    </div>
  );
}
