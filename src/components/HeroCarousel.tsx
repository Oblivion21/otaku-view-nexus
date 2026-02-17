import { Link } from "react-router-dom";
import { Star, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTopAnime } from "@/hooks/useAnime";
import { GENRE_AR } from "@/lib/jikan";
import { getFeaturedAnimeIds } from "@/lib/supabase";
import { useState, useEffect } from "react";

export default function HeroCarousel() {
  const { data: defaultData, isLoading: defaultLoading } = useTopAnime(1, "airing");
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [current, setCurrent] = useState(0);

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

        const results = await Promise.all(animePromises);
        const validResults = results.filter(Boolean);

        if (validResults.length > 0) {
          setItems(validResults);
          setIsLoading(false);
          return;
        }
      }

      // Fallback to default airing anime if no featured anime
      if (defaultData?.data) {
        setItems(defaultData.data.slice(0, 5));
      }
    } catch (error) {
      console.error('Error loading featured anime:', error);
      // Fallback to default
      if (defaultData?.data) {
        setItems(defaultData.data.slice(0, 5));
      }
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setInterval(() => {
      setCurrent((prev) => (prev + 1) % items.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [items.length]);

  if (isLoading) {
    return <Skeleton className="w-full h-[400px] md:h-[500px] rounded-none" />;
  }

  if (items.length === 0) return null;

  const anime = items[current];

  return (
    <div className="relative w-full h-[400px] md:h-[500px] overflow-hidden">
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700"
        style={{ backgroundImage: `url(${anime.images.webp.large_image_url})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-l from-background via-background/80 to-background/40" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-background/30" />

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
            {anime.genres.slice(0, 3).map((g) => (
              <Badge key={g.mal_id} variant="secondary" className="text-xs">
                {GENRE_AR[g.name] || g.name}
              </Badge>
            ))}
          </div>

          <h1 className="text-2xl md:text-4xl font-extrabold leading-tight">
            {anime.title}
          </h1>
          {anime.title_japanese && (
            <p className="text-sm text-muted-foreground">{anime.title_japanese}</p>
          )}

          <p className="text-sm text-muted-foreground line-clamp-3">
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
              <span className="text-sm text-muted-foreground">
                {anime.episodes} حلقة
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dots */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrent(i)}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i === current ? "bg-primary" : "bg-muted-foreground/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
