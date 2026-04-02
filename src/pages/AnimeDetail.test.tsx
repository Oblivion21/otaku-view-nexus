import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JikanAnime } from "@/lib/jikan";

const hookMocks = vi.hoisted(() => ({
  useAnimeById: vi.fn(),
  useAnimeEpisodes: vi.fn(),
  useAnimeRecommendations: vi.fn(),
  useAnimeCharacters: vi.fn(),
  useAnimeThemes: vi.fn(),
  useAnimeRelations: vi.fn(),
  useAnimeTmdbArtwork: vi.fn(),
  useAnimeEpisodePreviewImages: vi.fn(),
  useMultipleAnimeTmdbArtwork: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  getAnimeEpisodes: vi.fn(),
}));

const trailerFallbackMocks = vi.hoisted(() => ({
  getTrailerYoutubeId: vi.fn(),
}));

const animeCardSpy = vi.hoisted(() => vi.fn());

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
}));
vi.mock("@/components/ContentRail", () => ({
  default: ({ title, items, emptyMessage, renderItem, headerAction }: any) => (
    <section>
      <div>{title}</div>
      {headerAction}
      {items?.length ? items.map((item: any, index: number) => <div key={index}>{renderItem(item, index)}</div>) : <p>{emptyMessage}</p>}
    </section>
  ),
}));
vi.mock("@/components/EpisodePreviewRail", () => ({
  default: ({ title, items, emptyMessage, headerActionHref, headerActionLabel }: any) => (
    <section data-testid="episode-preview-rail">
      <div>{title}</div>
      <a href={headerActionHref}>{headerActionLabel}</a>
      {items?.length ? items.map((item: any) => (
        <div
          key={item.episodeNumber}
          data-testid={`episode-preview-${item.episodeNumber}`}
          data-image-url={item.imageUrl || ""}
        >
          {item.title}
        </div>
      )) : <p>{emptyMessage}</p>}
    </section>
  ),
}));
vi.mock("@/components/AnimeCard", () => ({
  default: (props: any) => {
    animeCardSpy(props);
    return (
      <div data-testid={`recommendation-${props.anime.mal_id}`} data-artwork-url={props.artworkUrl || ""}>
        {props.anime.title}
      </div>
    );
  },
}));
vi.mock("@/components/RelatedAnimeCard", () => ({
  default: () => <div>Related Anime</div>,
}));
vi.mock("@/hooks/useAnime", () => hookMocks);
vi.mock("@/lib/supabase", () => supabaseMocks);
vi.mock("@/lib/trailerFallback", () => trailerFallbackMocks);

import AnimeDetail from "@/pages/AnimeDetail";

const anime: JikanAnime = {
  mal_id: 1,
  title: "Naruto",
  title_english: "Naruto",
  title_japanese: "ナルト",
  images: {
    jpg: {
      image_url: "https://jikan.example.com/naruto.jpg",
      large_image_url: "https://jikan.example.com/naruto-large.jpg",
    },
    webp: {
      image_url: "https://jikan.example.com/naruto.webp",
      large_image_url: "https://jikan.example.com/naruto-large.webp",
    },
  },
  trailer: { youtube_id: null, url: null, embed_url: null },
  synopsis: "A ninja story.",
  score: 8.2,
  scored_by: 1000,
  rank: 1,
  popularity: 1,
  episodes: 220,
  status: "Finished Airing",
  rating: "PG-13",
  type: "TV",
  source: "Manga",
  duration: "24 min",
  aired: { from: "2002-10-03", to: "2007-02-08", string: "2002-2007" },
  season: "fall",
  year: 2002,
  studios: [{ mal_id: 1, name: "Studio Pierrot" }],
  genres: [{ mal_id: 1, name: "Action" }],
};

const recommendation = {
  entry: {
    ...anime,
    mal_id: 2,
    title: "Bleach",
  },
  votes: 120,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/anime/1"]}>
      <Routes>
        <Route path="/anime/:id" element={<AnimeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AnimeDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: anime },
      isLoading: false,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    hookMocks.useAnimeRecommendations.mockReturnValue({
      data: { data: [recommendation] },
      isLoading: false,
    });
    hookMocks.useAnimeCharacters.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    hookMocks.useAnimeThemes.mockReturnValue({
      data: { openings: [], endings: [] },
      isLoading: false,
    });
    hookMocks.useAnimeRelations.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map(),
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map([
        [2, { posterUrl: "https://image.tmdb.org/t/p/w780/bleach-poster.jpg", backdropUrl: null }],
      ]),
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);
    trailerFallbackMocks.getTrailerYoutubeId.mockReturnValue(null);
  });

  it("uses TMDB banner and poster artwork on the detail page, recommendations, and episode previews", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 1,
        mediaType: "tv",
        posterUrl: "https://image.tmdb.org/t/p/w780/naruto-poster.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/naruto-backdrop.jpg",
        trailerYoutubeId: "tmdb-trailer-1",
        matchedTitle: "Naruto",
        seasonNumber: 1,
        seasonName: null,
        matchConfidence: "high",
      },
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: {
        data: [
          {
            mal_id: 1,
            title: "Episode 1",
            title_japanese: null,
            title_romanji: null,
            aired: null,
            filler: false,
            recap: false,
          },
        ],
      },
      isLoading: false,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map([
        [1, { episodeNumber: 1, imageUrl: "https://image.tmdb.org/t/p/w780/naruto-ep-1.jpg", source: "tmdb" }],
      ]),
    });

    const { container } = renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(trailerFallbackMocks.getTrailerYoutubeId).toHaveBeenCalledWith(
      "tmdb-trailer-1",
      null,
      null,
    );
    expect(screen.getByAltText("Naruto")).toHaveAttribute(
      "src",
      expect.stringContaining("naruto-poster.jpg"),
    );
    expect(container.querySelector('[style*="naruto-backdrop.jpg"]')).not.toBeNull();
    expect(animeCardSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      artworkUrl: "https://image.tmdb.org/t/p/w780/bleach-poster.jpg",
    }));
    expect(container.querySelector('[src*="jikan.example.com"]')).toBeNull();
    expect(screen.getByTestId("episode-preview-1")).toHaveAttribute(
      "data-image-url",
      expect.stringContaining("naruto-ep-1.jpg"),
    );
  });

  it("falls back to Jikan episode thumbnails when TMDB stills are missing", async () => {
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: {
        data: [
          {
            mal_id: 1,
            title: "Episode 1",
            title_japanese: null,
            title_romanji: null,
            aired: null,
            filler: false,
            recap: false,
          },
        ],
      },
      isLoading: false,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map([
        [1, { episodeNumber: 1, imageUrl: "https://cdn.jikan.moe/video-thumb-1.jpg", source: "jikan" }],
      ]),
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.getByTestId("episode-preview-1")).toHaveAttribute(
      "data-image-url",
      expect.stringContaining("video-thumb-1.jpg"),
    );
  });

  it("does not reuse the series artwork when no episode-specific preview image exists", async () => {
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: {
        data: [
          {
            mal_id: 1,
            title: "Episode 1",
            title_japanese: null,
            title_romanji: null,
            aired: null,
            filler: false,
            recap: false,
          },
        ],
      },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 1,
        mediaType: "tv",
        posterUrl: "https://image.tmdb.org/t/p/w780/naruto-poster.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/naruto-backdrop.jpg",
        trailerYoutubeId: null,
        matchedTitle: "Naruto",
        seasonNumber: 1,
        seasonName: null,
        matchConfidence: "high",
      },
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map([
        [1, { episodeNumber: 1, imageUrl: null, source: "none" }],
      ]),
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.getByTestId("episode-preview-1")).toHaveAttribute("data-image-url", "");
  });

  it("falls back to Jikan artwork when TMDB is missing", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map(),
    });

    const { container } = renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.getByAltText("Naruto")).toHaveAttribute(
      "src",
      expect.stringContaining("jikan.example.com/naruto-large.webp"),
    );
    expect(container.querySelector('[style*="jikan.example.com/naruto-large.webp"]')).not.toBeNull();
    expect(animeCardSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      artworkUrl: "https://jikan.example.com/naruto-large.webp",
    }));
  });

  it("keeps the direct anime page accessible without placeholders when no artwork exists", async () => {
    const animeWithoutArtwork: JikanAnime = {
      ...anime,
      images: {
        jpg: { image_url: "", large_image_url: "" },
        webp: { image_url: "", large_image_url: "" },
      },
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: animeWithoutArtwork },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map(),
    });

    const { container } = renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Naruto artwork placeholder")).not.toBeInTheDocument();
    expect(screen.queryByAltText("Naruto")).not.toBeInTheDocument();
    expect(container.querySelector("img[src*='jikan.example.com']")).toBeNull();
  });

  it("does not render the episode list section on movie pages", async () => {
    const movieAnime: JikanAnime = {
      ...anime,
      mal_id: 32281,
      title: "Kimi no Na wa.",
      type: "Movie",
      episodes: 1,
      status: "Finished Airing",
      aired: { from: "2016-08-26", to: null, string: "2016" },
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: movieAnime },
      isLoading: false,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: {
        data: [
          {
            mal_id: 1,
            title: "الحلقة 1",
            title_japanese: null,
            title_romanji: null,
            aired: null,
            filler: false,
            recap: false,
          },
        ],
      },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([
      {
        id: "ep-1",
        mal_id: 32281,
        episode_number: 1,
        episode_page_url: null,
        video_url: null,
        video_sources: [],
        is_active: true,
        category: null,
        tags: [],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/anime/32281"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Kimi no Na wa." })).toBeInTheDocument();
    expect(screen.queryByText("1 حلقة")).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "غير متوفر حالياً" })).toBeDisabled();
    });
    expect(screen.queryByRole("link", { name: "شاهد الفيلم" })).not.toBeInTheDocument();
    expect(screen.queryByText("قائمة الحلقات")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "الحلقة 1" })).not.toBeInTheDocument();
  });

  it("renders the movie watch button when a released movie has playable stream data", async () => {
    const movieAnime: JikanAnime = {
      ...anime,
      mal_id: 32281,
      title: "Kimi no Na wa.",
      type: "Movie",
      episodes: 1,
      status: "Finished Airing",
      aired: { from: "2016-08-26", to: null, string: "2016" },
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: movieAnime },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([
      {
        id: "movie-1",
        mal_id: 32281,
        episode_number: 1,
        episode_page_url: null,
        video_url: "https://cdn.example.com/movie.mp4",
        video_sources: [],
        is_active: true,
        category: null,
        tags: [],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/anime/32281"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Kimi no Na wa." })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "شاهد الفيلم" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "غير متوفر حالياً" })).not.toBeInTheDocument();
  });

  it("shows unavailable for future movie releases", async () => {
    const movieAnime: JikanAnime = {
      ...anime,
      mal_id: 62387,
      title: "Meitantei Conan Movie 29: Highway no Datenshi",
      type: "Movie",
      episodes: 1,
      status: "Not yet aired",
      aired: { from: "2099-04-10", to: null, string: "Apr 10, 2099" },
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: movieAnime },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([
      {
        id: "movie-shell",
        mal_id: 62387,
        episode_number: 1,
        episode_page_url: null,
        video_url: null,
        video_sources: [],
        is_active: true,
        category: null,
        tags: [],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/anime/62387"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Meitantei Conan Movie 29: Highway no Datenshi" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "غير متوفر حالياً" })).toBeDisabled();
    });
    expect(screen.queryByRole("link", { name: "شاهد الفيلم" })).not.toBeInTheDocument();
  });

  it("does not render the episode watch button when a series has no actual episode data", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "شاهد الحلقة 1" })).not.toBeInTheDocument();
    expect(screen.queryByText("قائمة الحلقات")).not.toBeInTheDocument();
  });

  it("dedupes recommendation cards and shows the full-episodes CTA for series", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: {
        data: [
          {
            mal_id: 1,
            title: "Episode 1",
            title_japanese: null,
            title_romanji: null,
            aired: null,
            filler: false,
            recap: false,
          },
        ],
      },
      isLoading: false,
    });
    hookMocks.useAnimeRecommendations.mockReturnValue({
      data: {
        data: [
          recommendation,
          {
            entry: {
              ...anime,
              mal_id: 2,
              title: "Bleach Duplicate",
            },
            votes: 110,
          },
        ],
      },
      isLoading: false,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "عرض كل الحلقات" })).toBeInTheDocument();
    expect(screen.getAllByTestId("recommendation-2")).toHaveLength(1);
  });
});
