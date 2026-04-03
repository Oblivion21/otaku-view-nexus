import { Link, useNavigate } from "react-router-dom";
import { Star, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import TitleArtworkPlaceholder from "@/components/TitleArtworkPlaceholder";
import { useFeaturedCarousel, useTopAnime } from "@/hooks/useAnime";
import { GENRE_AR, getVisibleGenres } from "@/lib/jikan";
import { getAnimeDetailPath } from "@/lib/animeRoutes";
import { dedupeAnimeList } from "@/lib/listDeduping";
import type { FeaturedCarouselAnime } from "@/lib/featuredCarousel";
import { getMultipleAnimeTmdbArtwork, type TmdbAnimeArtwork } from "@/lib/tmdb";
import { hasAnyTitleArtwork, resolveTitleArtworkUrl } from "@/lib/titleArtwork";
import { useState, useEffect, useRef } from "react";

interface AnimeWithBanner {
  anime: FeaturedCarouselAnime
  bannerImage: string | null
}

export default function HeroCarousel() {
  const navigate = useNavigate();
  const { data: defaultData, isLoading: defaultLoading } = useTopAnime(1, "airing");
  const {
    data: featuredCarouselItems,
    isLoading: featuredLoading,
    error: featuredError,
  } = useFeaturedCarousel();
  const [items, setItems] = useState<AnimeWithBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const [featuredUnavailable, setFeaturedUnavailable] = useState(false);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const activeSourceRef = useRef<"none" | "default" | "featured">("none");
  const activeItemsKeyRef = useRef("");
  const dedupedFeaturedItems = dedupeAnimeList(featuredCarouselItems);

  function getAnimeIdsKey(animeList: FeaturedCarouselAnime[]): string {
    return animeList.map((anime) => anime.mal_id).join(",");
  }

  function buildCarouselItems(
    animeList: FeaturedCarouselAnime[],
    artworkMap = new Map<number, TmdbAnimeArtwork>(),
  ): AnimeWithBanner[] {
    return animeList
      .filter((anime) => hasAnyTitleArtwork(anime, artworkMap.get(anime.mal_id)))
      .map((anime) => {
        const artwork = artworkMap.get(anime.mal_id);

        return {
          anime,
          bannerImage: resolveTitleArtworkUrl(artwork, anime, "banner"),
        };
      });
  }

  async function resolveCarouselItems(animeList: FeaturedCarouselAnime[], source: "default" | "featured") {
    const itemsKey = `${source}:${getAnimeIdsKey(animeList)}`;

    try {
      const artworkMap = await getMultipleAnimeTmdbArtwork(animeList);

      if (
        activeSourceRef.current !== source ||
        activeItemsKeyRef.current !== itemsKey
      ) {
        return false;
      }

      const hydratedItems = buildCarouselItems(animeList, artworkMap);
      if (hydratedItems.length > 0) {
        setItems(hydratedItems);
        setCurrent(0);
        setIsLoading(false);
        return true;
      }

      const fallbackItems = buildCarouselItems(animeList);
      if (fallbackItems.length > 0) {
        setItems(fallbackItems);
        setCurrent(0);
        setIsLoading(false);
        return true;
      }

      setItems([]);
      setCurrent(0);
      setIsLoading(false);
      return false;
    } catch (error) {
      console.error("Error hydrating carousel artwork:", error);
      if (
        activeSourceRef.current !== source ||
        activeItemsKeyRef.current !== itemsKey
      ) {
        return false;
      }

      const fallbackItems = buildCarouselItems(animeList);
      if (fallbackItems.length > 0) {
        setItems(fallbackItems);
        setCurrent(0);
        setIsLoading(false);
        return true;
      }

      setItems([]);
      setCurrent(0);
      setIsLoading(false);
      return false;
    }
  }

  useEffect(() => {
    const fallbackAnime = dedupeAnimeList(defaultData?.data?.slice(0, 5) ?? []);
    const canUseFallback = !featuredLoading
      && (Boolean(featuredError) || dedupedFeaturedItems.length === 0 || featuredUnavailable);

    if (!canUseFallback) {
      return;
    }

    if (fallbackAnime.length > 0 && activeSourceRef.current !== "featured") {
      activeSourceRef.current = "default";
      activeItemsKeyRef.current = `default:${getAnimeIdsKey(fallbackAnime)}`;
      setItems([]);
      setCurrent(0);
      setIsLoading(true);
      void resolveCarouselItems(fallbackAnime, "default");
      return;
    }

    if (!defaultLoading && fallbackAnime.length === 0 && activeSourceRef.current === "none") {
      setItems([]);
      setIsLoading(false);
    }
  }, [
    defaultData,
    defaultLoading,
    featuredCarouselItems,
    featuredError,
    featuredLoading,
    featuredUnavailable,
  ]);

  useEffect(() => {
    if (featuredLoading) {
      return;
    }

    if (!dedupedFeaturedItems.length) {
      setFeaturedUnavailable(false);
      return;
    }

    setFeaturedUnavailable(false);

    const itemsKey = `featured:${getAnimeIdsKey(dedupedFeaturedItems)}`;
    activeSourceRef.current = "featured";
    activeItemsKeyRef.current = itemsKey;
    setItems([]);
    setCurrent(0);
    setIsLoading(true);

    void (async () => {
      try {
        const resolved = await resolveCarouselItems(dedupedFeaturedItems, "featured");
        if (resolved) {
          return;
        }

        activeSourceRef.current = "none";
        activeItemsKeyRef.current = "";
        setFeaturedUnavailable(true);
      } catch (error) {
        console.error("Error hydrating featured carousel artwork:", error);

        if (
          activeSourceRef.current !== "featured"
          || activeItemsKeyRef.current !== itemsKey
        ) {
          return;
        }

        activeSourceRef.current = "none";
        activeItemsKeyRef.current = "";
        setFeaturedUnavailable(true);
      }
    })();
  }, [featuredCarouselItems, featuredLoading]);

  useEffect(() => {
    if (!items.length) return;

    const preloadUrls = [
      items[current]?.bannerImage,
      items[(current + 1) % items.length]?.bannerImage,
    ].filter(Boolean);

    preloadUrls.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, [items, current]);

  useEffect(() => {
    if (items.length === 0 || !isAutoPlaying) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [items.length, isAutoPlaying]);

  const goToNext = () => {
    setIsAutoPlaying(false);
    setCurrent((prev) => (prev + 1) % items.length);
  };

  const goToPrev = () => {
    setIsAutoPlaying(false);
    setCurrent((prev) => (prev - 1 + items.length) % items.length);
  };

  const goToAnimePage = () => {
    navigate(getAnimeDetailPath(anime));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (touchStartX.current - touchEndX.current > 50) {
      // Swiped left - next slide
      goToNext();
    }

    if (touchStartX.current - touchEndX.current < -50) {
      // Swiped right - previous slide
      goToPrev();
    }
  };

  if (isLoading) {
    return <Skeleton className="w-full h-[400px] md:h-[500px] rounded-none" />;
  }

  if (items.length === 0) return null;

  const { anime, bannerImage } = items[current];

  return (
    <div
      className="relative w-full h-[400px] md:h-[500px] overflow-hidden group cursor-pointer"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={goToAnimePage}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToAnimePage();
        }
      }}
      role="link"
      tabIndex={0}
      aria-label={`افتح صفحة ${anime.title}`}
    >
      {/* Background image */}
      {bannerImage ? (
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-700"
          style={{ backgroundImage: `url(${bannerImage})` }}
        />
      ) : (
        <TitleArtworkPlaceholder
          title={anime.title}
          variant="banner"
          className="absolute inset-0"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-l from-background via-background/80 to-background/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />

      {/* Navigation Arrows */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          goToNext();
        }}
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Next slide"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          goToPrev();
        }}
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Previous slide"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Content */}
      <div className="relative container h-full flex items-center">
        <div className="max-w-xl space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {anime.score && (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-anime-gold text-anime-gold" />
                <span className="text-sm font-bold text-anime-gold">{anime.score}</span>
              </div>
            )}
            {getVisibleGenres(anime).slice(0, 3).map((g) => (
              <Badge key={g.mal_id} variant="secondary" className="text-xs">
                {GENRE_AR[g.name] || g.name}
              </Badge>
            ))}
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold leading-tight drop-shadow-lg">
            {anime.title}
          </h1>
          {anime.title_japanese && (
            <p className="text-sm text-muted-foreground drop-shadow">{anime.title_japanese}</p>
          )}

          <p className="text-sm text-muted-foreground line-clamp-3 drop-shadow">
            {anime.synopsis}
          </p>

          <div className="flex items-center gap-3">
            <Button asChild>
              <Link
                to={getAnimeDetailPath(anime)}
                onClick={(e) => e.stopPropagation()}
              >
                <Play className="h-4 w-4 ml-1" />
                شاهد الآن
              </Link>
            </Button>
            {anime.rating && (
              <span className="max-w-[18rem] truncate text-sm text-muted-foreground drop-shadow">
                {anime.rating}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-10">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              setCurrent(i);
              setIsAutoPlaying(false);
            }}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              i === current ? "bg-primary w-8" : "bg-muted-foreground/40"
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
