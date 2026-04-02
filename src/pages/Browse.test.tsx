import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useTopAnime: vi.fn(),
  useSeasonNow: vi.fn(),
  useAnimeByGenre: vi.fn(),
  useGenres: vi.fn(),
  useTopMovies: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/AnimeGrid", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/hooks/useAnime", () => hookMocks);

import Browse from "./Browse";

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Browse />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("Browse", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hookMocks.useGenres.mockReturnValue({
      data: {
        data: [{ mal_id: 1, name: "Action" }],
      },
    });
    hookMocks.useTopAnime.mockReturnValue({
      data: { data: [], pagination: { has_next_page: true } },
      isLoading: false,
    });
    hookMocks.useSeasonNow.mockReturnValue({
      data: { data: [], pagination: { has_next_page: true } },
      isLoading: false,
    });
    hookMocks.useAnimeByGenre.mockReturnValue({
      data: { data: [], pagination: { has_next_page: true } },
      isLoading: false,
    });
    hookMocks.useTopMovies.mockReturnValue({
      data: { data: [], pagination: { has_next_page: true } },
      isLoading: false,
    });
  });

  it("reads page from the URL and preserves filter when paging", async () => {
    renderPage("/browse?filter=popular&page=2");

    expect(hookMocks.useTopAnime).toHaveBeenCalledWith(2, "bypopularity");
    expect(screen.getByText("صفحة 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "السابق" }));

    await waitFor(() => {
      expect(hookMocks.useTopAnime).toHaveBeenLastCalledWith(1, "bypopularity");
    });
    expect(screen.getByTestId("location-search")).toHaveTextContent("?filter=popular");
  });

  it("falls back to page 1 for invalid page params", () => {
    renderPage("/browse?filter=popular&page=abc");

    expect(hookMocks.useTopAnime).toHaveBeenCalledWith(1, "bypopularity");
    expect(screen.getByText("صفحة 1")).toBeInTheDocument();
  });
});
