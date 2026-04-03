import type { ReactNode } from "react";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ContentRailProps<T> {
  title: string;
  items: T[];
  loading?: boolean;
  emptyMessage: string;
  renderItem: (item: T, index: number) => ReactNode;
  headerAction?: ReactNode;
  skeletonCount?: number;
  itemClassName?: string;
}

const DEFAULT_ITEM_CLASS_NAME = "basis-[78%] sm:basis-1/2 lg:basis-1/3 xl:basis-1/4";

export default function ContentRail<T>({
  title,
  items,
  loading = false,
  emptyMessage,
  renderItem,
  headerAction,
  skeletonCount = 6,
  itemClassName = DEFAULT_ITEM_CLASS_NAME,
}: ContentRailProps<T>) {
  const visibleItems = items
    .map((item, index) => ({
      item,
      index,
      content: renderItem(item, index),
    }))
    .filter(({ content }) => {
      return content !== null && content !== undefined && content !== false;
    });

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold border-r-4 border-primary pr-3">{title}</h2>
        {headerAction}
      </div>

      {loading ? (
        <Carousel
          dir="rtl"
          opts={{ align: "start", dragFree: true }}
          className="px-10 sm:px-12"
        >
          <CarouselContent>
            {Array.from({ length: skeletonCount }).map((_, index) => (
              <CarouselItem key={index} className={itemClassName}>
                <div className="space-y-2">
                  <Skeleton className="aspect-[3/4] rounded-lg" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="h-9 w-9 border-border bg-card/90 text-foreground hover:bg-card" />
          <CarouselNext className="h-9 w-9 border-border bg-card/90 text-foreground hover:bg-card" />
        </Carousel>
      ) : visibleItems.length > 0 ? (
        <Carousel
          dir="rtl"
          opts={{ align: "start", dragFree: true }}
          className="px-10 sm:px-12"
        >
          <CarouselContent>
            {visibleItems.map(({ item, index, content }) => (
              <CarouselItem key={index} className={cn(itemClassName)}>
                {content}
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="h-9 w-9 border-border bg-card/90 text-foreground hover:bg-card" />
          <CarouselNext className="h-9 w-9 border-border bg-card/90 text-foreground hover:bg-card" />
        </Carousel>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
