import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useSearchAnime: vi.fn(),
  useMultipleAnimeTmdbArtwork: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/AnimeGrid", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/hooks/useAnime", () => hookMocks);

import SearchPage from "./SearchPage";

const anime = {
  mal_id: 1,
  title: "Naruto",
  images: {
    jpg: { image_url: "https://example.com/naruto.jpg", large_image_url: "https://example.com/naruto-large.jpg" },
    webp: { image_url: "https://example.com/naruto.webp", large_image_url: "https://example.com/naruto-large.webp" },
  },
};

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location-search">{location.search}</div>;
}

function renderPage(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SearchPage />
      <LocationDisplay />
    </MemoryRouter>,
  );
}

describe("SearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hookMocks.useSearchAnime.mockReturnValue({
      data: { data: [anime], pagination: { has_next_page: true } },
      isLoading: false,
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map(),
    });
  });

  it("reads q and page from the URL and preserves q when paging", async () => {
    renderPage("/search?q=naruto&page=3");

    expect(hookMocks.useSearchAnime).toHaveBeenCalledWith("naruto", 3);
    expect(screen.getByText("صفحة 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "السابق" }));

    await waitFor(() => {
      expect(hookMocks.useSearchAnime).toHaveBeenLastCalledWith("naruto", 2);
    });
    expect(screen.getByTestId("location-search")).toHaveTextContent("?q=naruto&page=2");
  });

  it("falls back to page 1 for invalid page params", () => {
    renderPage("/search?q=naruto&page=oops");

    expect(hookMocks.useSearchAnime).toHaveBeenCalledWith("naruto", 1);
    expect(screen.getByText("صفحة 1")).toBeInTheDocument();
  });
});
