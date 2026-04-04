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
  const carouselClassName = "px-1 sm:px-2 md:px-3 lg:px-10";
  const previousControlClassName = "hidden h-9 w-9 border-border bg-card/90 text-foreground hover:bg-card lg:inline-flex lg:right-2 lg:left-auto";
  const nextControlClassName = "hidden h-9 w-9 border-border bg-card/90 text-foreground hover:bg-card lg:inline-flex lg:left-2 lg:right-auto";
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
          className={carouselClassName}
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
          <CarouselPrevious className={previousControlClassName} />
          <CarouselNext className={nextControlClassName} />
        </Carousel>
      ) : visibleItems.length > 0 ? (
        <Carousel
          dir="rtl"
          opts={{ align: "start", dragFree: true }}
          className={carouselClassName}
        >
          <CarouselContent>
            {visibleItems.map(({ item, index, content }) => (
              <CarouselItem key={index} className={cn(itemClassName)}>
                {content}
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className={previousControlClassName} />
          <CarouselNext className={nextControlClassName} />
        </Carousel>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </section>
  );
}
