import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAnimeById, useAnimeTmdbArtwork } from "@/hooks/useAnime";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star } from "lucide-react";
import { TYPE_MAP, isBlockedAnime } from "@/lib/jikan";
import { getAnimeDetailPath } from "@/lib/animeRoutes";
import { hasAnyTitleArtwork, resolveTitleArtworkUrl } from "@/lib/titleArtwork";
import { formatTenPointScoreLabel, resolvePreferredScore } from "@/lib/scores";

interface RelatedAnimeCardProps {
  mal_id: number;
  name: string;
  relationLabel: string;
}

function getReleaseYear(anime: NonNullable<ReturnType<typeof useAnimeById>["data"]>["data"]) {
  if (anime.year) {
    return anime.year;
  }

  const airedYear = anime.aired?.from?.slice(0, 4);
  const parsedYear = airedYear ? Number(airedYear) : Number.NaN;
  return Number.isFinite(parsedYear) ? parsedYear : null;
}

export default function RelatedAnimeCard({ mal_id, name, relationLabel }: RelatedAnimeCardProps) {
  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
    failureCount,
  } = useAnimeById(mal_id, {
    retry: 3,
    staleTime: 24 * 60 * 60 * 1000,
  });
  const anime = data?.data;
  const { data: tmdbArtwork, isLoading: loadingTmdbArtwork } = useAnimeTmdbArtwork(anime);

  useEffect(() => {
    if (anime || !isError) {
      return undefined;
    }

    const retryDelayMs = Math.min(Math.max(failureCount, 1) * 2000, 10000);
    const timeoutId = window.setTimeout(() => {
      void refetch();
    }, retryDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [anime, failureCount, isError, refetch]);

  if (!anime && (isLoading || isFetching)) {
    return (
      <div className="group block rounded-lg overflow-hidden bg-card border border-border">
        <div className="relative aspect-[3/4] overflow-hidden">
          <Skeleton className="w-full h-full" />
        </div>
        <div className="p-2.5 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  if (anime && isBlockedAnime(anime)) {
    return null;
  }

  const isArtworkPending = Boolean(anime && loadingTmdbArtwork);
  const imageUrl = anime && !isArtworkPending ? resolveTitleArtworkUrl(tmdbArtwork, anime, "poster") : null;
  const releaseYear = anime ? getReleaseYear(anime) : null;
  const title = anime?.title || name;
  const displayScore = formatTenPointScoreLabel(resolvePreferredScore(tmdbArtwork?.imdbRating, anime?.score));
  const detailPath = getAnimeDetailPath({
    mal_id,
    title,
    title_english: anime?.title_english,
    title_japanese: anime?.title_japanese,
  });

  return (
    <Link
      to={detailPath}
      className="group block rounded-lg overflow-hidden bg-card border border-border hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5"
    >
      <div className="relative aspect-[3/4] overflow-hidden">
        {isLoading || isArtworkPending ? (
          <Skeleton className="w-full h-full" />
        ) : imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-end bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_55%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-3">
            <span className="line-clamp-3 text-sm font-semibold leading-6 text-foreground/90">
              {title}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {displayScore && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/70 rounded-md px-2 py-0.5">
            <Star className="h-3 w-3 fill-anime-gold text-anime-gold" />
            <span className="text-xs font-bold text-anime-gold">{displayScore}</span>
          </div>
        )}

        {anime?.type && (
          <Badge className="absolute top-2 right-2 bg-primary/90 text-primary-foreground text-[10px] px-1.5 py-0.5">
            {TYPE_MAP[anime.type] || anime.type}
          </Badge>
        )}

        {anime?.rating && (
          <div className="absolute bottom-0 inset-x-0 p-2">
            <span className="block truncate text-[10px] text-muted-foreground">
              {anime.rating}
            </span>
          </div>
        )}
      </div>

      <div className="p-2.5">
        <h3 className="text-sm font-semibold line-clamp-2 leading-tight group-hover:text-primary transition-colors">
          {title}
        </h3>
        <div className="mt-1.5 space-y-1.5">
          {releaseYear && (
            <p className="text-[11px] text-muted-foreground">
              {releaseYear}
            </p>
          )}
          <Badge variant="outline" className="text-[10px]">{relationLabel}</Badge>
        </div>
      </div>
    </Link>
  );
}
