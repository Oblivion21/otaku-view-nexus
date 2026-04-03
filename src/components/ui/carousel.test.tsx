import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const emblaState = vi.hoisted(() => ({
  canScrollPrev: false,
  canScrollNext: true,
  listeners: new Map<string, Set<(api: any) => void>>(),
}));

vi.mock("embla-carousel-react", () => {
  const api = {
    canScrollPrev: () => emblaState.canScrollPrev,
    canScrollNext: () => emblaState.canScrollNext,
    scrollPrev: () => {
      emblaState.canScrollPrev = false;
      emblaState.canScrollNext = true;
      api.emit("select");
    },
    scrollNext: () => {
      emblaState.canScrollPrev = true;
      emblaState.canScrollNext = true;
      api.emit("select");
    },
    on: (event: string, callback: (api: any) => void) => {
      const callbacks = emblaState.listeners.get(event) ?? new Set();
      callbacks.add(callback);
      emblaState.listeners.set(event, callbacks);
    },
    off: (event: string, callback: (api: any) => void) => {
      emblaState.listeners.get(event)?.delete(callback);
    },
    emit: (event: string) => {
      emblaState.listeners.get(event)?.forEach((callback) => callback(api));
    },
  };

  return {
    __esModule: true,
    default: () => [vi.fn(), api],
  };
});

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";

describe("ui Carousel", () => {
  beforeEach(() => {
    emblaState.canScrollPrev = false;
    emblaState.canScrollNext = true;
    emblaState.listeners.clear();
  });

  it("hides the RTL right-side arrow at the start and shows it after advancing", async () => {
    render(
      <Carousel dir="rtl">
        <CarouselContent>
          <CarouselItem>First</CarouselItem>
          <CarouselItem>Second</CarouselItem>
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>,
    );

    expect(screen.queryByRole("button", { name: "Previous slide" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next slide" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Previous slide" })).toBeInTheDocument();
    });
  });

  it("uses right-side spacing classes for RTL horizontal tracks", () => {
    render(
      <Carousel dir="rtl">
        <CarouselContent data-testid="content">
          <CarouselItem data-testid="item">First</CarouselItem>
        </CarouselContent>
      </Carousel>,
    );

    expect(screen.getByTestId("content")).toHaveClass("-mr-4");
    expect(screen.getByTestId("content")).toHaveClass("flex-row-reverse");
    expect(screen.getByTestId("item")).toHaveClass("pr-4");
  });
});
