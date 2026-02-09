import { useParams, Link } from "react-router-dom";
import { ChevronRight, ChevronLeft } from "lucide-react";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnimeById, useAnimeEpisodes } from "@/hooks/useAnime";

export default function EpisodeWatch() {
  const { id, episode } = useParams<{ id: string; episode: string }>();
  const animeId = Number(id);
  const isTrailer = episode === "trailer";
  const epNum = isTrailer ? 0 : Number(episode);

  const { data: animeData, isLoading } = useAnimeById(animeId);
  const { data: episodes } = useAnimeEpisodes(animeId);

  const anime = animeData?.data;

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

  const youtubeId = anime.trailer?.youtube_id;

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
          {youtubeId ? (
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-card border border-border">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`}
                title={`${anime.title} - ${isTrailer ? "Trailer" : `Episode ${epNum}`}`}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          ) : (
            <div className="w-full aspect-video rounded-lg bg-card border border-border flex items-center justify-center">
              <p className="text-muted-foreground">لا يوجد فيديو متاح</p>
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

        {/* Episode list */}
        {episodes?.data && episodes.data.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-3">
            <h2 className="text-lg font-bold border-r-4 border-primary pr-3">جميع الحلقات</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {episodes.data.map((ep) => (
                <Link
                  key={ep.mal_id}
                  to={`/watch/${animeId}/${ep.mal_id}`}
                  className={`p-2 rounded text-center text-sm border transition-colors ${
                    ep.mal_id === epNum
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:border-primary/50"
                  }`}
                >
                  {ep.mal_id}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
