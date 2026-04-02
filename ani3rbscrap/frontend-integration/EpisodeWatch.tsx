/**
 * Updated EpisodeWatch.tsx — integrates the anime3rb scraper API.
 *
 * CHANGES from original:
 * 1. Added import for resolveVideoByName from scraper-api.ts
 * 2. Added auto-scraping logic: when episode has no database sources,
 *    automatically calls the scraper API with the anime name + episode number
 * 3. Added scraperVideoUrl state + loading/error UI for scraper results
 * 4. Falls back gracefully: DB sources → scraper API → "no video" message
 *
 * Replace: src/pages/EpisodeWatch.tsx
 */

import { useParams, Link } from "react-router-dom";
import { ChevronRight, ChevronLeft, Server, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimeById, useAnimeEpisodes } from "@/hooks/useAnime";
import { getTrailerYoutubeId } from "@/lib/trailerFallback";
import {
  getEpisodeData,
  getAnimeEpisodes,
  resolveProxyVideoUrl,
  type VideoSource,
  type AnimeEpisode,
} from "@/lib/supabase";
import { resolveVideoByName } from "@/lib/scraper-api";

// Get episode styling based on category and tags (Detective Conan only)
function getEpisodeStyle(episode: any, animeId: number) {
  const isDetectiveConan = animeId === 235;

  if (!isDetectiveConan) {
    return {
      background: "bg-card",
      border: "border-border",
    };
  }

  let background = "bg-card";
  let border = "border-border";

  if (episode.category === "main_story") {
    background = "bg-green-500/20";
  } else if (episode.category === "black_org") {
    background = "bg-blue-500/20";
  } else if (episode.tags?.includes("filler")) {
    background = "bg-gray-400/20";
  }

  if (episode.tags?.includes("special")) {
    border = "border-red-500";
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
  const [resolvedProxyUrls, setResolvedProxyUrls] = useState<
    Record<number, string>
  >({});
  const [resolvingProxy, setResolvingProxy] = useState(false);
  const [proxyAttempted, setProxyAttempted] = useState<
    Record<number, boolean>
  >({});
  const [proxyError, setProxyError] = useState<string | null>(null);

  // ─── NEW: Scraper API state ───────────────────────────────────
  const [scraperVideoUrl, setScraperVideoUrl] = useState<string | null>(null);
  const [scraperLoading, setScraperLoading] = useState(false);
  const [scraperError, setScraperError] = useState<string | null>(null);

  const anime = animeData?.data;

  // Fetch full episode data from Supabase
  useEffect(() => {
    async function fetchEpisodeVideo() {
      if (isTrailer || !animeId || !epNum) return;

      setLoadingVideo(true);
      // Reset scraper state on episode change
      setScraperVideoUrl(null);
      setScraperLoading(false);
      setScraperError(null);

      const data = await getEpisodeData(animeId, epNum);
      setEpisodeData(data);
      setSelectedServerIndex(0);
      setLoadingVideo(false);
    }

    fetchEpisodeVideo();
  }, [animeId, epNum, isTrailer]);

  // ─── NEW: Auto-scrape when no database sources exist ─────────
  useEffect(() => {
    async function autoScrape() {
      // Only scrape if:
      // 1. We have anime data (need the title)
      // 2. Episode data loading is done
      // 3. No video sources from database
      // 4. Not a trailer
      // 5. Haven't already scraped
      if (
        !anime ||
        loadingVideo ||
        isTrailer ||
        !epNum ||
        scraperVideoUrl ||
        scraperLoading ||
        scraperError
      )
        return;

      const hasDbSources =
        episodeData &&
        ((episodeData.video_sources && episodeData.video_sources.length > 0) ||
          episodeData.video_url);

      if (hasDbSources) return; // DB has sources, no need to scrape

      // Use the anime title to search anime3rb.com
      const animeName =
        anime.title_english || anime.title || anime.title_japanese;
      if (!animeName) return;

      console.log(
        `[scraper] No DB sources found. Auto-scraping: "${animeName}" ep ${epNum}`
      );
      setScraperLoading(true);
      setScraperError(null);

      const result = await resolveVideoByName(animeName, epNum);

      if (result.success && result.video_url) {
        console.log(`[scraper] Got video URL: ${result.video_url}`);
        setScraperVideoUrl(result.video_url);
      } else {
        console.log(`[scraper] Failed: ${result.error}`);
        setScraperError(result.error || "تعذر العثور على الفيديو");
      }
      setScraperLoading(false);
    }

    autoScrape();
  }, [anime, episodeData, loadingVideo, isTrailer, epNum]);

  // Resolve proxy source when user selects a proxy server
  useEffect(() => {
    async function resolveProxy() {
      if (!episodeData?.video_sources) return;
      const source = episodeData.video_sources[selectedServerIndex];
      if (!source || source.type !== "proxy") return;
      if (proxyAttempted[selectedServerIndex]) return;

      setResolvingProxy(true);
      setProxyError(null);
      const result = await resolveProxyVideoUrl(source.url);
      setProxyAttempted((prev) => ({
        ...prev,
        [selectedServerIndex]: true,
      }));
      if (result.url) {
        setResolvedProxyUrls((prev) => ({
          ...prev,
          [selectedServerIndex]: result.url,
        }));
      } else {
        setProxyError(result.error || "تعذر تحميل الفيديو");
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
    return (
      <Layout>
        <div className="container py-16 text-center">
          لم يتم العثور على الأنمي
        </div>
      </Layout>
    );
  }

  const youtubeId = getTrailerYoutubeId(
    null,
    anime.trailer?.youtube_id || null,
    anime.trailer?.embed_url || null
  );

  const renderVideoPlayer = (url: string, title: string) => {
    const isDirectVideo = url.match(/\.(mp4|webm|ogg|m3u8|mpd)/i);

    if (isDirectVideo) {
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

  // Check if we should show the scraper result
  const hasDbSources =
    episodeData &&
    ((episodeData.video_sources && episodeData.video_sources.length > 0) ||
      episodeData.video_url);

  return (
    <Layout>
      <div className="container py-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            الرئيسية
          </Link>
          <ChevronLeft className="h-3 w-3" />
          <Link to={`/anime/${animeId}`} className="hover:text-foreground">
            {anime.title}
          </Link>
          <ChevronLeft className="h-3 w-3" />
          <span className="text-foreground">
            {isTrailer ? "العرض الدعائي" : `الحلقة ${epNum}`}
          </span>
        </div>

        {/* Video player */}
        <div className="w-full max-w-4xl mx-auto space-y-4">
          {loadingVideo ? (
            <div className="w-full aspect-video rounded-lg bg-card border border-border flex items-center justify-center">
              <p className="text-muted-foreground">جاري التحميل...</p>
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
          ) : !isTrailer &&
            episodeData &&
            (episodeData.video_sources?.length ?? 0) > 0 ? (
            <>
              {/* Server selector */}
              {episodeData.video_sources &&
                episodeData.video_sources.length > 1 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Server className="h-4 w-4" />
                      <span>السيرفر:</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {episodeData.video_sources.map((source, index) => (
                        <Button
                          key={index}
                          variant={
                            selectedServerIndex === index
                              ? "default"
                              : "outline"
                          }
                          size="sm"
                          onClick={() => setSelectedServerIndex(index)}
                          className="min-w-[100px]"
                        >
                          {source.server_name}
                          {source.quality && (
                            <span className="mr-1 text-xs opacity-70">
                              ({source.quality})
                            </span>
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

              {/* Video player */}
              <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
                {(() => {
                  const source =
                    episodeData.video_sources![selectedServerIndex];
                  const isProxy = source.type === "proxy";
                  const resolvedUrl = resolvedProxyUrls[selectedServerIndex];
                  const attempted = proxyAttempted[selectedServerIndex];

                  if (isProxy && resolvingProxy) {
                    return (
                      <div className="absolute inset-0 flex items-center justify-center bg-card">
                        <p className="text-muted-foreground text-sm">
                          جاري تحميل مصدر الفيديو...
                        </p>
                      </div>
                    );
                  }

                  if (isProxy && attempted && !resolvedUrl) {
                    return (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-card gap-2">
                        <p className="text-muted-foreground text-sm">
                          تعذر تحميل الفيديو
                        </p>
                        <p className="text-xs text-muted-foreground opacity-60">
                          {proxyError}
                        </p>
                      </div>
                    );
                  }

                  if (isProxy && !attempted) {
                    return (
                      <div className="absolute inset-0 flex items-center justify-center bg-card">
                        <p className="text-muted-foreground text-sm">
                          جاري التحميل...
                        </p>
                      </div>
                    );
                  }

                  if (isProxy && resolvedUrl) {
                    return renderVideoPlayer(
                      resolvedUrl,
                      `${anime.title} - Episode ${epNum}`
                    );
                  }

                  return renderVideoPlayer(
                    source.url,
                    `${anime.title} - Episode ${epNum}`
                  );
                })()}
              </div>
            </>
          ) : !isTrailer && episodeData && episodeData.video_url ? (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
              {renderVideoPlayer(
                episodeData.video_url,
                `${anime.title} - Episode ${epNum}`
              )}
            </div>
          ) : !isTrailer && scraperLoading ? (
            /* ─── NEW: Scraper loading state ─── */
            <div className="w-full aspect-video rounded-lg bg-card border border-border flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground text-sm">
                جاري البحث عن الفيديو تلقائياً...
              </p>
              <p className="text-xs text-muted-foreground opacity-60">
                يتم البحث في anime3rb.com
              </p>
            </div>
          ) : !isTrailer && scraperVideoUrl ? (
            /* ─── NEW: Scraper resolved video ─── */
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
              {renderVideoPlayer(
                scraperVideoUrl,
                `${anime.title} - Episode ${epNum}`
              )}
            </div>
          ) : !isTrailer && scraperError ? (
            /* ─── NEW: Scraper error state ─── */
            <div className="w-full aspect-video rounded-lg bg-card border border-border flex flex-col items-center justify-center gap-2">
              <p className="text-muted-foreground">لا يوجد فيديو متاح</p>
              <p className="text-xs text-muted-foreground opacity-60">
                {scraperError}
              </p>
            </div>
          ) : (
            <div className="w-full aspect-video rounded-lg bg-card border border-border flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">لا يوجد فيديو متاح</p>
                <p className="text-xs text-muted-foreground">
                  {isTrailer
                    ? "لا يوجد عرض دعائي لهذا الأنمي"
                    : `الحلقة ${epNum} غير متوفرة حالياً`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Episode info & navigation */}
        <div className="max-w-4xl mx-auto space-y-4">
          <h1 className="text-xl font-bold">
            {anime.title} —{" "}
            {isTrailer ? "العرض الدعائي" : `الحلقة ${epNum}`}
          </h1>

          {!isTrailer && (
            <div className="flex justify-between">
              <Button variant="outline" size="sm" asChild disabled={epNum <= 1}>
                <Link to={`/watch/${animeId}/${epNum - 1}`}>
                  <ChevronRight className="h-4 w-4 ml-1" />
                  الحلقة السابقة
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/watch/${animeId}/${epNum + 1}`}>
                  الحلقة التالية
                  <ChevronLeft className="h-4 w-4 mr-1" />
                </Link>
              </Button>
            </div>
          )}
        </div>

        {/* Episode list */}
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
        {availableEpisodes.length === 0 &&
          episodes?.data &&
          episodes.data.length > 0 && (
            <div className="max-w-4xl mx-auto space-y-3">
              <h2 className="text-lg font-bold border-r-4 border-primary pr-3">
                جميع الحلقات
              </h2>
              <p className="text-sm text-muted-foreground">
                لا توجد حلقات متوفرة حالياً - قريباً!
              </p>
            </div>
          )}
      </div>
    </Layout>
  );
}
