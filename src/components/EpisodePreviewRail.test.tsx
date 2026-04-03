import { useEffect, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const carouselMocks = vi.hoisted(() => ({
  carouselSpy: vi.fn(),
  previousSpy: vi.fn(),
  nextSpy: vi.fn(),
  api: {
    on: vi.fn(),
    off: vi.fn(),
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
    carouselMocks.api.scrollSnapList.mockReturnValue([0, 1, 2, 3]);
    carouselMocks.api.selectedScrollSnap.mockReturnValue(2);
  });

  it("keeps the episode rail RTL without hardcoded arrow positions", () => {
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
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("episode-carousel")).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("Episode 1")).toBeInTheDocument();
    expect(screen.getByText("EPISODE 1")).toBeInTheDocument();
    expect(screen.getByText("8.7")).toBeInTheDocument();
    expect(carouselMocks.carouselSpy).toHaveBeenCalledWith(expect.objectContaining({ dir: "rtl" }));
    expect(carouselMocks.previousSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.not.stringMatching(/\bleft-0\b|\bright-0\b/),
      }),
    );
    expect(carouselMocks.nextSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        className: expect.not.stringMatching(/\bleft-0\b|\bright-0\b/),
      }),
    );
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
});
