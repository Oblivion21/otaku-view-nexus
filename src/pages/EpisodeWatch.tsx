import { useParams, Link } from "react-router-dom";
import { ChevronRight, ChevronLeft, Search, Server } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimeById, useAnimeEpisodes } from "@/hooks/useAnime";
import { isBlockedAnime } from "@/lib/jikan";
import { getTrailerYoutubeId } from "@/lib/trailerFallback";
import { getEpisodeData, getAnimeEpisodes, resolveProxyVideoUrl, scrapeAnime3rbEpisode, type AnimeEpisode } from "@/lib/supabase";

// Get episode styling based on category and tags (Detective Conan only)
function getEpisodeStyle(episode: any, animeId: number) {
  const isDetectiveConan = animeId === 235;

  if (!isDetectiveConan) {
    return {
      background: 'bg-card',
      border: 'border-border'
    };
  }

  let background = 'bg-card';
  let border = 'border-border';

  // Background color based on category
  if (episode.category === 'main_story') {
    background = 'bg-green-500/20'; // Green for manga/main story
  } else if (episode.category === 'black_org') {
    background = 'bg-blue-500/20'; // Blue for Black Organization
  } else if (episode.tags?.includes('filler')) {
    background = 'bg-gray-400/20'; // Grey for filler
  }

  // Red border for special episodes
  if (episode.tags?.includes('special')) {
    border = 'border-red-500';
  }

  return { background, border };
}

function isDirectPlayableUrl(url: string): boolean {
  return (
    /\.(mp4|webm|ogg|m3u8|mpd)(?:$|[?#])/i.test(url) ||
    /video\.vid3rb\.com\/video\//i.test(url)
  );
}

const SCRAPE_CACHE_TTL_MS = 2 * 60 * 60 * 1000;

function isScrapeCacheFresh(scrapedAt: string | null | undefined): boolean {
  if (!scrapedAt) return false;
  const parsed = Date.parse(scrapedAt);
  if (Number.isNaN(parsed)) return false;
  return Date.now() - parsed < SCRAPE_CACHE_TTL_MS;
}

function hasCachedVideo(data: AnimeEpisode): boolean {
  return Boolean(
    (data.video_sources && data.video_sources.length > 0) ||
    data.video_url
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    target.isContentEditable ||
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT"
  );
}

export default function EpisodeWatch() {
  const { id, episode } = useParams<{ id: string; episode: string }>();
  const animeId = Number(id);
  const isTrailer = episode === "trailer";
  const epNum = isTrailer ? 0 : Number(episode);

  const { data: animeData, isLoading } = useAnimeById(animeId);
  const { data: episodes } = useAnimeEpisodes(animeId);

  // State for episode data and video sources
  const [episodeData, setEpisodeData] = useState<AnimeEpisode | null>(null);
  const [selectedServerIndex, setSelectedServerIndex] = useState(0);
  const [availableEpisodes, setAvailableEpisodes] = useState<any[]>([]);
  const [loadingVideo, setLoadingVideo] = useState(false);
  // Resolved proxy URLs: map from server index to resolved URL
  const [resolvedProxyUrls, setResolvedProxyUrls] = useState<Record<number, string>>({});
  const [resolvingProxy, setResolvingProxy] = useState(false);
  // Track which server indices have been attempted (success or fail)
  const [proxyAttempted, setProxyAttempted] = useState<Record<number, boolean>>({});
  const [proxyError, setProxyError] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [episodeSearchQuery, setEpisodeSearchQuery] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const anime = animeData?.data;
  const supabaseEpisodeMap = new Map(
    availableEpisodes.map((ep) => [ep.episode_number, ep])
  );
  const displayEpisodes = episodes?.data && episodes.data.length > 0
    ? episodes.data.map((ep) => {
        const dbEpisode = supabaseEpisodeMap.get(ep.mal_id);
        return {
          id: dbEpisode?.id || `jikan-${ep.mal_id}`,
          episode_number: ep.mal_id,
          title: ep.title || `الحلقة ${ep.mal_id}`,
          category: dbEpisode?.category ?? null,
          tags: dbEpisode?.tags ?? [],
        };
      })
    : availableEpisodes.map((ep) => ({
        id: ep.id,
        episode_number: ep.episode_number,
        title: `الحلقة ${ep.episode_number}`,
        category: ep.category ?? null,
        tags: ep.tags ?? [],
      }));
  const filteredEpisodes = displayEpisodes.filter((ep) => {
    const query = episodeSearchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      String(ep.episode_number).includes(query) ||
      String(ep.title || "").toLowerCase().includes(query)
    );
  });
  const selectedSource = !isTrailer && episodeData?.video_sources
    ? episodeData.video_sources[selectedServerIndex]
    : null;
  const selectedResolvedUrl = selectedSource ? resolvedProxyUrls[selectedServerIndex] : "";
  const activeVideoUrl = selectedSource
    ? selectedSource.type === "proxy"
      ? selectedResolvedUrl
      : selectedSource.url
    : !isTrailer && episodeData?.video_url
      ? episodeData.video_url
      : "";
  const isActiveDirectVideo = Boolean(activeVideoUrl && isDirectPlayableUrl(activeVideoUrl));

  // Use a cached direct URL for up to 2 hours, then re-scrape on demand.
  useEffect(() => {
    async function fetchEpisodeVideo() {
      if (isTrailer || !animeId || !epNum) return;

      setLoadingVideo(true);
      setScrapeError(null);
      setEpisodeData(null);
      setResolvedProxyUrls({});
      setProxyAttempted({});
      setProxyError(null);
      setPlaybackError(null);

      if (!anime) {
        setLoadingVideo(false);
        return;
      }

      // Step 1: load DB row and use cached direct URL only while it is still fresh.
      const data = await getEpisodeData(animeId, epNum);
      if (data && hasCachedVideo(data) && isScrapeCacheFresh(data.scraped_at)) {
        setEpisodeData(data);
        setSelectedServerIndex(0);
        setLoadingVideo(false);
        setScraping(false);
        return;
      }

      setScraping(true);
      setLoadingVideo(false);

      // Step 2: scrape and cache via Supabase edge function.
      const result = await scrapeAnime3rbEpisode(
        anime.title,
        anime.title_english || null,
        epNum,
        animeId,
        true,
      );

      setScraping(false);

      if (result.video_sources && result.video_sources.length > 0) {
        // Scraper found video sources — set them as episode data
        setEpisodeData({
          id: data?.id || '',
          mal_id: animeId,
          episode_number: epNum,
          episode_page_url: data?.episode_page_url || null,
          video_url: result.video_sources[0].url,
          quality: result.video_sources[0].quality,
          video_sources: result.video_sources,
          subtitle_language: data?.subtitle_language || 'ar',
          is_active: data?.is_active ?? true,
          category: data?.category ?? null,
          tags: data?.tags || [],
          scraped_at: new Date().toISOString(),
          created_at: data?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setSelectedServerIndex(0);
      } else {
        setScrapeError(result.error || 'لم يتم العثور على مصدر الفيديو');
      }
    }

    fetchEpisodeVideo();
  }, [animeId, epNum, isTrailer, anime]);

  // Resolve proxy source when user selects a proxy server
  useEffect(() => {
    async function resolveProxy() {
      if (!episodeData?.video_sources) return;
      const source = episodeData.video_sources[selectedServerIndex];
      if (!source || source.type !== 'proxy' || isDirectPlayableUrl(source.url)) return;
      // Already attempted (success or failure)
      if (proxyAttempted[selectedServerIndex]) return;

      setResolvingProxy(true);
      setProxyError(null);
      const result = await resolveProxyVideoUrl(source.url);
      setProxyAttempted(prev => ({ ...prev, [selectedServerIndex]: true }));
      if (result.url) {
        setResolvedProxyUrls(prev => ({ ...prev, [selectedServerIndex]: result.url }));
      } else {
        setProxyError(result.error || 'تعذر تحميل الفيديو');
      }
      setResolvingProxy(false);
    }

    resolveProxy();
  }, [episodeData, selectedServerIndex]);

  // Fetch available episodes from Supabase
  useEffect(() => {
    async function fetchAvailableEpisodes() {
      if (!animeId) return;

      const dbEpisodes = await getAnimeEpisodes(animeId);
      setAvailableEpisodes(dbEpisodes);
    }

    fetchAvailableEpisodes();
  }, [animeId]);

  useEffect(() => {
    setEpisodeSearchQuery("");
  }, [animeId, epNum, isTrailer]);

  useEffect(() => {
    if (!isActiveDirectVideo || !videoRef.current) return;

    const playPromise = videoRef.current.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Browser autoplay policy can block playback; keep controls usable.
      });
    }
  }, [activeVideoUrl, isActiveDirectVideo, selectedServerIndex, epNum]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" && event.key !== " ") return;
      if (event.defaultPrevented) return;
      if (isEditableTarget(event.target)) return;
      if (!videoRef.current || !isActiveDirectVideo) return;

      event.preventDefault();
      if (videoRef.current.paused) {
        const playPromise = videoRef.current.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {
            // Ignore autoplay/play promise failures from keyboard toggle.
          });
        }
      } else {
        videoRef.current.pause();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActiveDirectVideo]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-8 space-y-4">
          <Skeleton className="w-full aspect-video rounded-lg" />
          <Skeleton className="h-6 w-1/2" />
        </div>
      </Layout>
    );
  }

  if (!anime) {
    return <Layout><div className="container py-16 text-center">لم يتم العثور على الأنمي</div></Layout>;
  }

  if (isBlockedAnime(anime)) {
    return <Layout><div className="container py-16 text-center">لم يتم العثور على الأنمي</div></Layout>;
  }

  // Get trailer YouTube ID (from Jikan API or fallback database)
  const youtubeId = getTrailerYoutubeId(
    anime.mal_id,
    anime.trailer?.youtube_id || null,
    anime.trailer?.embed_url || null
  );

  // Render video player based on URL type
  const renderVideoPlayer = (url: string, title: string, onError?: () => void) => {
    const isDirectVideo = isDirectPlayableUrl(url);

    if (isDirectVideo) {
      // Direct video file - use HTML5 video player
      return (
        <video
          ref={videoRef}
          className="w-full h-full rounded-lg bg-black"
          controls
          autoPlay
          src={url}
          onError={onError}
        >
          متصفحك لا يدعم تشغيل الفيديو.
        </video>
      );
    } else {
      // Assume it's a player page or iframe embed
      return (
        <iframe
          src={url}
          title={title}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
        />
      );
    }
  };

  return (
    <Layout>
      <div className="container py-4 md:py-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">الرئيسية</Link>
          <ChevronLeft className="h-3 w-3" />
          <Link to={`/anime/${animeId}`} className="hover:text-foreground">{anime.title}</Link>
          <ChevronLeft className="h-3 w-3" />
          <span className="text-foreground">
            {isTrailer ? "العرض الدعائي" : `الحلقة ${epNum}`}
          </span>
        </div>

        {/* Video player */}
        <div className="w-full max-w-4xl mx-auto space-y-4">
          {loadingVideo || scraping ? (
            <div className="w-full aspect-video rounded-lg bg-card border border-border flex flex-col items-center justify-center gap-3">
              {scraping ? (
                <>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-muted-foreground">جاري البحث عن مصدر الفيديو...</p>
                </>
              ) : (
                <p className="text-muted-foreground">جاري التحميل...</p>
              )}
            </div>
          ) : isTrailer && youtubeId ? (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
                title={`${anime.title} - Trailer`}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          ) : !isTrailer && episodeData && (episodeData.video_sources?.length ?? 0) > 0 ? (
            <>
              {/* Server selector */}
              {episodeData.video_sources && episodeData.video_sources.length > 1 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                    <Server className="h-4 w-4" />
                    <span>السيرفر:</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {episodeData.video_sources.map((source, index) => (
                      <Button
                        key={index}
                        variant={selectedServerIndex === index ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedServerIndex(index)}
                        className="min-w-[100px] max-w-full"
                      >
                        {source.server_name}
                        {source.quality && (
                          <span className="mr-1 text-xs opacity-70">({source.quality})</span>
                        )}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Video player */}
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
                {(() => {
                  const source = episodeData.video_sources![selectedServerIndex];
                  const isProxy = source.type === 'proxy';
                  const resolvedUrl = resolvedProxyUrls[selectedServerIndex];
                  const attempted = proxyAttempted[selectedServerIndex];

                  // Proxy: still resolving
                  if (isProxy && resolvingProxy) {
                    return (
                      <div className="absolute inset-0 flex items-center justify-center bg-card">
                        <p className="text-muted-foreground text-sm">جاري تحميل مصدر الفيديو...</p>
                      </div>
                    );
                  }

                  // Proxy: resolution failed
                  if (isProxy && attempted && !resolvedUrl) {
                    return (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-card gap-2">
                        <p className="text-muted-foreground text-sm">تعذر تحميل الفيديو</p>
                        <p className="text-xs text-muted-foreground opacity-60">{proxyError}</p>
                      </div>
                    );
                  }

                  // Proxy: not yet attempted (brief moment before useEffect fires)
                  if (isProxy && !attempted) {
                    return (
                      <div className="absolute inset-0 flex items-center justify-center bg-card">
                        <p className="text-muted-foreground text-sm">جاري التحميل...</p>
                      </div>
                    );
                  }

                  // Proxy resolved: play the resolved URL
                  if (isProxy && resolvedUrl) {
                    return renderVideoPlayer(
                      resolvedUrl,
                      `${anime.title} - Episode ${epNum}`,
                      () => {
                        setPlaybackError('تعذر تشغيل هذا المصدر، جاري تجربة سيرفر آخر...')
                        if (episodeData.video_sources && selectedServerIndex < episodeData.video_sources.length - 1) {
                          setSelectedServerIndex(selectedServerIndex + 1)
                        }
                      }
                    );
                  }

                  // Non-proxy: play directly
                  return renderVideoPlayer(
                    source.url,
                    `${anime.title} - Episode ${epNum}`,
                    () => {
                      setPlaybackError('تعذر تشغيل هذا المصدر، جاري تجربة سيرفر آخر...')
                      if (episodeData.video_sources && selectedServerIndex < episodeData.video_sources.length - 1) {
                        setSelectedServerIndex(selectedServerIndex + 1)
                      }
                    }
                  );
                })()}
              </div>
              {playbackError && (
                <p className="text-xs text-amber-400">{playbackError}</p>
              )}
            </>
          ) : !isTrailer && episodeData && episodeData.video_url ? (
            // Fallback to legacy video_url field
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
              {renderVideoPlayer(episodeData.video_url, `${anime.title} - Episode ${epNum}`)}
            </div>
          ) : (
            <div className="w-full aspect-video rounded-lg bg-card border border-border flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">لا يوجد فيديو متاح</p>
                <p className="text-xs text-muted-foreground">
                  {isTrailer ? "لا يوجد عرض دعائي لهذا الأنمي" : `الحلقة ${epNum} غير متوفرة حالياً`}
                </p>
                {scrapeError && (
                  <p className="text-xs text-red-400 mt-2">{scrapeError}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Episode info & navigation */}
        <div className="max-w-4xl mx-auto space-y-4">
          <h1 className="text-xl font-bold">
            {anime.title} — {isTrailer ? "العرض الدعائي" : `الحلقة ${epNum}`}
          </h1>

          {!isTrailer && (
            <div className="flex justify-between">
              <Button
                variant="outline"
                size="sm"
                asChild
                disabled={epNum <= 1}
              >
                <Link to={`/watch/${animeId}/${epNum - 1}`}>
                  <ChevronRight className="h-4 w-4 ml-1" />
                  الحلقة السابقة
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link to={`/watch/${animeId}/${epNum + 1}`}>
                  الحلقة التالية
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Link>
              </Button>
            </div>
          )}
        </div>

        {!isTrailer && (
          <div className="max-w-4xl mx-auto">
            <div className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold">الحلقات</h2>
                  <p className="text-sm text-muted-foreground">
                    {filteredEpisodes.length} من {displayEpisodes.length}
                  </p>
                </div>
                <div className="relative w-full sm:max-w-xs">
                  <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={episodeSearchQuery}
                    onChange={(e) => setEpisodeSearchQuery(e.target.value)}
                    placeholder="ابحث عن حلقة..."
                    className="pr-9"
                  />
                </div>
              </div>

              {displayEpisodes.length > 0 ? (
                <ScrollArea className="h-72 rounded-lg border border-border/70">
                  <div className="space-y-2 p-2">
                    {filteredEpisodes.map((ep) => {
                      const style = getEpisodeStyle(ep, animeId);
                      const isCurrentEpisode = ep.episode_number === epNum;

                      return (
                        <Link
                          key={ep.id}
                          to={`/watch/${animeId}/${ep.episode_number}`}
                          className={`flex items-center gap-3 rounded-lg border-2 p-3 transition-colors ${
                            isCurrentEpisode
                              ? "bg-primary text-primary-foreground border-primary"
                              : `${style.background} ${style.border} hover:border-primary/50 hover:bg-secondary/40`
                          }`}
                        >
                          <span className="w-10 shrink-0 text-center text-base font-bold">
                            {ep.episode_number}
                          </span>
                          <span className="min-w-0 flex-1 text-sm line-clamp-1">
                            {ep.title || `الحلقة ${ep.episode_number}`}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </ScrollArea>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    {episodeSearchQuery ? "لا توجد نتائج مطابقة للبحث" : "لا توجد حلقات متاحة حالياً"}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
