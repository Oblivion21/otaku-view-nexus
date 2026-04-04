import Layout from "@/components/Layout";
import HeroCarousel, { type HeroCarouselItem } from "@/components/HeroCarousel";
import AnimeGrid from "@/components/AnimeGrid";
import { useFeaturedCarousel, useMultipleAnimeTmdbArtwork, useSeasonNow, useTopAnime, useTopMovies } from "@/hooks/useAnime";
import { useSectionVisibility } from "@/hooks/useSectionVisibility";
import { dedupeAnimeList } from "@/lib/listDeduping";
import { hasAnyTitleArtwork, resolveTitleArtworkUrl } from "@/lib/titleArtwork";

const Index = () => {
  const { ref: popularSectionRef, isVisible: popularSectionVisible } = useSectionVisibility();
  const { ref: topSectionRef, isVisible: topSectionVisible } = useSectionVisibility();
  const { ref: moviesSectionRef, isVisible: moviesSectionVisible } = useSectionVisibility();

  const { data: airing, isLoading: loadingAiring } = useTopAnime(1, "airing");
  const { data: featuredCarouselItems, isLoading: loadingFeatured, error: featuredError } = useFeaturedCarousel();
  const { data: seasonal, isLoading: loadingSeasonal } = useSeasonNow();
  const { data: popular, isLoading: loadingPopular } = useTopAnime(1, "bypopularity", { enabled: popularSectionVisible });
  const { data: top, isLoading: loadingTop } = useTopAnime(1, undefined, { enabled: topSectionVisible });
  const { data: movies, isLoading: loadingMovies } = useTopMovies(1, { enabled: moviesSectionVisible });

  const heroSourceAnime = (() => {
    const featuredItems = dedupeAnimeList(featuredCarouselItems);

    if (loadingFeatured) {
      return [];
    }

    if (featuredItems.length > 0) {
      return featuredItems.slice(0, 5);
    }

    if (featuredError) {
      return dedupeAnimeList(airing?.data?.slice(0, 5));
    }

    return dedupeAnimeList((featuredCarouselItems?.length ? featuredCarouselItems : airing?.data)?.slice(0, 5));
  })();

  const seasonalAnime = dedupeAnimeList(seasonal?.data?.slice(0, 12));
  const popularAnime = dedupeAnimeList(popular?.data?.slice(0, 12));
  const topAnime = dedupeAnimeList(top?.data?.slice(0, 12));
  const movieAnime = dedupeAnimeList(movies?.data?.slice(0, 12));
  const visibleHomepageAnime = dedupeAnimeList([
    ...heroSourceAnime,
    ...seasonalAnime,
    ...(popularSectionVisible ? popularAnime : []),
    ...(topSectionVisible ? topAnime : []),
    ...(moviesSectionVisible ? movieAnime : []),
  ]);
  const {
    data: homepageArtworkMap,
    isLoading: loadingHomepageArtwork,
  } = useMultipleAnimeTmdbArtwork(visibleHomepageAnime);

  const heroItems: HeroCarouselItem[] = heroSourceAnime
    .filter((anime) => hasAnyTitleArtwork(anime, homepageArtworkMap?.get(anime.mal_id)))
    .map((anime) => ({
      anime,
      bannerImage: resolveTitleArtworkUrl(homepageArtworkMap?.get(anime.mal_id), anime, "banner"),
      scoreValue: homepageArtworkMap?.get(anime.mal_id)?.imdbRating ?? null,
    }));

  const heroLoading = loadingFeatured || ((loadingAiring || loadingHomepageArtwork) && heroItems.length === 0);
  const seasonalLoading = loadingSeasonal || (seasonalAnime.length > 0 && loadingHomepageArtwork && !seasonalAnime.some((anime) => homepageArtworkMap?.has(anime.mal_id)));
  const popularLoading = !popularSectionVisible || loadingPopular || (popularAnime.length > 0 && loadingHomepageArtwork && !popularAnime.some((anime) => homepageArtworkMap?.has(anime.mal_id)));
  const topLoading = !topSectionVisible || loadingTop || (topAnime.length > 0 && loadingHomepageArtwork && !topAnime.some((anime) => homepageArtworkMap?.has(anime.mal_id)));
  const moviesLoading = !moviesSectionVisible || loadingMovies || (movieAnime.length > 0 && loadingHomepageArtwork && !movieAnime.some((anime) => homepageArtworkMap?.has(anime.mal_id)));

  return (
    <Layout>
      <HeroCarousel items={heroItems} isLoading={heroLoading} />
      <div className="container py-8 space-y-10">
        <AnimeGrid
          title="الموسم الحالي"
          anime={seasonalAnime}
          isLoading={seasonalLoading}
          artworkMap={homepageArtworkMap}
        />
        <div ref={popularSectionRef}>
          <AnimeGrid
            title="الأكثر شعبية"
            anime={popularSectionVisible ? popularAnime : undefined}
            isLoading={popularLoading}
            artworkMap={homepageArtworkMap}
          />
        </div>
        <div ref={topSectionRef}>
          <AnimeGrid
            title="الأعلى تقييماً"
            anime={topSectionVisible ? topAnime : undefined}
            isLoading={topLoading}
            artworkMap={homepageArtworkMap}
          />
        </div>
        <div ref={moviesSectionRef}>
          <AnimeGrid
            title="افضل افلام الأنمي"
            anime={moviesSectionVisible ? movieAnime : undefined}
            isLoading={moviesLoading}
            artworkMap={homepageArtworkMap}
          />
        </div>
      </div>
    </Layout>
  );
};

export default Index;
