import { useParams, Link } from "react-router-dom";
import { Star, Calendar, Film, Clock, Building2, Music } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import TitleArtworkPlaceholder from "@/components/TitleArtworkPlaceholder";
import { useAnimeById, useAnimeEpisodes, useAnimeRecommendations, useAnimeCharacters, useAnimeThemes, useAnimeRelations, useAnimeTmdbArtwork, useMultipleAnimeTmdbArtwork } from "@/hooks/useAnime";
import AnimeCard from "@/components/AnimeCard";
import RelatedAnimeCard from "@/components/RelatedAnimeCard";
import { TrailerBanner } from "@/components/TrailerBanner";
import { STATUS_MAP, TYPE_MAP, GENRE_AR, RELATION_TYPE_AR, getVisibleGenres, isBlockedAnime, type JikanAnime } from "@/lib/jikan";
import { getTrailerYoutubeId } from "@/lib/trailerFallback";
import { getAnimeEpisodes as getSupabaseEpisodes, type AnimeEpisode } from "@/lib/supabase";
import { resolveTitleArtworkUrl } from "@/lib/titleArtwork";
import { useState, useEffect } from "react";

export default function AnimeDetail() {
  const { id } = useParams<{ id: string }>();
  const animeId = Number(id);
  const { data, isLoading } = useAnimeById(animeId);
  const [epPage, setEpPage] = useState(1);
  const { data: episodes, isLoading: loadingEp } = useAnimeEpisodes(animeId, epPage);
  const { data: recommendations, isLoading: loadingRec } = useAnimeRecommendations(animeId);
  const { data: characters, isLoading: loadingChars } = useAnimeCharacters(animeId);
  const { data: themes, isLoading: loadingThemes } = useAnimeThemes(animeId);
  const { data: relations, isLoading: loadingRelations } = useAnimeRelations(animeId);
  const [supabaseEpisodes, setSupabaseEpisodes] = useState<AnimeEpisode[]>([]);
  const isDetectiveConan = animeId === 235; // Detective Conan MAL ID
  const anime = data?.data;
  const { data: tmdbArtwork } = useAnimeTmdbArtwork(anime);
  const recommendationItems = recommendations?.data
    ? [...recommendations.data]
        .sort((a, b) => b.votes - a.votes)
        .slice(0, 12)
    : [];
  const recommendationAnime = recommendationItems.map((rec) => rec.entry as JikanAnime);
  const { data: recommendationArtworkMap } = useMultipleAnimeTmdbArtwork(recommendationAnime);

  // Fetch episodes from Supabase database
  useEffect(() => {
    async function fetchSupabaseEpisodes() {
      const dbEpisodes = await getSupabaseEpisodes(animeId);
      setSupabaseEpisodes(dbEpisodes);
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

  // Get trailer YouTube ID (from Jikan API or fallback database)
  const trailerYoutubeId = getTrailerYoutubeId(
    anime.mal_id,
    anime.trailer?.youtube_id || null,
    anime.trailer?.embed_url || null
  );
  const bannerImage = resolveTitleArtworkUrl(tmdbArtwork, anime, "banner");
  const posterImage = resolveTitleArtworkUrl(tmdbArtwork, anime, "poster");
  const isSeriesType = anime.type === "TV" || anime.type === "OVA" || anime.type === "ONA" || anime.type === "Special";
  const hasSupabaseEpisodes = supabaseEpisodes.length > 0;
  const hasPublicEpisodes = Boolean(episodes?.data && episodes.data.length > 0);
  const supabaseEpisodeMap = new Map(
    supabaseEpisodes.map((ep) => [ep.episode_number, ep])
  );
  const canWatchMovie = anime.type === "Movie";
  const canWatchSeries = isSeriesType && (hasSupabaseEpisodes || hasPublicEpisodes || Boolean(anime.episodes && anime.episodes > 0));

  return (
    <Layout>
      {/* Banner */}
      {trailerYoutubeId ? (
        <TrailerBanner
          youtubeId={trailerYoutubeId}
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
          ) : (
            <TitleArtworkPlaceholder
              title={anime.title}
              variant="banner"
              className="absolute inset-0"
            />
          )}
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
          ) : (
            <TitleArtworkPlaceholder
              title={anime.title}
              variant="poster"
              className="w-48 aspect-[2/3] rounded-lg shadow-xl border border-border shrink-0"
            />
          )}

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
              {anime.episodes && (
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
                  <Link to={`/watch/${anime.mal_id}/1`}>شاهد الفيلم</Link>
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
          <h2 className="text-xl font-bold border-r-4 border-primary pr-3">قائمة الحلقات</h2>

          {/* Show color legend for Detective Conan */}
          {isDetectiveConan && hasSupabaseEpisodes && (
            <div className="flex flex-wrap gap-3 items-center text-sm bg-slate-800 text-white p-4 rounded-lg border border-slate-700">
              <span className="font-bold">دليل الألوان:</span>
              <div className="bg-green-500/30 border-2 border-green-500 px-3 py-1.5 rounded font-medium">مانجا/القصة الرئيسية</div>
              <div className="bg-blue-500/30 border-2 border-blue-500 px-3 py-1.5 rounded font-medium">المنظمة السوداء</div>
              <div className="bg-gray-400/30 border-2 border-gray-400 px-3 py-1.5 rounded font-medium">فلر</div>
              <div className="bg-slate-700 border-2 border-red-500 px-3 py-1.5 rounded font-medium">حلقة خاصة</div>
            </div>
          )}

          {loadingEp && !hasSupabaseEpisodes ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : hasPublicEpisodes ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {episodes.data.map((ep) => {
                    const dbEpisode = supabaseEpisodeMap.get(ep.mal_id);
                    const style = getEpisodeStyle(dbEpisode || ep);
                    return (
                      <Link
                        key={ep.mal_id}
                        to={`/watch/${animeId}/${ep.mal_id}`}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors hover:bg-secondary/50 ${style.background} ${style.border}`}
                      >
                        <span className="text-primary font-bold text-sm w-8 text-center shrink-0">
                          {ep.mal_id}
                        </span>
                        <span className="text-sm line-clamp-1 flex-1">
                          {ep.title || `الحلقة ${ep.mal_id}`}
                        </span>
                      </Link>
                    );
                  })}
              </div>

              {episodes.pagination && (
                <div className="flex justify-center gap-3 mt-4">
                  <Button variant="outline" disabled={epPage <= 1} onClick={() => setEpPage((p) => p - 1)}>
                    السابق
                  </Button>
                  <span className="flex items-center text-sm text-muted-foreground">صفحة {epPage}</span>
                  <Button variant="outline" disabled={!episodes.pagination.has_next_page} onClick={() => setEpPage((p) => p + 1)}>
                    التالي
                  </Button>
                </div>
              )}
            </>
          ) : hasSupabaseEpisodes ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {supabaseEpisodes
                  .sort((a, b) => a.episode_number - b.episode_number)
                  .map((ep) => (
                  <Link
                    key={ep.id}
                    to={`/watch/${animeId}/${ep.episode_number}`}
                    className={`flex items-center gap-3 p-3 rounded-lg border-2 hover:bg-secondary/50 transition-colors ${getEpisodeStyle(ep).background} ${getEpisodeStyle(ep).border}`}
                  >
                    <span className="text-primary font-bold text-base w-10 text-center shrink-0">
                      {ep.episode_number}
                    </span>
                    <span className="text-sm flex-1">
                      الحلقة {ep.episode_number}
                    </span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد حلقات متاحة</p>
          )}
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

        {/* Theme Songs */}
        <div className="mt-10 space-y-6">
          {loadingThemes ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          ) : themes?.data && (themes.data.openings?.length > 0 || themes.data.endings?.length > 0) ? (
            <>
              {themes.data.openings?.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold border-r-4 border-primary pr-3 flex items-center gap-2">
                    <Music className="h-5 w-5 text-primary" />
                    أغاني الافتتاح
                  </h2>
                  <div className="space-y-1.5">
                    {themes.data.openings.map((op, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                        <span className="text-primary font-bold text-sm w-6 text-center shrink-0">{i + 1}</span>
                        <span className="text-sm line-clamp-1">{op}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {themes.data.endings?.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold border-r-4 border-primary pr-3 flex items-center gap-2">
                    <Music className="h-5 w-5 text-primary" />
                    أغاني الختام
                  </h2>
                  <div className="space-y-1.5">
                    {themes.data.endings.map((ed, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
                        <span className="text-primary font-bold text-sm w-6 text-center shrink-0">{i + 1}</span>
                        <span className="text-sm line-clamp-1">{ed}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد أغاني متاحة</p>
          )}
        </div>

        {/* Related Seasons & Movies */}
        <div className="mt-10 space-y-4">
          <h2 className="text-xl font-bold border-r-4 border-primary pr-3">المواسم والأفلام المرتبطة</h2>
          {loadingRelations ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[3/4] rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : relations?.data && relations.data.length > 0 ? (
            <div className="space-y-4">
              {relations.data.map((group) => {
                const animeEntries = group.entry.filter((e) => e.type === "anime");
                if (animeEntries.length === 0) return null;
                const label = RELATION_TYPE_AR[group.relation] || group.relation;
                return (
                  <div key={group.relation} className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground">{label}</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {animeEntries.map((entry) => (
                        <RelatedAnimeCard
                          key={entry.mal_id}
                          mal_id={entry.mal_id}
                          name={entry.name}
                          relationLabel={label}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد أعمال مرتبطة</p>
          )}
        </div>

        {/* Related Recommendations */}
        <div className="mt-10 space-y-4">
          <h2 className="text-xl font-bold border-r-4 border-primary pr-3">أنمي مشابه</h2>
          {loadingRec ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="aspect-[3/4] rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ))}
            </div>
          ) : recommendations?.data && recommendations.data.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {recommendationItems.map((rec, index) => (
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
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد توصيات متاحة</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
