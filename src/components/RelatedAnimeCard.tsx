import { Link } from "react-router-dom";
import { useAnimeById } from "@/hooks/useAnime";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface RelatedAnimeCardProps {
  mal_id: number;
  name: string;
  relationLabel: string;
}

export default function RelatedAnimeCard({ mal_id, name, relationLabel }: RelatedAnimeCardProps) {
  const { data, isLoading } = useAnimeById(mal_id);
  const imageUrl = data?.data?.images?.webp?.image_url;

  return (
    <Link
      to={`/anime/${mal_id}`}
      className="flex flex-col w-[120px] shrink-0 group"
    >
      <div className="aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted">
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
      </div>
      <p className="text-xs font-medium mt-1.5 line-clamp-2 leading-tight">{name}</p>
      <Badge variant="outline" className="text-[10px] mt-1 w-fit">{relationLabel}</Badge>
    </Link>
  );
}
