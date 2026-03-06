import { useParams, Link } from "react-router-dom";
import { ChevronRight, ChevronLeft, Server } from "lucide-react";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimeById, useAnimeEpisodes } from "@/hooks/useAnime";
import { getTrailerYoutubeId } from "@/lib/trailerFallback";
import { getEpisodeData, getAnimeEpisodes, resolveProxyVideoUrl, scrapeAnime3rbEpisode, type VideoSource, type AnimeEpisode } from "@/lib/supabase";

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
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  const anime = animeData?.data;

  // Fetch full episode data from Supabase, then auto-scrape if not found
  useEffect(() => {
    async function fetchEpisodeVideo() {
      if (isTrailer || !animeId || !epNum) return;

      setLoadingVideo(true);
      setScrapeError(null);
      const data = await getEpisodeData(animeId, epNum);

      if (data && ((data.video_sources && data.video_sources.length > 0) || data.video_url)) {
        // Episode data found in database
        setEpisodeData(data);
        setSelectedServerIndex(0);
        setLoadingVideo(false);
        return;
      }

      // No episode data in database — trigger scraper
      if (!anime) {
        // Anime data not loaded yet, wait for it
        setLoadingVideo(false);
        return;
      }

      setScraping(true);
      setLoadingVideo(false);

      const result = await scrapeAnime3rbEpisode(
        anime.title,
        anime.title_english || null,
        epNum,
        animeId
      );

      setScraping(false);

      if (result.video_sources && result.video_sources.length > 0) {
        // Scraper found video sources — set them as episode data
        setEpisodeData({
          id: '',
          mal_id: animeId,
          episode_number: epNum,
          video_url: result.video_sources[0].url,
          quality: result.video_sources[0].quality,
          video_sources: result.video_sources,
          subtitle_language: 'ar',
          is_active: true,
          category: null,
          tags: [],
          created_at: new Date().toISOString(),
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
      if (!source || source.type !== 'proxy') return;
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

  // Get trailer YouTube ID (from Jikan API or fallback database)
  const youtubeId = getTrailerYoutubeId(
    anime.mal_id,
    anime.trailer?.youtube_id || null,
    anime.trailer?.embed_url || null
  );

  // Render video player based on URL type
  const renderVideoPlayer = (url: string, title: string) => {
    // Check if it's a direct video file (has .mp4, .m3u8, etc.)
    const isDirectVideo = url.match(/\.(mp4|webm|ogg|m3u8|mpd)/i);

    if (isDirectVideo) {
      // Direct video file - use HTML5 video player
      return (
        <video
          className="w-full h-full rounded-lg bg-black"
          controls
          autoPlay
          src={url}
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
      <div className="container py-6 space-y-6">
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
                  <p className="text-xs text-muted-foreground opacity-60">يتم البحث في anime3rb - قد يستغرق هذا بضع ثوانٍ</p>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                        className="min-w-[100px]"
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
                    return renderVideoPlayer(resolvedUrl, `${anime.title} - Episode ${epNum}`);
                  }

                  // Non-proxy: play directly
                  return renderVideoPlayer(source.url, `${anime.title} - Episode ${epNum}`);
                })()}
              </div>
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

        {/* Episode list - show available episodes from database */}
        {availableEpisodes.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-4">
            <h2 className="text-lg font-bold border-r-4 border-primary pr-3">
              الحلقات ({availableEpisodes.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {availableEpisodes.map((ep) => {
                const style = getEpisodeStyle(ep, animeId);
                const isCurrentEpisode = ep.episode_number === epNum;

                return (
                  <Link
                    key={ep.id}
                    to={`/watch/${animeId}/${ep.episode_number}`}
                    className={`p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                      isCurrentEpisode
                        ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/50"
                        : `hover:border-primary/50 ${style.background} ${style.border}`
                    }`}
                  >
                    <div className="flex items-center justify-center">
                      <span className="text-xl font-bold">
                        {ep.episode_number}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Fallback to Jikan episode list if no database episodes */}
        {availableEpisodes.length === 0 && episodes?.data && episodes.data.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-3">
            <h2 className="text-lg font-bold border-r-4 border-primary pr-3">جميع الحلقات</h2>
            <p className="text-sm text-muted-foreground">
              لا توجد حلقات متوفرة حالياً - قريباً!
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
