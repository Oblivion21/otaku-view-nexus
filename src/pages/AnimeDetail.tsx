import { useParams, Link } from "react-router-dom";
import { Star, Calendar, Film, Clock, Building2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ContentRail from "@/components/ContentRail";
import EpisodePreviewRail from "@/components/EpisodePreviewRail";
import { useAnimeAniListMedia, useAnimeById, useAnimeEpisodes, useAnimeRecommendations, useAnimeCharacters, useAnimeRelations, useAnimeTmdbArtwork, useAnimeEpisodePreviewImages, useMultipleAnimeTmdbArtwork } from "@/hooks/useAnime";
import AnimeCard from "@/components/AnimeCard";
import RelatedAnimeCard from "@/components/RelatedAnimeCard";
import { TrailerBanner } from "@/components/TrailerBanner";
import { STATUS_MAP, TYPE_MAP, GENRE_AR, RELATION_TYPE_AR, getVisibleGenres, isBlockedAnime, type JikanAnime } from "@/lib/jikan";
import { dedupeAnimeList, dedupeJikanEpisodes, dedupeRelationEntries, dedupeSupabaseEpisodes } from "@/lib/listDeduping";
import { getTrailerYoutubeId } from "@/lib/trailerFallback";
import { getAnimeEpisodes as getSupabaseEpisodes, type AnimeEpisode } from "@/lib/supabase";
import { hasAnyTitleArtwork, resolveTitleArtworkUrl } from "@/lib/titleArtwork";
import { useState, useEffect } from "react";

function hasPlayableEpisodeData(episode: Pick<AnimeEpisode, "video_sources" | "video_url"> | null | undefined) {
  return Boolean(
    episode?.video_url ||
    (Array.isArray(episode?.video_sources) && episode.video_sources.length > 0),
  );
}

function hasAnimeAlreadyAired(anime: Pick<JikanAnime, "status" | "aired">) {
  if (anime.status === "Not yet aired") {
    return false;
  }

  const airedFrom = anime.aired?.from;
  if (!airedFrom) {
    return true;
  }

  const parsedAiredFrom = Date.parse(airedFrom);
  if (Number.isNaN(parsedAiredFrom)) {
    return true;
  }

  return parsedAiredFrom <= Date.now();
}

function formatEpisodeScoreLabel(score: number | null | undefined) {
  if (typeof score !== "number" || Number.isNaN(score) || score <= 0) {
    return null;
  }

  const normalizedScore = score <= 5 ? score * 2 : score;
  return normalizedScore.toFixed(1);
}

export default function AnimeDetail() {
  const { id } = useParams<{ id: string }>();
  const animeId = Number(id);
  const { data, isLoading } = useAnimeById(animeId);
  const { data: episodes, isLoading: loadingEp } = useAnimeEpisodes(animeId, 1);
  const { data: recommendations, isLoading: loadingRec } = useAnimeRecommendations(animeId);
  const { data: characters, isLoading: loadingChars } = useAnimeCharacters(animeId);
  const { data: relations, isLoading: loadingRelations } = useAnimeRelations(animeId);
  const [supabaseEpisodes, setSupabaseEpisodes] = useState<AnimeEpisode[]>([]);
  const [loadedSupabaseEpisodes, setLoadedSupabaseEpisodes] = useState(false);
  const isDetectiveConan = animeId === 235; // Detective Conan MAL ID
  const anime = data?.data;
  const { data: tmdbArtwork, isLoading: loadingTmdbArtwork } = useAnimeTmdbArtwork(anime);
  const { data: aniListMedia, isLoading: loadingAniListMedia } = useAnimeAniListMedia(anime, Boolean(anime));
  const isSeriesType = anime?.type === "TV" || anime?.type === "OVA" || anime?.type === "ONA" || anime?.type === "Special" || anime?.type === "TV Special";
  const isMovie = anime?.type === "Movie";
  const dedupedSupabaseEpisodes = dedupeSupabaseEpisodes(supabaseEpisodes)
    .sort((a, b) => a.episode_number - b.episode_number);
  const dedupedPublicEpisodes = dedupeJikanEpisodes(episodes?.data);
  const hasSupabaseEpisodes = dedupedSupabaseEpisodes.length > 0;
  const hasPublicEpisodes = dedupedPublicEpisodes.length > 0;
  const supabaseEpisodeMap = new Map(
    dedupedSupabaseEpisodes.map((ep) => [ep.episode_number, ep])
  );
  const firstPlayableSupabaseEpisode = dedupedSupabaseEpisodes.find((ep) => hasPlayableEpisodeData(ep)) ?? null;
  const firstSupabaseEpisode = dedupedSupabaseEpisodes[0] ?? null;
  const preferredMovieEpisodeNumber = firstPlayableSupabaseEpisode?.episode_number ?? firstSupabaseEpisode?.episode_number ?? 1;
  const hasMovieMainPlayer = Boolean(
    (tmdbArtwork?.tmdbId && tmdbArtwork.mediaType === "movie")
    || aniListMedia?.id,
  );
  const canWatchMovie = Boolean(
    anime
    && isMovie
    && hasAnimeAlreadyAired(anime)
    && (hasMovieMainPlayer || hasPlayableEpisodeData(firstPlayableSupabaseEpisode)),
  );
  const canWatchSeries = Boolean(anime && isSeriesType && (hasSupabaseEpisodes || hasPublicEpisodes));
  const rawEpisodeRailItems = hasPublicEpisodes
    ? dedupedPublicEpisodes.slice(0, 24).map((ep) => {
        const dbEpisode = supabaseEpisodeMap.get(ep.mal_id);
        return {
          episodeNumber: ep.mal_id,
          title: ep.title || `الحلقة ${ep.mal_id}`,
          scoreLabel: formatEpisodeScoreLabel(ep.score),
          styleTarget: dbEpisode || { category: null, tags: [] },
        };
      })
    : dedupedSupabaseEpisodes.slice(0, 24).map((ep) => ({
        episodeNumber: ep.episode_number,
        title: `الحلقة ${ep.episode_number}`,
        scoreLabel: null,
        styleTarget: ep,
      }));
  const episodeNumbers = rawEpisodeRailItems.map((item) => item.episodeNumber);
  const { data: episodePreviewImageMap } = useAnimeEpisodePreviewImages(
    animeId,
    tmdbArtwork,
    episodeNumbers,
    canWatchSeries && !isMovie,
  );
  const recommendationItems = (() => {
    if (!recommendations?.data) return [];

    const seen = new Set<number>();
    return [...recommendations.data]
      .sort((a, b) => b.votes - a.votes)
      .filter((rec) => {
        const malId = rec.entry.mal_id;
        if (seen.has(malId)) {
          return false;
        }
        seen.add(malId);
        return true;
      })
      .slice(0, 12);
  })();
  const recommendationAnime = dedupeAnimeList(recommendationItems.map((rec) => rec.entry as JikanAnime));
  const {
    data: recommendationArtworkMap,
    isLoading: loadingRecommendationArtwork,
  } = useMultipleAnimeTmdbArtwork(recommendationAnime);
  const visibleRecommendationItems = recommendationItems.filter((rec) =>
    hasAnyTitleArtwork(rec.entry as JikanAnime, recommendationArtworkMap?.get(rec.entry.mal_id)),
  );

  // Fetch episodes from Supabase database
  useEffect(() => {
    async function fetchSupabaseEpisodes() {
      setLoadedSupabaseEpisodes(false);
      try {
        const dbEpisodes = await getSupabaseEpisodes(animeId);
        setSupabaseEpisodes(dbEpisodes);
      } finally {
        setLoadedSupabaseEpisodes(true);
      }
    }
    if (animeId) {
      fetchSupabaseEpisodes();
    }
  }, [animeId]);

  // Get episode styling based on category and tags (Detective Conan only)
  function getEpisodeStyle(episode: Pick<AnimeEpisode, "category" | "tags">) {
    if (!isDetectiveConan) {
      return {
        background: 'bg-card',
        border: 'border-border hover:border-primary/50'
      };
    }

    let background = 'bg-card';
    let border = 'border-border hover:border-primary/50';

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
      border = 'border-red-500 hover:border-red-600';
    }

    return { background, border };
  }

  function getEpisodeBadges(episode: Pick<AnimeEpisode, "category" | "tags">) {
    const badges: string[] = [];

    if (episode.category === "main_story") {
      badges.push("القصة الرئيسية");
    } else if (episode.category === "black_org") {
      badges.push("المنظمة السوداء");
    }

    if (episode.tags?.includes("filler")) {
      badges.push("فلر");
    }

    if (episode.tags?.includes("special")) {
      badges.push("خاصة");
    }

    if (episode.tags?.includes("manga")) {
      badges.push("مانجا");
    }

    return badges;
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-8 space-y-4">
          <Skeleton className="w-full h-[300px] rounded-lg" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Layout>
    );
  }

  if (!anime || isBlockedAnime(anime)) {
    return <Layout><div className="container py-16 text-center">لم يتم العثور على الأنمي</div></Layout>;
  }

  const sortedCharacters = characters?.data
    ? [...characters.data]
        .sort((a, b) => (a.role === "Main" ? -1 : 1) - (b.role === "Main" ? -1 : 1))
        .slice(0, 12)
    : [];

  // TMDB is the primary trailer source; Jikan/MAL only fills gaps.
  const trailerYoutubeId = getTrailerYoutubeId(
    tmdbArtwork?.trailerYoutubeId,
    anime.trailer?.youtube_id || null,
    anime.trailer?.embed_url || null,
    anime.trailer?.url || null,
  );
  const fallbackTrailerYoutubeId = tmdbArtwork?.trailerYoutubeId
    ? getTrailerYoutubeId(
        null,
        anime.trailer?.youtube_id || null,
        anime.trailer?.embed_url || null,
        anime.trailer?.url || null,
      )
    : null;
  const bannerImage = resolveTitleArtworkUrl(tmdbArtwork, anime, "banner");
  const posterImage = resolveTitleArtworkUrl(tmdbArtwork, anime, "poster");
  const episodeSeriesFallbackImage = bannerImage || posterImage;
  const episodeRailItems = rawEpisodeRailItems.map((item) => {
    const style = getEpisodeStyle(item.styleTarget);
    const previewImage = episodePreviewImageMap?.get(item.episodeNumber);

    return {
      ...item,
      href: `/watch/${animeId}/${item.episodeNumber}`,
      imageUrl: previewImage?.imageUrl || episodeSeriesFallbackImage || null,
      fallbackImageUrl: previewImage?.fallbackImageUrl || episodeSeriesFallbackImage || null,
      scoreLabel: item.scoreLabel,
      badges: getEpisodeBadges(item.styleTarget),
      styleClassName: `${style.background} ${style.border}`,
    };
  });
  const relatedGroups = (relations?.data || [])
    .map((group) => {
      const animeEntries = dedupeRelationEntries(group.entry.filter((entry) => entry.type === "anime"));
      return {
        relation: group.relation,
        label: RELATION_TYPE_AR[group.relation] || group.relation,
        entries: animeEntries,
      };
    })
    .filter((group) => group.entries.length > 0);

  return (
    <Layout>
      {/* Banner */}
      {trailerYoutubeId ? (
        <TrailerBanner
          youtubeId={trailerYoutubeId}
          fallbackYoutubeId={fallbackTrailerYoutubeId}
          posterUrl={bannerImage}
          title={anime.title}
          height="400px"
        />
      ) : (
        <div className="relative h-[300px] md:h-[400px] overflow-hidden">
          {bannerImage ? (
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${bannerImage})` }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
        </div>
      )}

      <div className="container -mt-32 relative z-10 pb-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Poster */}
          {posterImage ? (
            <img
              src={posterImage}
              alt={anime.title}
              className="w-48 aspect-[2/3] object-cover rounded-lg shadow-xl border border-border shrink-0"
            />
          ) : null}

          {/* Info */}
          <div className="space-y-3 flex-1">
            <h1 className="text-2xl md:text-3xl font-extrabold">{anime.title}</h1>
            {anime.title_japanese && (
              <p className="text-muted-foreground">{anime.title_japanese}</p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {anime.score && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-anime-gold text-anime-gold" />
                  <span className="font-bold text-anime-gold">{anime.score}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-muted-foreground">
                <Film className="h-4 w-4" />
                {TYPE_MAP[anime.type || ""] || anime.type}
              </div>
              {anime.episodes && !isMovie && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {anime.episodes} حلقة
                </div>
              )}
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                {anime.aired?.string}
              </div>
              {anime.studios?.[0] && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  {anime.studios[0].name}
                </div>
              )}
            </div>

            <Badge variant="outline" className="text-xs">
              {STATUS_MAP[anime.status] || anime.status}
            </Badge>

            <div className="flex flex-wrap gap-1.5">
              {getVisibleGenres(anime).map((g) => (
                <Badge key={g.mal_id} variant="secondary" className="text-xs">
                  {GENRE_AR[g.name] || g.name}
                </Badge>
              ))}
            </div>

            <div className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              <p className="line-clamp-4">
                {anime.synopsis}
              </p>
              {anime.synopsis && anime.synopsis.length > 200 && (
                <a
                  href={anime.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline text-xs mt-1 inline-block"
                >
                  ... عرض المزيد
                </a>
              )}
            </div>

            {/* Watch buttons */}
            <div className="flex flex-wrap gap-2">
              {trailerYoutubeId && (
                <Button asChild variant="outline">
                  <Link to={`/watch/${anime.mal_id}/trailer`}>شاهد العرض الدعائي</Link>
                </Button>
              )}
              {canWatchMovie && (
                <Button asChild>
                  <Link to={`/watch/${anime.mal_id}/${preferredMovieEpisodeNumber}`}>شاهد الفيلم</Link>
                </Button>
              )}
              {isMovie && loadedSupabaseEpisodes && !loadingTmdbArtwork && !loadingAniListMedia && !canWatchMovie && (
                <Button disabled variant="secondary">
                  غير متوفر حالياً
                </Button>
              )}
              {canWatchSeries && (
                <Button asChild>
                  <Link to={`/watch/${anime.mal_id}/1`}>شاهد الحلقة 1</Link>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Episode list */}
        {canWatchSeries && (
        <div className="mt-10 space-y-4">
          <EpisodePreviewRail
            title="قائمة الحلقات"
            loading={loadingEp && !hasSupabaseEpisodes}
            items={episodeRailItems}
            emptyMessage="لا توجد حلقات متاحة"
            headerActionHref={`/watch/${anime.mal_id}/1`}
            headerActionLabel="عرض كل الحلقات"
            accentLegend={isDetectiveConan && hasSupabaseEpisodes ? (
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary" className="bg-green-500/15 text-green-100 border-green-500/30">القصة الرئيسية</Badge>
                <Badge variant="secondary" className="bg-blue-500/15 text-blue-100 border-blue-500/30">المنظمة السوداء</Badge>
                <Badge variant="secondary" className="bg-gray-400/15 text-gray-100 border-gray-400/30">فلر</Badge>
                <Badge variant="secondary" className="bg-red-500/15 text-red-100 border-red-500/30">خاصة</Badge>
              </div>
            ) : undefined}
          />
        </div>
        )}

        {/* Characters & Voice Actors */}
        <div className="mt-10 space-y-4">
          <h2 className="text-xl font-bold border-r-4 border-primary pr-3">الشخصيات والممثلين الصوتيين</h2>

          {loadingChars ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : sortedCharacters.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedCharacters.map((entry) => {
                const japaneseVA = entry.voice_actors?.find((va) => va.language === "Japanese");
                return (
                  <div
                    key={entry.character.mal_id}
                    className="flex items-center gap-0 rounded-lg bg-card border border-border overflow-hidden"
                  >
                    {/* Character side */}
                    <div className="flex items-center gap-3 flex-1 p-3">
                      <img
                        src={entry.character.images?.webp?.image_url || entry.character.images?.jpg?.image_url}
                        alt={entry.character.name}
                        className="w-14 h-14 rounded-md object-cover shrink-0"
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold line-clamp-1">{entry.character.name}</p>
                        <Badge variant={entry.role === "Main" ? "default" : "secondary"} className="text-[10px] mt-1">
                          {entry.role === "Main" ? "رئيسي" : "ثانوي"}
                        </Badge>
                      </div>
                    </div>

                    {/* VA side - clickable */}
                    {japaneseVA && (
                      <Link
                        to={`/person/${japaneseVA.person.mal_id}`}
                        className="flex items-center gap-3 flex-1 p-3 border-r border-border justify-end text-left hover:bg-accent/50 transition-colors"
                      >
                        <div className="min-w-0 text-left">
                          <p className="text-sm text-muted-foreground line-clamp-1 hover:text-primary transition-colors">
                            {japaneseVA.person.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">ممثل صوتي</p>
                        </div>
                        <img
                          src={japaneseVA.person.images?.jpg?.image_url}
                          alt={japaneseVA.person.name}
                          className="w-14 h-14 rounded-md object-cover shrink-0"
                          loading="lazy"
                        />
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد بيانات شخصيات متاحة</p>
          )}
        </div>

        {/* Related Seasons & Movies */}
        <div className="mt-10 space-y-4">
          <h2 className="text-xl font-bold border-r-4 border-primary pr-3">المواسم والأفلام المرتبطة</h2>
          {loadingRelations ? (
            <ContentRail
              title="تحميل الأعمال المرتبطة"
              loading
              items={[]}
              emptyMessage="لا توجد أعمال مرتبطة"
            renderItem={() => null}
            />
          ) : relatedGroups.length > 0 ? (
            <div className="space-y-4">
              {relatedGroups.map((group) => {
                return (
                  <ContentRail
                    key={group.relation}
                    title={group.label}
                    items={group.entries}
                    emptyMessage="لا توجد أعمال مرتبطة"
                    renderItem={(entry) => (
                      <RelatedAnimeCard
                        mal_id={entry.mal_id}
                        name={entry.name}
                        relationLabel={group.label}
                      />
                    )}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد أعمال مرتبطة</p>
          )}
        </div>

        {/* Related Recommendations */}
        <div className="mt-10 space-y-4">
          <ContentRail
            title="أنمي مشابه"
            loading={loadingRec || (recommendationAnime.length > 0 && loadingRecommendationArtwork)}
            items={visibleRecommendationItems}
            emptyMessage="لا توجد توصيات متاحة"
            renderItem={(rec, index) => (
              <div key={rec.entry.mal_id} className="relative">
                <div className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shadow-lg ring-2 ring-background">
                  {index + 1}
                </div>
                <AnimeCard
                  anime={rec.entry as JikanAnime}
                  artworkUrl={resolveTitleArtworkUrl(
                    recommendationArtworkMap?.get(rec.entry.mal_id),
                    rec.entry as JikanAnime,
                    "poster",
                  )}
                />
              </div>
            )}
          />
        </div>
      </div>
    </Layout>
  );
}
