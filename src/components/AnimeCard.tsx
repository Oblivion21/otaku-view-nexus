import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { JikanAnime } from "@/lib/jikan";
import { GENRE_AR, TYPE_MAP, getVisibleGenres } from "@/lib/jikan";
import { resolveTitleArtworkUrl } from "@/lib/titleArtwork";

interface AnimeCardProps {
  anime: JikanAnime;
  artworkUrl?: string | null;
}

export default function AnimeCard({ anime, artworkUrl = null }: AnimeCardProps) {
  const resolvedArtworkUrl = artworkUrl || resolveTitleArtworkUrl(null, anime, "poster");

  if (!resolvedArtworkUrl) {
    return null;
  }

  return (
    <Link
      to={`/anime/${anime.mal_id}`}
      className="group block rounded-lg overflow-hidden bg-card border border-border hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        <img
          src={resolvedArtworkUrl}
          alt={anime.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {/* Score badge */}
        {anime.score && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 rounded-md px-2 py-0.5">
            <Star className="h-3 w-3 fill-anime-gold text-anime-gold" />
            <span className="text-xs font-bold text-anime-gold">{anime.score}</span>
          </div>
        )}

        {/* Type badge */}
        {anime.type && (
          <Badge className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5">
            {TYPE_MAP[anime.type] || anime.type}
          </Badge>
        )}

        {/* Bottom info */}
        {anime.rating && (
          <div className="absolute bottom-0 inset-x-0 p-2">
            <span className="block truncate text-[10px] text-muted-foreground">
              {anime.rating}
            </span>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <h3 className="text-sm font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {anime.title}
        </h3>
        <div className="flex flex-wrap gap-1 mt-1.5">
          {getVisibleGenres(anime).slice(0, 2).map((g) => (
            <span key={g.mal_id} className="text-[10px] text-muted-foreground bg-secondary rounded px-1.5 py-0.5">
              {GENRE_AR[g.name] || g.name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
