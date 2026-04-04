import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const carouselMocks = vi.hoisted(() => ({
  carouselSpy: vi.fn(),
  previousSpy: vi.fn(),
  nextSpy: vi.fn(),
  api: {
    on: vi.fn(),
    off: vi.fn(),
    scrollPrev: vi.fn(),
    scrollNext: vi.fn(),
    scrollSnapList: vi.fn(() => [0, 1, 2, 3]),
    selectedScrollSnap: vi.fn(() => 2),
  },
}));

type MockCarouselProps = {
  children?: ReactNode;
  dir?: string;
  className?: string;
  setApi?: (api: typeof carouselMocks.api) => void;
};

vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children, ...props }: MockCarouselProps) => {
    carouselMocks.carouselSpy(props);
    useEffect(() => {
      props.setApi?.(carouselMocks.api);
    }, [props.setApi]);
    return (
      <div data-testid="episode-carousel" dir={props.dir} className={props.className}>
        {children}
      </div>
    );
  },
  CarouselContent: ({ children, ...props }: MockCarouselProps) => <div {...props}>{children}</div>,
  CarouselItem: ({ children, ...props }: MockCarouselProps) => <div {...props}>{children}</div>,
  CarouselPrevious: (props: MockCarouselProps) => {
    carouselMocks.previousSpy(props);
    return <button type="button">Previous</button>;
  },
  CarouselNext: (props: MockCarouselProps) => {
    carouselMocks.nextSpy(props);
    return <button type="button">Next</button>;
  },
}));

import EpisodePreviewRail from "@/components/EpisodePreviewRail";

describe("EpisodePreviewRail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    carouselMocks.api.scrollSnapList.mockReturnValue([0, 1, 2, 3]);
    carouselMocks.api.selectedScrollSnap.mockReturnValue(2);
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("keeps the episode rail RTL and hides controls when requested", () => {
    render(
      <MemoryRouter>
        <EpisodePreviewRail
          title="Latest Episodes"
          items={[
            {
              episodeNumber: 1,
              title: "Episode 1",
              href: "/watch/1/1",
              imageUrl: "https://image.tmdb.org/t/p/w780/ep1.jpg",
              fallbackImageUrl: null,
              scoreLabel: "8.7",
            },
          ]}
          emptyMessage="Nothing here"
          headerActionHref="/anime/1"
          headerActionLabel="View all"
          hideControls
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("episode-carousel")).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("Episode 1")).toBeInTheDocument();
    expect(screen.getByText("EPISODE 1")).toBeInTheDocument();
    expect(screen.getByText("8.7")).toBeInTheDocument();
    expect(carouselMocks.carouselSpy).toHaveBeenCalledWith(expect.objectContaining({ dir: "rtl" }));
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(carouselMocks.previousSpy).not.toHaveBeenCalled();
    expect(carouselMocks.nextSpy).not.toHaveBeenCalled();
  });

  it("renders a neutral placeholder when an episode has no preview image", () => {
    render(
      <MemoryRouter>
        <EpisodePreviewRail
          title="Latest Episodes"
          items={[
            {
              episodeNumber: 3,
              title: "Episode 3",
              href: "/watch/1/3",
              imageUrl: null,
              fallbackImageUrl: null,
              scoreLabel: "9.1",
            },
          ]}
          emptyMessage="Nothing here"
          headerActionHref="/anime/1"
          headerActionLabel="View all"
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Episode 3 preview placeholder")).toBeInTheDocument();
    expect(screen.getByText("EPISODE 3")).toBeInTheDocument();
    expect(screen.getByText("9.1")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Episode 3" })).not.toBeInTheDocument();
  });

  it("falls back to the Jikan thumbnail when the TMDB image fails to load", () => {
    render(
      <MemoryRouter>
        <EpisodePreviewRail
          title="Latest Episodes"
          items={[
            {
              episodeNumber: 4,
              title: "Episode 4",
              href: "/watch/1/4",
              imageUrl: "https://image.tmdb.org/t/p/w780/ep4.jpg",
              fallbackImageUrl: "https://cdn.jikan.moe/episode-4.jpg",
              scoreLabel: "8.3",
            },
          ]}
          emptyMessage="Nothing here"
          headerActionHref="/anime/1"
          headerActionLabel="View all"
        />
      </MemoryRouter>,
    );

    const image = screen.getByRole("img", { name: "Episode 4" });
    fireEvent.error(image);

    expect(screen.getByRole("img", { name: "Episode 4" })).toHaveAttribute(
      "src",
      expect.stringContaining("cdn.jikan.moe/episode-4.jpg"),
    );
  });

  it("requests more episodes when the user reaches the end of the loaded rail", () => {
    const handleReachEnd = vi.fn();

    render(
      <MemoryRouter>
        <EpisodePreviewRail
          title="Latest Episodes"
          items={[
            {
              episodeNumber: 1,
              title: "Episode 1",
              href: "/watch/1/1",
              imageUrl: "https://image.tmdb.org/t/p/w780/ep1.jpg",
            },
          ]}
          emptyMessage="Nothing here"
          headerActionHref="/anime/1"
          headerActionLabel="View all"
          onReachEnd={handleReachEnd}
        />
      </MemoryRouter>,
    );

    const selectHandler = carouselMocks.api.on.mock.calls.find(([eventName]) => eventName === "select")?.[1];

    expect(selectHandler).toBeTypeOf("function");
    selectHandler?.();

    expect(handleReachEnd).toHaveBeenCalledTimes(1);
  });

  it("plays a one-time swipe hint on mount when enabled", () => {
    render(
      <MemoryRouter>
        <EpisodePreviewRail
          title="Latest Episodes"
          items={[
            {
              episodeNumber: 1,
              title: "Episode 1",
              href: "/watch/1/1",
              imageUrl: "https://image.tmdb.org/t/p/w780/ep1.jpg",
            },
            {
              episodeNumber: 2,
              title: "Episode 2",
              href: "/watch/1/2",
              imageUrl: "https://image.tmdb.org/t/p/w780/ep2.jpg",
            },
          ]}
          emptyMessage="Nothing here"
          headerActionHref="/anime/1"
          headerActionLabel="View all"
          hintSwipeOnMount
        />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(449);
    });
    expect(carouselMocks.api.scrollNext).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(carouselMocks.api.scrollNext).toHaveBeenCalledTimes(1);
    expect(carouselMocks.api.scrollPrev).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(carouselMocks.api.scrollPrev).toHaveBeenCalledTimes(1);
  });

  it("does not play the swipe hint when reduced motion is enabled", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      <MemoryRouter>
        <EpisodePreviewRail
          title="Latest Episodes"
          items={[
            {
              episodeNumber: 1,
              title: "Episode 1",
              href: "/watch/1/1",
              imageUrl: "https://image.tmdb.org/t/p/w780/ep1.jpg",
            },
            {
              episodeNumber: 2,
              title: "Episode 2",
              href: "/watch/1/2",
              imageUrl: "https://image.tmdb.org/t/p/w780/ep2.jpg",
            },
          ]}
          emptyMessage="Nothing here"
          headerActionHref="/anime/1"
          headerActionLabel="View all"
          hintSwipeOnMount
        />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(carouselMocks.api.scrollNext).not.toHaveBeenCalled();
    expect(carouselMocks.api.scrollPrev).not.toHaveBeenCalled();
  });

  it("renders filler badges in English at the top-right of the preview image", () => {
    render(
      <MemoryRouter>
        <EpisodePreviewRail
          title="Latest Episodes"
          items={[
            {
              episodeNumber: 6,
              title: "Valentine Murder Case",
              href: "/watch/235/6",
              imageUrl: "https://image.tmdb.org/t/p/w780/ep6.jpg",
              badges: ["Filler"],
            },
          ]}
          emptyMessage="Nothing here"
          headerActionHref="/anime/235"
          headerActionLabel="View all"
        />
      </MemoryRouter>,
    );

    const badge = screen.getByText("Filler");
    expect(badge).toBeInTheDocument();
    expect(badge.parentElement).toHaveClass("right-3", "top-3");
  });
});
