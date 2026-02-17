import { Link } from "react-router-dom";
import { Star, Play, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopAnime } from "@/hooks/useAnime";
import { GENRE_AR } from "@/lib/jikan";
import { getFeaturedAnimeIds } from "@/lib/supabase";
import { fetchMultipleAniListByMAL, getBestBannerImage } from "@/lib/anilist";
import { useState, useEffect, useRef } from "react";

interface AnimeWithBanner {
  anime: any
  bannerImage: string
}

export default function HeroCarousel() {
  const { data: defaultData, isLoading: defaultLoading } = useTopAnime(1, "airing");
  const [items, setItems] = useState<AnimeWithBanner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [current, setCurrent] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  useEffect(() => {
    loadFeaturedAnime();
  }, []);

  async function loadFeaturedAnime() {
    try {
      const featuredIds = await getFeaturedAnimeIds();

      if (featuredIds.length > 0) {
        // Fetch featured anime from Jikan API
        const animePromises = featuredIds.slice(0, 5).map(id =>
          fetch(`https://api.jikan.moe/v4/anime/${id}`)
            .then(res => res.json())
            .then(data => data.data)
            .catch(() => null)
        );

        const animeResults = await Promise.all(animePromises);
        const validAnime = animeResults.filter(Boolean);

        if (validAnime.length > 0) {
          // Fetch AniList banner images for these anime
          const malIds = validAnime.map(a => a.mal_id);
          const anilistData = await fetchMultipleAniListByMAL(malIds);

          // Combine anime data with banner images
          const itemsWithBanners: AnimeWithBanner[] = validAnime.map(anime => ({
            anime,
            bannerImage: getBestBannerImage(
              anilistData.get(anime.mal_id) || null,
              anime.images.webp.large_image_url
            )
          }));

          setItems(itemsWithBanners);
          setIsLoading(false);
          return;
        }
      }

      // Fallback to default airing anime if no featured anime
      if (defaultData?.data) {
        const fallbackItems: AnimeWithBanner[] = defaultData.data.slice(0, 5).map(anime => ({
          anime,
          bannerImage: anime.images.webp.large_image_url
        }));
        setItems(fallbackItems);
      }
    } catch (error) {
      console.error('Error loading featured anime:', error);
      // Fallback to default
      if (defaultData?.data) {
        const fallbackItems: AnimeWithBanner[] = defaultData.data.slice(0, 5).map(anime => ({
          anime,
          bannerImage: anime.images.webp.large_image_url
        }));
        setItems(fallbackItems);
      }
    } finally {
      setIsLoading(false);
    }
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
      className="relative w-full h-[400px] md:h-[500px] overflow-hidden group"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${bannerImage})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-l from-background via-background/80 to-background/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />

      {/* Navigation Arrows */}
      <button
        onClick={goToPrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
        aria-label="Previous slide"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        onClick={goToNext}
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
            {anime.genres.slice(0, 3).map((g: any) => (
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
              <Link to={`/anime/${anime.mal_id}`}>
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
            onClick={() => {
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
