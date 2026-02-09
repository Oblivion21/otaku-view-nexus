import AnimeCard from "@/components/AnimeCard";
import { Skeleton } from "@/components/ui/skeleton";
import type { JikanAnime } from "@/lib/jikan";

interface AnimeGridProps {
  title: string;
  anime: JikanAnime[] | undefined;
  isLoading: boolean;
}

export default function AnimeGrid({ title, anime, isLoading }: AnimeGridProps) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-bold border-r-4 border-primary pr-3">{title}</h2>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[3/4] rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {anime?.map((a) => (
            <AnimeCard key={a.mal_id} anime={a} />
          ))}
        </div>
      )}
    </section>
  );
}
