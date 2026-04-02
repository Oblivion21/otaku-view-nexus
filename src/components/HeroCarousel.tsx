import { Link, useNavigate } from "react-router-dom";
import { Star, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import TitleArtworkPlaceholder from "@/components/TitleArtworkPlaceholder";
import { useTopAnime } from "@/hooks/useAnime";
import { GENRE_AR, getVisibleGenres, type JikanAnime } from "@/lib/jikan";
import { getFeaturedAnimeIds } from "@/lib/supabase";
import { getMultipleAnimeTmdbArtwork } from "@/lib/tmdb";
import { resolveTitleArtworkUrl } from "@/lib/titleArtwork";
import { useState, useEffect, useRef } from "react";

interface AnimeWithBanner {
  anime: JikanAnime
  bannerImage: string | null
}

export default function HeroCarousel() {
  const navigate = useNavigate();
  const { data: defaultData, isLoading: defaultLoading } = useTopAnime(1, "airing");
  const [items, setItems] = useState<AnimeWithBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    let isActive = true;

    async function loadCarousel() {
      setIsLoading(true);

      try {
        const featuredIds = await getFeaturedAnimeIds();
        let selectedAnime: JikanAnime[] = [];

        if (featuredIds.length > 0) {
          const animePromises: Promise<JikanAnime | null>[] = featuredIds.slice(0, 5).map((id) =>
            fetch(`https://api.jikan.moe/v4/anime/${id}`)
              .then((res) => res.json())
              .then((data: { data?: JikanAnime }) => data.data || null)
              .catch(() => null),
          );

          const animeResults = await Promise.all(animePromises);
          selectedAnime = animeResults.filter((anime): anime is JikanAnime => Boolean(anime));
        }

        if (!selectedAnime.length && defaultData?.data?.length) {
          selectedAnime = defaultData.data.slice(0, 5);
        }

        if (!selectedAnime.length) {
          if (!defaultLoading && isActive) {
            setItems([]);
            setIsLoading(false);
          }
          return;
        }

        const itemsWithBanners = await buildCarouselItems(selectedAnime);

        if (!isActive) {
          return;
        }

        setItems(itemsWithBanners);
        setIsLoading(false);
      } catch (error) {
        console.error("Error loading featured anime:", error);

        if (!defaultData?.data?.length) {
          if (!defaultLoading && isActive) {
            setItems([]);
            setIsLoading(false);
          }
          return;
        }

        const fallbackItems = await buildCarouselItems(defaultData.data.slice(0, 5));

        if (!isActive) {
          return;
        }

        setItems(fallbackItems);
        setIsLoading(false);
      }
    }

    void loadCarousel();

    return () => {
      isActive = false;
    };
  }, [defaultData, defaultLoading]);

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

  async function buildCarouselItems(animeList: JikanAnime[]): Promise<AnimeWithBanner[]> {
    const artworkMap = await getMultipleAnimeTmdbArtwork(animeList);

    return animeList.map((anime) => {
      const artwork = artworkMap.get(anime.mal_id);

      return {
        anime,
        bannerImage: resolveTitleArtworkUrl(artwork, anime, "banner"),
      };
    });
  }

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
    navigate(`/anime/${anime.mal_id}`);
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
          goToPrev();
        }}
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          goToNext();
        }}
        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Next slide"
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
                to={`/anime/${anime.mal_id}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Play className="h-4 w-4 ml-1" />
                شاهد الآن
              </Link>
            </Button>
            {anime.episodes && (
              <span className="text-sm text-muted-foreground drop-shadow">
                {anime.episodes} حلقة
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
