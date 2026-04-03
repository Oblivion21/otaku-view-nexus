import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useSearchAnime: vi.fn(),
  useMultipleAnimeTmdbArtwork: vi.fn(),
  useGenres: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/AnimeGrid", () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock("@/components/ui/accordion", () => ({
  Accordion: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AccordionItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AccordionTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AccordionContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/slider", () => ({
  Slider: () => <div data-testid="score-slider" />,
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
    vi.useFakeTimers();

    hookMocks.useSearchAnime.mockReturnValue({
      data: { data: [anime], pagination: { has_next_page: true } },
      isLoading: false,
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map(),
      isLoading: false,
    });
    hookMocks.useGenres.mockReturnValue({
      data: {
        data: [{ mal_id: 1, name: "Action" }],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads q and page from the URL and preserves q when paging", async () => {
    renderPage("/search?q=naruto&page=3");

    expect(hookMocks.useSearchAnime).toHaveBeenCalledWith({ query: "naruto", page: 3 });
    expect(screen.getByText("صفحة 3")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "السابق" }));

    expect(hookMocks.useSearchAnime).toHaveBeenLastCalledWith({ query: "naruto", page: 2 });
    expect(screen.getByTestId("location-search")).toHaveTextContent("?q=naruto&page=2");
  });

  it("falls back to page 1 for invalid page params", () => {
    renderPage("/search?q=naruto&page=oops");

    expect(hookMocks.useSearchAnime).toHaveBeenCalledWith({ query: "naruto", page: 1 });
    expect(screen.getByText("صفحة 1")).toBeInTheDocument();
  });

  it("shows the idle prompt when there is no query and no active filters", () => {
    renderPage("/search");

    expect(screen.getByText("أدخل اسم الأنمي أو استخدم الفلاتر لبدء البحث.")).toBeInTheDocument();
  });

  it("supports filter-only searches from the URL", () => {
    renderPage("/search?genre=1&yearFrom=2010");

    expect(hookMocks.useSearchAnime).toHaveBeenCalledWith({
      page: 1,
      genreId: 1,
      yearFrom: 2010,
    });
    expect(screen.queryByText("أدخل اسم الأنمي أو استخدم الفلاتر لبدء البحث.")).not.toBeInTheDocument();
  });

  it("debounces query changes and resets pagination", async () => {
    renderPage("/search?q=naruto&page=4&yearFrom=2010");

    fireEvent.change(screen.getByPlaceholderText("ابحث عن أنمي..."), {
      target: { value: "bleach" },
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByTestId("location-search")).toHaveTextContent("?q=bleach&yearFrom=2010");
    expect(screen.getByTestId("location-search")).not.toHaveTextContent("page=4");
  });

  it("applies year range changes and resets pagination", async () => {
    renderPage("/search?q=naruto&page=5");

    fireEvent.change(screen.getAllByPlaceholderText("مثال: 2010")[0], {
      target: { value: "2010" },
    });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(screen.getByTestId("location-search")).toHaveTextContent("?q=naruto&yearFrom=2010");
    expect(screen.getByTestId("location-search")).not.toHaveTextContent("page=5");
  });

  it("resets filters while preserving the current query", async () => {
    renderPage("/search?q=naruto&yearFrom=2010&yearTo=2015");

    fireEvent.click(screen.getAllByRole("button", { name: "إعادة ضبط الفلاتر" })[0]);

    expect(screen.getByTestId("location-search")).toHaveTextContent("?q=naruto");
    expect(screen.getByTestId("location-search")).not.toHaveTextContent("yearFrom");
    expect(screen.getByTestId("location-search")).not.toHaveTextContent("yearTo");
  });

  it("preserves active filters when paging forward", async () => {
    renderPage("/search?q=naruto&yearFrom=2010&sort=desc");

    fireEvent.click(screen.getByRole("button", { name: "التالي" }));

    expect(screen.getByTestId("location-search")).toHaveTextContent("?q=naruto&yearFrom=2010&sort=desc&page=2");
  });
});
