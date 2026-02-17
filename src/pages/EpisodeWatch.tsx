import { useParams, Link } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimeById, useAnimeEpisodes } from "@/hooks/useAnime";
import { getTrailerYoutubeId } from "@/lib/trailerFallback";
import { getEpisodeUrl, getAnimeEpisodes } from "@/lib/supabase";

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

  // State for episode video URL from database
  const [episodeVideoUrl, setEpisodeVideoUrl] = useState<string | null>(null);
  const [availableEpisodes, setAvailableEpisodes] = useState<any[]>([]);
  const [loadingVideo, setLoadingVideo] = useState(false);

  const anime = animeData?.data;

  // Fetch episode video URL from Supabase
  useEffect(() => {
    async function fetchEpisodeVideo() {
      if (isTrailer || !animeId || !epNum) return;

      setLoadingVideo(true);
      const videoUrl = await getEpisodeUrl(animeId, epNum);
      setEpisodeVideoUrl(videoUrl);
      setLoadingVideo(false);
    }

    fetchEpisodeVideo();
  }, [animeId, epNum, isTrailer]);

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
        <div className="w-full max-w-4xl mx-auto">
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
          ) : !isTrailer && episodeVideoUrl ? (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
              {renderVideoPlayer(episodeVideoUrl, `${anime.title} - Episode ${epNum}`)}
            </div>
          ) : (
            <div className="w-full aspect-video rounded-lg bg-card border border-border flex items-center justify-center">
              <div className="text-center space-y-2">
                <p className="text-muted-foreground">لا يوجد فيديو متاح</p>
                <p className="text-xs text-muted-foreground">
                  {isTrailer ? "لا يوجد عرض دعائي لهذا الأنمي" : `الحلقة ${epNum} غير متوفرة حالياً`}
                </p>
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
