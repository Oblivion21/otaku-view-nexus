import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import AnimeGrid from "@/components/AnimeGrid";
import { useMultipleAnimeTmdbArtwork, useSearchAnime } from "@/hooks/useAnime";
import { Button } from "@/components/ui/button";
import { dedupeAnimeList } from "@/lib/listDeduping";
import { hasAnyTitleArtwork } from "@/lib/titleArtwork";

function parsePageParam(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const page = parsePageParam(searchParams.get("page"));

  function updatePage(nextPage: number) {
    const nextParams = new URLSearchParams(searchParams);

    if (nextPage <= 1) {
      nextParams.delete("page");
    } else {
      nextParams.set("page", String(nextPage));
    }

    setSearchParams(nextParams);
  }

  const { data, isLoading } = useSearchAnime(query, page);
  const dedupedAnime = dedupeAnimeList(data?.data);
  const { data: artworkMap } = useMultipleAnimeTmdbArtwork(dedupedAnime);
  const visibleAnime = dedupedAnime.filter((anime) => hasAnyTitleArtwork(anime, artworkMap?.get(anime.mal_id)));

  return (
    <Layout>
      <div className="container py-8 space-y-6">
        <h1 className="text-xl font-bold">
          نتائج البحث: <span className="text-primary">{query}</span>
        </h1>

        {query.length < 2 ? (
          <p className="text-muted-foreground">أدخل كلمتين على الأقل للبحث</p>
        ) : (
          <>
            <AnimeGrid
              title={isLoading ? "جارٍ البحث..." : `${visibleAnime.length} نتيجة`}
              anime={visibleAnime}
              isLoading={isLoading}
              artworkMap={artworkMap}
            />
            <div className="flex justify-center gap-3">
              <Button variant="outline" disabled={page <= 1} onClick={() => updatePage(page - 1)}>
                السابق
              </Button>
              <span className="flex items-center text-sm text-muted-foreground">صفحة {page}</span>
              <Button variant="outline" disabled={!data?.pagination?.has_next_page} onClick={() => updatePage(page + 1)}>
                التالي
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
