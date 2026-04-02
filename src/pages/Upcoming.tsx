import { useState } from "react";
import Layout from "@/components/Layout";
import AnimeCard from "@/components/AnimeCard";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMultipleAnimeTmdbArtwork } from "@/hooks/useAnime";
import { resolveTitleArtworkUrl } from "@/lib/titleArtwork";

async function fetchUpcoming(page: number) {
  const response = await fetch(`https://api.jikan.moe/v4/seasons/upcoming?page=${page}`);
  if (!response.ok) throw new Error("Failed to fetch upcoming anime");
  return response.json();
}

export default function Upcoming() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["upcoming", page],
    queryFn: () => fetchUpcoming(page),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  const { data: artworkMap } = useMultipleAnimeTmdbArtwork(data?.data);

  const hasNextPage = data?.pagination?.has_next_page;
  const totalPages = data?.pagination?.last_visible_page || 1;

  return (
    <Layout>
      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-extrabold">الأنميات القادمة</h1>
          </div>
          <p className="text-muted-foreground">
            اكتشف أحدث الأنميات التي ستُعرض قريباً
          </p>
        </div>

        {/* Anime List */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 24 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
            ))}
          </div>
        ) : data?.data && data.data.length > 0 ? (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              {data.pagination.items.total} أنمي قادم
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {data.data.map((anime: any) => (
                <div key={anime.mal_id} className="relative">
                  <AnimeCard
                    anime={anime}
                    artworkUrl={resolveTitleArtworkUrl(artworkMap?.get(anime.mal_id), anime, "poster")}
                  />
                  {anime.aired?.from && (
                    <div className="absolute top-2 left-2 bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-bold shadow-lg">
                      {new Date(anime.aired.from).toLocaleDateString('ar-EG', {
                        month: 'short',
                        year: 'numeric'
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-8 flex justify-center items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronRight className="h-4 w-4 ml-1" />
                السابق
              </Button>

              <span className="text-sm text-muted-foreground">
                صفحة {page} من {totalPages}
              </span>

              <Button
                variant="outline"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasNextPage}
              >
                التالي
                <ChevronLeft className="h-4 w-4 mr-1" />
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">
              لا توجد أنميات قادمة في الوقت الحالي
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
