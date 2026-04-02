import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const carouselMocks = vi.hoisted(() => ({
  carouselSpy: vi.fn(),
  previousSpy: vi.fn(),
  nextSpy: vi.fn(),
}));

type MockCarouselProps = {
  children?: ReactNode;
  dir?: string;
  className?: string;
};

vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children, ...props }: MockCarouselProps) => {
    carouselMocks.carouselSpy(props);
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
            },
          ]}
          emptyMessage="Nothing here"
          headerActionHref="/anime/1"
          headerActionLabel="View all"
        />
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Episode 3 preview placeholder")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Episode 3" })).not.toBeInTheDocument();
  });
});
