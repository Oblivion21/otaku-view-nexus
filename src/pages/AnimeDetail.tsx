import { useParams, Link } from "react-router-dom";
import { Star, Calendar, Film, Clock, Building2 } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimeById, useAnimeEpisodes } from "@/hooks/useAnime";
import { STATUS_MAP, TYPE_MAP, GENRE_AR } from "@/lib/jikan";
import { useState } from "react";

export default function AnimeDetail() {
  const { id } = useParams<{ id: string }>();
  const animeId = Number(id);
  const { data, isLoading } = useAnimeById(animeId);
  const [epPage, setEpPage] = useState(1);
  const { data: episodes, isLoading: loadingEp } = useAnimeEpisodes(animeId, epPage);

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

  const anime = data?.data;
  if (!anime) return <Layout><div className="container py-16 text-center">لم يتم العثور على الأنمي</div></Layout>;

  return (
    <Layout>
      {/* Banner */}
      <div className="relative h-[300px] md:h-[400px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${anime.images.webp.large_image_url})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
      </div>

      <div className="container -mt-32 relative z-10 pb-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Poster */}
          <img
            src={anime.images.webp.large_image_url}
            alt={anime.title}
            className="w-48 rounded-lg shadow-xl border border-border shrink-0"
          />

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
              {anime.genres.map((g) => (
                <Badge key={g.mal_id} variant="secondary" className="text-xs">
                  {GENRE_AR[g.name] || g.name}
                </Badge>
              ))}
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {anime.synopsis}
            </p>

            {/* Watch trailer */}
            {anime.trailer?.youtube_id && (
              <Button asChild>
                <Link to={`/watch/${anime.mal_id}/trailer`}>شاهد العرض الدعائي</Link>
              </Button>
            )}
          </div>
        </div>

        {/* Episode list */}
        <div className="mt-10 space-y-4">
          <h2 className="text-xl font-bold border-r-4 border-primary pr-3">قائمة الحلقات</h2>

          {loadingEp ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : episodes?.data && episodes.data.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {episodes.data.map((ep) => (
                  <Link
                    key={ep.mal_id}
                    to={`/watch/${animeId}/${ep.mal_id}`}
                    className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-secondary transition-colors"
                  >
                    <span className="text-primary font-bold text-sm w-8 text-center shrink-0">
                      {ep.mal_id}
                    </span>
                    <span className="text-sm line-clamp-1 flex-1">
                      {ep.title || `الحلقة ${ep.mal_id}`}
                    </span>
                    {ep.filler && (
                      <Badge variant="outline" className="text-[10px] shrink-0">فلر</Badge>
                    )}
                  </Link>
                ))}
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
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد حلقات متاحة</p>
          )}
        </div>
      </div>
    </Layout>
  );
}
