import Layout from "@/components/Layout";
import HeroCarousel from "@/components/HeroCarousel";
import AnimeGrid from "@/components/AnimeGrid";
import { useTopAnime, useSeasonNow, useTopMovies } from "@/hooks/useAnime";

const Index = () => {
  const { data: popular, isLoading: loadingPopular } = useTopAnime(1, "bypopularity");
  const { data: seasonal, isLoading: loadingSeasonal } = useSeasonNow();
  const { data: top, isLoading: loadingTop } = useTopAnime(1);
  const { data: movies, isLoading: loadingMovies } = useTopMovies();

  return (
    <Layout>
      <HeroCarousel />
      <div className="container py-8 space-y-10">
        <AnimeGrid
          title="الموسم الحالي"
          anime={seasonal?.data?.slice(0, 12)}
          isLoading={loadingSeasonal}
        />
        <AnimeGrid
          title="الأكثر شعبية"
          anime={popular?.data?.slice(0, 12)}
          isLoading={loadingPopular}
        />
        <AnimeGrid
          title="الأعلى تقييماً"
          anime={top?.data?.slice(0, 12)}
          isLoading={loadingTop}
        />
        <AnimeGrid
          title="افضل افلام الأنمي"
          anime={movies?.data?.slice(0, 12)}
          isLoading={loadingMovies}
        />
      </div>
    </Layout>
  );
};

export default Index;
