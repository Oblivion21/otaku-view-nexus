import { useEffect, useRef, useState, type ReactNode } from "react";
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
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

export type EpisodePreviewRailItem = {
  episodeNumber: number;
  title: string;
  href: string;
  imageUrl: string | null;
  fallbackImageUrl?: string | null;
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
  loadingMore?: boolean;
  onReachEnd?: () => void;
  hideControls?: boolean;
  hintSwipeOnMount?: boolean;
}

function EpisodePreviewCard({ item }: { item: EpisodePreviewRailItem }) {
  const [currentImageUrl, setCurrentImageUrl] = useState(item.imageUrl);

  useEffect(() => {
    setCurrentImageUrl(item.imageUrl);
  }, [item.imageUrl, item.fallbackImageUrl, item.episodeNumber]);

  return (
    <Link
      to={item.href}
      className={cn(
        "group block h-full overflow-hidden rounded-2xl border border-border bg-card/95 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_18px_40px_rgba(3,105,161,0.14)]",
        item.styleClassName,
      )}
    >
      <div className="relative aspect-video overflow-hidden border-b border-white/10 bg-[linear-gradient(180deg,rgba(14,26,44,0.96),rgba(2,6,23,0.96))]">
        {currentImageUrl ? (
          <img
            src={currentImageUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            onError={() => {
              if (item.fallbackImageUrl && currentImageUrl !== item.fallbackImageUrl) {
                setCurrentImageUrl(item.fallbackImageUrl);
                return;
              }
              setCurrentImageUrl(null);
            }}
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
          <div className="absolute right-3 top-3 flex max-w-[60%] flex-wrap justify-end gap-1.5">
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
        <p className="text-[11px] font-semibold tracking-wide text-primary/90">
          EPISODE {item.episodeNumber}
        </p>
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
  loadingMore = false,
  onReachEnd,
  hideControls = false,
  hintSwipeOnMount = false,
}: EpisodePreviewRailProps) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const swipeHintPlayedRef = useRef(false);
  const firstItemHref = items[0]?.href ?? "";
  const carouselClassName = "px-1 sm:px-2 md:px-3 lg:px-4";
  const itemClassName = "basis-[88%] min-[480px]:basis-[78%] md:basis-[48%] xl:basis-[31%]";
  const previousControlClassName = "hidden h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card lg:inline-flex lg:right-2 lg:left-auto";
  const nextControlClassName = "hidden h-11 w-11 border-border bg-card/95 text-foreground hover:bg-card lg:inline-flex lg:left-2 lg:right-auto";

  useEffect(() => {
    swipeHintPlayedRef.current = false;
  }, [firstItemHref]);

  useEffect(() => {
    if (!carouselApi || !onReachEnd || items.length === 0) {
      return undefined;
    }

    const handleSelect = () => {
      const snapCount = carouselApi.scrollSnapList().length;
      if (snapCount === 0) {
        return;
      }

      if (carouselApi.selectedScrollSnap() >= snapCount - 2) {
        onReachEnd();
      }
    };

    carouselApi.on("select", handleSelect);
    carouselApi.on("reInit", handleSelect);

    return () => {
      carouselApi.off("select", handleSelect);
      carouselApi.off("reInit", handleSelect);
    };
  }, [carouselApi, items.length, onReachEnd]);

  useEffect(() => {
    if (!carouselApi || !hintSwipeOnMount || items.length < 2 || swipeHintPlayedRef.current) {
      return undefined;
    }

    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    const snapCount = carouselApi.scrollSnapList().length;
    if (snapCount < 2) {
      return undefined;
    }

    swipeHintPlayedRef.current = true;

    const forwardTimeout = window.setTimeout(() => {
      carouselApi.scrollNext();
    }, 450);

    const backTimeout = window.setTimeout(() => {
      carouselApi.scrollPrev();
    }, 1050);

    return () => {
      window.clearTimeout(forwardTimeout);
      window.clearTimeout(backTimeout);
    };
  }, [carouselApi, hintSwipeOnMount, items.length, firstItemHref]);

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
          opts={{ align: "start", containScroll: "trimSnaps", dragFree: true }}
          className={carouselClassName}
        >
          <CarouselContent>
            {Array.from({ length: 4 }).map((_, index) => (
              <CarouselItem key={index} className={itemClassName}>
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
          {!hideControls ? (
            <>
              <CarouselPrevious className={previousControlClassName} />
              <CarouselNext className={nextControlClassName} />
            </>
          ) : null}
        </Carousel>
      ) : items.length > 0 ? (
        <Carousel
          dir="rtl"
          opts={{ align: "start", containScroll: "trimSnaps", dragFree: true }}
          setApi={setCarouselApi}
          className={carouselClassName}
        >
          <CarouselContent>
            {items.map((item) => (
              <CarouselItem
                key={item.episodeNumber}
                className={itemClassName}
              >
                <EpisodePreviewCard item={item} />
              </CarouselItem>
            ))}
            {loadingMore ? (
              <CarouselItem className={itemClassName}>
                <div className="overflow-hidden rounded-2xl border border-border bg-card/90">
                  <Skeleton className="aspect-video w-full rounded-none" />
                  <div className="space-y-2.5 p-3">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-5 w-4/5" />
                  </div>
                </div>
              </CarouselItem>
            ) : null}
          </CarouselContent>
          {!hideControls ? (
            <>
              <CarouselPrevious className={previousControlClassName} />
              <CarouselNext className={nextControlClassName} />
            </>
          ) : null}
        </Carousel>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
