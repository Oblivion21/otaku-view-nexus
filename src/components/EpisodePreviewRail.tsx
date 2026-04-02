import type { ReactNode } from "react";
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
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
        <div className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/10 backdrop-blur">
          الحلقة {item.episodeNumber}
        </div>
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
      <div className="space-y-3 p-4 text-right">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-wide text-primary/90">
              EPISODE {item.episodeNumber}
            </p>
            <h3 className="mt-2 line-clamp-2 text-base font-bold leading-7 text-foreground">
              {item.title}
            </h3>
          </div>
          <span className="shrink-0 text-3xl font-black leading-none text-primary/90">
            {item.episodeNumber}
          </span>
        </div>
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
              <CarouselItem key={index} className="basis-[86%] sm:basis-[62%] lg:basis-[44%] xl:basis-[36%]">
                <div className="overflow-hidden rounded-2xl border border-border bg-card/90">
                  <Skeleton className="aspect-video w-full rounded-none" />
                  <div className="space-y-3 p-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-4/5" />
                  </div>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="right-0 h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card" />
          <CarouselNext className="left-0 h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card" />
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
                className="basis-[86%] sm:basis-[62%] lg:basis-[44%] xl:basis-[36%]"
              >
                <EpisodePreviewCard item={item} />
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="right-0 h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card" />
          <CarouselNext className="left-0 h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card" />
        </Carousel>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
