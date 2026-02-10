import { Link } from "react-router-dom";
import { useAnimeById } from "@/hooks/useAnime";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
import { TYPE_MAP } from "@/lib/jikan";

interface RelatedAnimeCardProps {
  mal_id: number;
  name: string;
  relationLabel: string;
}

export default function RelatedAnimeCard({ mal_id, name, relationLabel }: RelatedAnimeCardProps) {
  const { data, isLoading } = useAnimeById(mal_id);
  const anime = data?.data;
  const imageUrl = anime?.images?.webp?.large_image_url || anime?.images?.webp?.image_url;

  return (
    <Link
      to={`/anime/${mal_id}`}
      className="group block rounded-lg overflow-hidden bg-card border border-border hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        {isLoading || !imageUrl ? (
          <Skeleton className="w-full h-full" />
        ) : (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {anime?.score && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 rounded-md px-2 py-0.5">
            <Star className="h-3 w-3 fill-anime-gold text-anime-gold" />
            <span className="text-xs font-bold text-anime-gold">{anime.score}</span>
          </div>
        )}

        {anime?.type && (
          <Badge className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5">
            {TYPE_MAP[anime.type] || anime.type}
          </Badge>
        )}

        {anime?.episodes && (
          <div className="absolute bottom-0 inset-x-0 p-2">
            <span className="text-[10px] text-muted-foreground">
              {anime.episodes} حلقة
            </span>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <h3 className="text-sm font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {name}
        </h3>
        <div className="mt-1.5">
          <Badge variant="outline" className="text-[10px]">{relationLabel}</Badge>
        </div>
      </div>
    </Link>
  );
}
