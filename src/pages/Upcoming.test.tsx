import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

const hookMocks = vi.hoisted(() => ({
  useMultipleAnimeTmdbArtwork: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/AnimeCard", () => ({
  default: ({ anime }: { anime: { title: string } }) => <div>{anime.title}</div>,
}));
vi.mock("@/hooks/useAnime", () => hookMocks);
vi.mock("@tanstack/react-query", () => queryMocks);

import Upcoming from "./Upcoming";

const anime = {
  mal_id: 1,
  title: "Upcoming Anime",
  aired: { from: "2026-10-01" },
  images: {
    jpg: { image_url: "https://example.com/upcoming.jpg", large_image_url: "https://example.com/upcoming-large.jpg" },
    webp: { image_url: "https://example.com/upcoming.webp", large_image_url: "https://example.com/upcoming-large.webp" },
  },
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Upcoming />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("Upcoming", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    queryMocks.useQuery.mockReturnValue({
      data: {
        data: [anime],
        pagination: { has_next_page: true, last_visible_page: 5 },
      },
      isLoading: false,
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map(),
    });
  });

  it("reads page from the URL and updates it when paging", async () => {
    renderPage("/upcoming?page=2");

    expect(queryMocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["upcoming", 2],
      }),
    );
    expect(screen.getByText("صفحة 2 من 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /التالي/ }));

    await waitFor(() => {
      expect(queryMocks.useQuery).toHaveBeenLastCalledWith(
        expect.objectContaining({
          queryKey: ["upcoming", 3],
        }),
      );
    });
    expect(screen.getByTestId("location-search")).toHaveTextContent("?page=3");
  });

  it("falls back to page 1 for invalid page params", () => {
    renderPage("/upcoming?page=bad");

    expect(queryMocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ["upcoming", 1],
      }),
    );
    expect(screen.getByText("صفحة 1 من 5")).toBeInTheDocument();
  });
});
