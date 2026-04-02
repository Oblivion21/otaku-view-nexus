import type { ReactNode } from "react";
import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

export type EpisodePreviewRailItem = {
  episodeNumber: number;
  title: string;
  href: string;
  imageUrl: string | null;
  scoreLabel?: string | null;
  badges?: string[];
  styleClassName?: string;
};

interface EpisodePreviewRailProps {
  title: string;
  items: EpisodePreviewRailItem[];
  loading?: boolean;
  emptyMessage: string;
  headerActionHref: string;
  headerActionLabel: string;
  accentLegend?: ReactNode;
}

function EpisodePreviewCard({ item }: { item: EpisodePreviewRailItem }) {
  return (
    <Link
      to={item.href}
      className={cn(
        "group block h-full overflow-hidden rounded-2xl border border-border bg-card/95 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_18px_40px_rgba(3,105,161,0.14)]",
        item.styleClassName,
      )}
    >
      <div className="relative aspect-video overflow-hidden border-b border-white/10 bg-[linear-gradient(180deg,rgba(14,26,44,0.96),rgba(2,6,23,0.96))]">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div
            aria-label={`Episode ${item.episodeNumber} preview placeholder`}
            className="absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(17,24,39,0.94))]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(148,163,184,0.14),transparent_38%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_0%,rgba(255,255,255,0.02)_45%,transparent_100%)]" />
            <div className="absolute -bottom-4 left-4 text-6xl font-black leading-none text-white/10">
              {item.episodeNumber}
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
        {item.scoreLabel ? (
          <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-anime-gold ring-1 ring-white/10 backdrop-blur">
            <Star className="h-3.5 w-3.5 fill-anime-gold text-anime-gold" />
            <span>{item.scoreLabel}</span>
          </div>
        ) : null}
        {item.badges?.length ? (
          <div className="absolute bottom-3 right-3 flex flex-wrap gap-1.5">
            {item.badges.slice(0, 3).map((badge) => (
              <Badge
                key={`${item.episodeNumber}-${badge}`}
                variant="secondary"
                className="border-white/10 bg-black/65 text-[11px] text-white backdrop-blur"
              >
                {badge}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-2.5 p-3 text-right">
        <h3 className="line-clamp-2 text-sm font-bold leading-6 text-foreground md:text-[15px]">
          {item.title}
        </h3>
      </div>
    </Link>
  );
}

export default function EpisodePreviewRail({
  title,
  items,
  loading = false,
  emptyMessage,
  headerActionHref,
  headerActionLabel,
  accentLegend,
}: EpisodePreviewRailProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold border-r-4 border-primary pr-3">{title}</h2>
        <Button asChild variant="outline" size="sm">
          <Link to={headerActionHref}>{headerActionLabel}</Link>
        </Button>
      </div>

      {accentLegend}

      {loading ? (
        <Carousel
          dir="rtl"
          opts={{ align: "start", containScroll: "trimSnaps" }}
          className="px-12 sm:px-14"
        >
          <CarouselContent>
            {Array.from({ length: 4 }).map((_, index) => (
              <CarouselItem key={index} className="basis-[74%] sm:basis-[52%] lg:basis-[31%] xl:basis-[24%]">
                <div className="overflow-hidden rounded-2xl border border-border bg-card/90">
                  <Skeleton className="aspect-video w-full rounded-none" />
                  <div className="space-y-2.5 p-3">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-5 w-4/5" />
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card" />
          <CarouselNext className="h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card" />
        </Carousel>
      ) : items.length > 0 ? (
        <Carousel
          dir="rtl"
          opts={{ align: "start", containScroll: "trimSnaps" }}
          className="px-12 sm:px-14"
        >
          <CarouselContent>
            {items.map((item) => (
              <CarouselItem
                key={item.episodeNumber}
                className="basis-[74%] sm:basis-[52%] lg:basis-[31%] xl:basis-[24%]"
              >
                <EpisodePreviewCard item={item} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card" />
          <CarouselNext className="h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card" />
        </Carousel>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
