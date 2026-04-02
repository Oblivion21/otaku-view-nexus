import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import AnimeGrid from "@/components/AnimeGrid";
import { Button } from "@/components/ui/button";
import { useTopAnime, useSeasonNow, useAnimeByGenre, useGenres, useTopMovies } from "@/hooks/useAnime";
import { GENRE_AR } from "@/lib/jikan";

function parsePageParam(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter");
  const page = parsePageParam(searchParams.get("page"));
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);

  const { data: genres } = useGenres();

  const isPopular = filter === "popular";
  const isSeasonal = filter === "seasonal";
  const isMovies = filter === "movies";

  const { data: topData, isLoading: loadingTop } = useTopAnime(
    page,
    isPopular ? "bypopularity" : undefined
  );
  const { data: seasonalData, isLoading: loadingSeasonal } = useSeasonNow(page);
  const { data: genreData, isLoading: loadingGenre } = useAnimeByGenre(selectedGenre || 0, page);
  const { data: moviesData, isLoading: loadingMovies } = useTopMovies(page);

  const activeData = selectedGenre
    ? genreData
    : isMovies
    ? moviesData
    : isSeasonal
    ? seasonalData
    : topData;
  const activeLoading = selectedGenre
    ? loadingGenre
    : isMovies
    ? loadingMovies
    : isSeasonal
    ? loadingSeasonal
    : loadingTop;

  const title = selectedGenre
    ? `تصنيف: ${GENRE_AR[genres?.data?.find((g) => g.mal_id === selectedGenre)?.name || ""] || genres?.data?.find((g) => g.mal_id === selectedGenre)?.name}`
    : isMovies
    ? "افضل أفلام الأنمي"
    : isSeasonal
    ? "الأنمي الموسمي"
    : isPopular
    ? "الأكثر شعبية"
    : "قائمة الأنمي";

  function updatePage(nextPage: number) {
    const nextParams = new URLSearchParams(searchParams);

    if (nextPage <= 1) {
      nextParams.delete("page");
    } else {
      nextParams.set("page", String(nextPage));
    }

    setSearchParams(nextParams);
  }

  return (
    <Layout>
      <div className="container py-8 space-y-6">
        {/* Genre filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={selectedGenre === null ? "default" : "secondary"}
            onClick={() => {
              setSelectedGenre(null);
              updatePage(1);
            }}
          >
            الكل
          </Button>
          {genres?.data?.slice(0, 20).map((g) => (
            <Button
              key={g.mal_id}
              size="sm"
              variant={selectedGenre === g.mal_id ? "default" : "secondary"}
              onClick={() => {
                setSelectedGenre(g.mal_id);
                updatePage(1);
              }}
            >
              {GENRE_AR[g.name] || g.name}
            </Button>
          ))}
        </div>

        <AnimeGrid title={title} anime={activeData?.data} isLoading={activeLoading} />

        {/* Pagination */}
        <div className="flex justify-center gap-3">
          <Button
            variant="outline"
            disabled={page <= 1}
            onClick={() => updatePage(page - 1)}
          >
            السابق
          </Button>
          <span className="flex items-center text-sm text-muted-foreground">
            صفحة {page}
          </span>
          <Button
            variant="outline"
            disabled={!activeData?.pagination?.has_next_page}
            onClick={() => updatePage(page + 1)}
          >
            التالي
          </Button>
        </div>
      </div>
    </Layout>
  );
}
