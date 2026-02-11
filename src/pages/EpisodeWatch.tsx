import { useParams, Link } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimeById, useAnimeEpisodes } from "@/hooks/useAnime";
import { getTrailerYoutubeId } from "@/lib/trailerFallback";
import { getEpisodeUrl, getAnimeEpisodes, type EpisodeCategory } from "@/lib/supabase";

// Helper function to get category styling
function getCategoryStyle(category: EpisodeCategory) {
  if (!category) return { bg: '', border: '', text: '', label: '' };

  const styles = {
    black_org: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/50',
      text: 'text-blue-400',
      label: '🔵'
    },
    main_story: {
      bg: 'bg-green-500/10',
      border: 'border-green-500/50',
      text: 'text-green-400',
      label: '🟢'
    },
    featured: {
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/50',
      text: 'text-orange-400',
      label: '🟠'
    },
    regular: {
      bg: 'bg-gray-500/10',
      border: 'border-gray-500/50',
      text: 'text-gray-400',
      label: '⚪'
    }
  };

  return styles[category] || { bg: '', border: '', text: '', label: '' };
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

  // Filter state
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [hideFiller, setHideFiller] = useState(false);
  const [showOnlyManga, setShowOnlyManga] = useState(false);

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
          controlsList="nodownload"
          onContextMenu={(e) => e.preventDefault()}
          preload="metadata"
        >
          <source src={url} type="video/mp4" />
          <p className="text-center text-white p-8">
            متصفحك لا يدعم تشغيل الفيديو. جرب متصفح آخر.
          </p>
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
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
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
        {availableEpisodes.length > 0 && (() => {
          // Apply filters
          const filteredEpisodes = availableEpisodes.filter(ep => {
            // Category filter
            if (selectedCategories.size > 0 && !selectedCategories.has(ep.category || 'none')) {
              return false;
            }
            // Hide filler filter
            if (hideFiller && ep.tags?.includes('filler')) {
              return false;
            }
            // Show only manga filter
            if (showOnlyManga && !ep.tags?.includes('manga')) {
              return false;
            }
            return true;
          });

          const toggleCategory = (category: string) => {
            const newSet = new Set(selectedCategories);
            if (newSet.has(category)) {
              newSet.delete(category);
            } else {
              newSet.add(category);
            }
            setSelectedCategories(newSet);
          };

          const resetFilters = () => {
            setSelectedCategories(new Set());
            setHideFiller(false);
            setShowOnlyManga(false);
          };

          const hasActiveFilters = selectedCategories.size > 0 || hideFiller || showOnlyManga;

          return (
            <div className="max-w-4xl mx-auto space-y-4">
              {/* Filter Controls */}
              <div className="bg-card border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">تصفية الحلقات (Detective Conan Guide)</h3>
                  {hasActiveFilters && (
                    <button
                      onClick={resetFilters}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      إعادة تعيين
                    </button>
                  )}
                </div>

                {/* Category Filters */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">التصنيف:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleCategory('black_org')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selectedCategories.has('black_org')
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-blue-500/10 text-blue-400 border-blue-500/50 hover:bg-blue-500/20'
                      }`}
                    >
                      🔵 المنظمة السوداء
                    </button>
                    <button
                      onClick={() => toggleCategory('main_story')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selectedCategories.has('main_story')
                          ? 'bg-green-500 text-white border-green-500'
                          : 'bg-green-500/10 text-green-400 border-green-500/50 hover:bg-green-500/20'
                      }`}
                    >
                      🟢 القصة الرئيسية
                    </button>
                    <button
                      onClick={() => toggleCategory('featured')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selectedCategories.has('featured')
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-orange-500/10 text-orange-400 border-orange-500/50 hover:bg-orange-500/20'
                      }`}
                    >
                      🟠 مميزة
                    </button>
                    <button
                      onClick={() => toggleCategory('regular')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selectedCategories.has('regular')
                          ? 'bg-gray-500 text-white border-gray-500'
                          : 'bg-gray-500/10 text-gray-400 border-gray-500/50 hover:bg-gray-500/20'
                      }`}
                    >
                      ⚪ عادية
                    </button>
                    <button
                      onClick={() => toggleCategory('none')}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        selectedCategories.has('none')
                          ? 'bg-gray-700 text-white border-gray-700'
                          : 'bg-gray-700/10 text-gray-400 border-gray-700/50 hover:bg-gray-700/20'
                      }`}
                    >
                      بدون تصنيف
                    </button>
                  </div>
                </div>

                {/* Tag Filters */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">الوسوم:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setHideFiller(!hideFiller)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        hideFiller
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-red-500/10 text-red-400 border-red-500/50 hover:bg-red-500/20'
                      }`}
                    >
                      {hideFiller ? '✓' : '○'} إخفاء الحشو (Filler)
                    </button>
                    <button
                      onClick={() => setShowOnlyManga(!showOnlyManga)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        showOnlyManga
                          ? 'bg-purple-500 text-white border-purple-500'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/50 hover:bg-purple-500/20'
                      }`}
                    >
                      {showOnlyManga ? '✓' : '○'} المانجا فقط
                    </button>
                  </div>
                </div>
              </div>

              <h2 className="text-lg font-bold border-r-4 border-primary pr-3">
                الحلقات {hasActiveFilters && `(${filteredEpisodes.length} من ${availableEpisodes.length})`}
                {!hasActiveFilters && `({availableEpisodes.length})`}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredEpisodes.map((ep) => {
                const categoryStyle = getCategoryStyle(ep.category);
                const isCurrentEpisode = ep.episode_number === epNum;

                return (
                  <Link
                    key={ep.id}
                    to={`/watch/${animeId}/${ep.episode_number}`}
                    className={`p-3 rounded-lg border transition-all hover:scale-105 ${
                      isCurrentEpisode
                        ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/50"
                        : `bg-card border-border hover:border-primary/50 ${categoryStyle.bg} ${categoryStyle.border}`
                    }`}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-lg font-bold ${!isCurrentEpisode && categoryStyle.text}`}>
                          {ep.episode_number}
                        </span>
                        {categoryStyle.label && !isCurrentEpisode && (
                          <span className="text-sm">{categoryStyle.label}</span>
                        )}
                      </div>
                      {ep.tags && ep.tags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {ep.tags.map((tag: string) => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {tag === 'filler' ? 'F' : tag === 'manga' ? 'M' : 'خاص'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                );
                })}
              </div>
            </div>
          );
        })()}

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
