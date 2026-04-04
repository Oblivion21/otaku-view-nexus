import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JikanAnime } from "@/lib/jikan";
import type { EpisodePreviewRailItem } from "@/components/EpisodePreviewRail";

const hookMocks = vi.hoisted(() => ({
  useAnimeAniListMedia: vi.fn(),
  useAnimeById: vi.fn(),
  useAnimeEpisodes: vi.fn(),
  useAnimeRecommendations: vi.fn(),
  useAnimeCharacters: vi.fn(),
  useAnimeThemes: vi.fn(),
  useAnimeRelations: vi.fn(),
  useAnimeTmdbArtwork: vi.fn(),
  useAnimeEpisodePreviewImages: vi.fn(),
  useAnimeEpisodeImdbRatings: vi.fn(),
  useMultipleAnimeTmdbArtwork: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  getAnimeEpisodes: vi.fn(),
}));

const trailerFallbackMocks = vi.hoisted(() => ({
  getTrailerYoutubeId: vi.fn(),
}));

const animeCardSpy = vi.hoisted(() => vi.fn());

type LayoutProps = {
  children: ReactNode;
};

type MockContentRailProps = {
  title: string;
  items?: unknown[];
  emptyMessage: string;
  renderItem: (item: unknown, index: number) => ReactNode;
  headerAction?: ReactNode;
};

type MockEpisodePreviewRailProps = {
  title: string;
  items: EpisodePreviewRailItem[];
  emptyMessage: string;
  headerActionHref: string;
  headerActionLabel: string;
  loadingMore?: boolean;
  onReachEnd?: () => void;
  hideControls?: boolean;
  hintSwipeOnMount?: boolean;
};

type MockAnimeCardProps = {
  anime: { mal_id: number; title: string };
  artworkUrl?: string | null;
};

vi.mock("@/components/Layout", () => ({
  default: ({ children }: LayoutProps) => <div>{children}</div>,
}));
vi.mock("@/components/ContentRail", () => ({
  default: ({ title, items, emptyMessage, renderItem, headerAction }: MockContentRailProps) => (
    <section>
      <div>{title}</div>
      {headerAction}
      {items?.length ? items.map((item, index) => <div key={index}>{renderItem(item, index)}</div>) : <p>{emptyMessage}</p>}
    </section>
  ),
}));
vi.mock("@/components/EpisodePreviewRail", () => ({
  default: ({ title, items, emptyMessage, headerActionHref, headerActionLabel, loadingMore, onReachEnd, hideControls, hintSwipeOnMount }: MockEpisodePreviewRailProps) => (
    <section
      data-testid="episode-preview-rail"
      data-hide-controls={hideControls ? "true" : "false"}
      data-hint-swipe-on-mount={hintSwipeOnMount ? "true" : "false"}
    >
      <div>{title}</div>
      <a href={headerActionHref}>{headerActionLabel}</a>
      <button type="button" onClick={onReachEnd}>Load more episodes</button>
      {loadingMore ? <div>Loading more episodes</div> : null}
      {items?.length ? items.map((item) => (
        <div
          key={item.episodeNumber}
          data-testid={`episode-preview-${item.episodeNumber}`}
          data-image-url={item.imageUrl || ""}
          data-score-label={item.scoreLabel || ""}
          data-badges={(item.badges || []).join(",")}
        >
          {item.title}
        </div>
      )) : <p>{emptyMessage}</p>}
    </section>
  ),
}));
vi.mock("@/components/AnimeCard", () => ({
  default: (props: MockAnimeCardProps) => {
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

function renderPage(path = "/anime/1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
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
    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: null,
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
      isLoading: false,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map(),
    });
    hookMocks.useAnimeEpisodeImdbRatings.mockReturnValue({
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

  it("accepts slugged anime detail routes and still resolves the MAL id", async () => {
    renderPage("/anime/naruto-1");

    expect(hookMocks.useAnimeById).toHaveBeenCalledWith(1);
    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
  });

  it("loads 24 more episodes when the user reaches the end of the rail", async () => {
    hookMocks.useAnimeEpisodes.mockImplementation((_animeId: number, page = 1) => {
      if (page === 1) {
        return {
          data: {
            data: Array.from({ length: 24 }, (_, index) => ({
              mal_id: index + 1,
              title: `Episode ${index + 1}`,
              title_japanese: null,
              title_romanji: null,
              aired: null,
              score: null,
              filler: false,
              recap: false,
            })),
            pagination: {
              current_page: 1,
              has_next_page: true,
              last_visible_page: 2,
            },
          },
          isLoading: false,
          isFetching: false,
        };
      }

      return {
        data: {
          data: Array.from({ length: 24 }, (_, index) => ({
            mal_id: index + 25,
            title: `Episode ${index + 25}`,
            title_japanese: null,
            title_romanji: null,
            aired: null,
            score: null,
            filler: false,
            recap: false,
          })),
          pagination: {
            current_page: 2,
            has_next_page: false,
            last_visible_page: 2,
          },
        },
        isLoading: false,
        isFetching: false,
      };
    });

    renderPage();

    expect(screen.getByTestId("episode-preview-rail")).toHaveAttribute("data-hide-controls", "true");
    expect(screen.getByTestId("episode-preview-rail")).toHaveAttribute("data-hint-swipe-on-mount", "true");
    expect(screen.getByTestId("episode-preview-24")).toBeInTheDocument();
    expect(screen.queryByTestId("episode-preview-25")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more episodes" }));

    await waitFor(() => {
      expect(hookMocks.useAnimeEpisodes).toHaveBeenCalledWith(1, 2);
    });
    expect(await screen.findByTestId("episode-preview-25")).toBeInTheDocument();
    expect(screen.getByTestId("episode-preview-48")).toBeInTheDocument();
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
      isLoading: false,
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
            score: 4.7,
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
    expect(screen.getByTestId("episode-preview-1")).toHaveAttribute("data-score-label", "9.4");
  });

  it("does not render Jikan banner or poster artwork while TMDB artwork is still loading", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: true,
    });

    const { container } = renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.queryByAltText("Naruto")).not.toBeInTheDocument();
    expect(container.querySelector('[style*="jikan.example.com"]')).toBeNull();
  });

  it("falls back to the Jikan trailer for the background banner when TMDB has no trailer", async () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          ...anime,
          trailer: {
            youtube_id: "jikan-trailer-7",
            url: "https://www.youtube.com/watch?v=jikan-trailer-7",
            embed_url: "https://www.youtube.com/embed/jikan-trailer-7",
          },
        },
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
      isLoading: false,
    });
    trailerFallbackMocks.getTrailerYoutubeId.mockImplementation((tmdbId, jikanId) => tmdbId || jikanId || null);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(trailerFallbackMocks.getTrailerYoutubeId).toHaveBeenCalledWith(
      null,
      "jikan-trailer-7",
      "https://www.youtube.com/embed/jikan-trailer-7",
      "https://www.youtube.com/watch?v=jikan-trailer-7",
    );
    expect(screen.getByTitle("Trailer jikan-trailer-7")).toBeInTheDocument();
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

  it("labels Jikan filler episodes with a filler badge", async () => {
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: {
        data: [
          {
            mal_id: 97,
            title: "Kidnapped! Naruto's Hot Spring Adventure!",
            title_japanese: null,
            title_romanji: null,
            aired: null,
            filler: true,
            recap: false,
          },
        ],
      },
      isLoading: false,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map([
        [97, { episodeNumber: 97, imageUrl: "https://cdn.jikan.moe/video-thumb-97.jpg", source: "jikan" }],
      ]),
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.getByTestId("episode-preview-97")).toHaveAttribute(
      "data-badges",
      expect.stringContaining("Filler"),
    );
  });

  it("falls back to the series artwork when no episode-specific preview image exists", async () => {
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
      isLoading: false,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map([
        [1, { episodeNumber: 1, imageUrl: null, source: "none" }],
      ]),
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    expect(screen.getByTestId("episode-preview-1")).toHaveAttribute(
      "data-image-url",
      expect.stringContaining("naruto-backdrop.jpg"),
    );
  });

  it("falls back to Jikan artwork when TMDB is missing", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
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
      isLoading: false,
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

  it("keeps the movie page free of episode rails while allowing the watch CTA when movie metadata exists", async () => {
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
      isLoading: false,
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
    expect(screen.getByRole("link", { name: "شاهد الفيلم" })).toHaveAttribute("href", "/watch/32281/1");
    expect(screen.queryByRole("button", { name: "غير متوفر حالياً" })).not.toBeInTheDocument();
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
    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: null,
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
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
    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: null,
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
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

  it("trusts a past air date even if the upstream status is still not yet aired", async () => {
    const releasedAnime: JikanAnime = {
      ...anime,
      mal_id: 62568,
      title: "Dr. Stone: Science Future Part 3",
      status: "Not yet aired",
      aired: { from: "2026-04-02", to: null, string: "Apr 2, 2026" },
    };
    const tmdbArtwork = {
      tmdbId: 91011,
      mediaType: "tv" as const,
      posterUrl: "https://image.tmdb.org/t/p/w780/dr-stone-poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/dr-stone-backdrop.jpg",
      trailerYoutubeId: null,
      matchedTitle: "Dr. Stone: Science Future Part 3",
      seasonNumber: 1,
      seasonName: null,
      matchConfidence: "high" as const,
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: releasedAnime },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: tmdbArtwork,
      isLoading: false,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isFetching: false,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map([
        [1, {
          episodeNumber: 1,
          imageUrl: "https://image.tmdb.org/t/p/w780/dr-stone-ep-1.jpg",
          fallbackImageUrl: null,
          imdbRating: 8.3,
          source: "tmdb",
        }],
      ]),
    });
    hookMocks.useAnimeEpisodeImdbRatings.mockReturnValue({
      data: new Map([[1, 8.3]]),
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/anime/62568"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dr. Stone: Science Future Part 3" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شاهد الحلقة 1" })).toHaveAttribute("href", "/watch/62568/1");
    expect(screen.getByTestId("episode-preview-1")).toBeInTheDocument();
  });

  it("renders the movie watch button when a released movie only has main-player metadata", async () => {
    const movieAnime: JikanAnime = {
      ...anime,
      mal_id: 33161,
      title: "Koe no Katachi",
      type: "Movie",
      episodes: 1,
      status: "Finished Airing",
      aired: { from: "2016-09-17", to: null, string: "2016" },
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: movieAnime },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 378064,
        mediaType: "movie",
        posterUrl: null,
        backdropUrl: null,
        trailerYoutubeId: null,
        matchedTitle: "Koe no Katachi",
        seasonNumber: null,
        seasonName: null,
        matchConfidence: "high",
      },
      isLoading: false,
    });
    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: null,
      isLoading: false,
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/anime/33161"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Koe no Katachi" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "شاهد الفيلم" })).toHaveAttribute("href", "/watch/33161/1");
    expect(screen.queryByRole("button", { name: "غير متوفر حالياً" })).not.toBeInTheDocument();
  });

  it("renders the watch button for tv specials when episode data exists", async () => {
    const specialAnime: JikanAnime = {
      ...anime,
      mal_id: 10431,
      title: "Magic Kaito",
      type: "TV Special",
      episodes: 12,
      status: "Finished Airing",
      aired: { from: "2010-04-17", to: "2012-12-29", string: "2010-2012" },
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: specialAnime },
      isLoading: false,
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
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/anime/10431"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Magic Kaito" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شاهد الحلقة 1" })).toBeInTheDocument();
  });

  it("renders the first episode CTA and preview rail when a released series only has first-card metadata", async () => {
    const releasedAnime: JikanAnime = {
      ...anime,
      mal_id: 62568,
      title: "Dr. Stone: Science Future Part 3",
      status: "Currently Airing",
      aired: { from: "2026-04-02", to: null, string: "Apr 2, 2026" },
    };
    const tmdbArtwork = {
      tmdbId: 91011,
      mediaType: "tv" as const,
      posterUrl: "https://image.tmdb.org/t/p/w780/dr-stone-poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/dr-stone-backdrop.jpg",
      trailerYoutubeId: null,
      matchedTitle: "Dr. Stone: Science Future Part 3",
      seasonNumber: 1,
      seasonName: null,
      matchConfidence: "high" as const,
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: releasedAnime },
      isLoading: false,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: tmdbArtwork,
      isLoading: false,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isFetching: false,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map([
        [1, {
          episodeNumber: 1,
          imageUrl: "https://image.tmdb.org/t/p/w780/dr-stone-ep-1.jpg",
          fallbackImageUrl: null,
          imdbRating: 8.3,
          source: "tmdb",
        }],
      ]),
    });
    hookMocks.useAnimeEpisodeImdbRatings.mockReturnValue({
      data: new Map([[1, 8.3]]),
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/anime/62568"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dr. Stone: Science Future Part 3" })).toBeInTheDocument();
    expect(hookMocks.useAnimeEpisodePreviewImages).toHaveBeenCalledWith(62568, tmdbArtwork, [1], true);
    expect(screen.getByRole("link", { name: "شاهد الحلقة 1" })).toHaveAttribute("href", "/watch/62568/1");
    expect(screen.getByTestId("episode-preview-1")).toHaveAttribute(
      "data-image-url",
      expect.stringContaining("dr-stone-ep-1.jpg"),
    );
    expect(screen.getByTestId("episode-preview-1")).toHaveAttribute("data-score-label", "8.3");
    expect(screen.getByRole("link", { name: "عرض كل الحلقات" })).toHaveAttribute("href", "/watch/62568/1");
  });

  it("renders the first episode CTA when a released series only has AniList playback metadata", async () => {
    const releasedAnime: JikanAnime = {
      ...anime,
      mal_id: 62568,
      title: "Dr. Stone: Science Future Part 3",
      status: "Currently Airing",
      aired: { from: "2026-04-02", to: null, string: "Apr 2, 2026" },
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: releasedAnime },
      isLoading: false,
    });
    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: {
        id: 199221,
        idMal: 62568,
        format: "TV",
        title: {
          romaji: "Dr. STONE: SCIENCE FUTURE Part 3",
          english: "Dr. STONE SCIENCE FUTURE Cour 3",
          native: "Dr.STONE SCIENCE FUTURE 3クール",
        },
        bannerImage: null,
        coverImage: {
          extraLarge: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/199221.jpg",
          large: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/199221.jpg",
          color: null,
        },
      },
      isLoading: false,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isFetching: false,
    });
    hookMocks.useAnimeEpisodePreviewImages.mockReturnValue({
      data: new Map(),
    });
    hookMocks.useAnimeEpisodeImdbRatings.mockReturnValue({
      data: new Map(),
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/anime/62568"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dr. Stone: Science Future Part 3" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "شاهد الحلقة 1" })).toHaveAttribute("href", "/watch/62568/1");
    expect(screen.getByTestId("episode-preview-1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "عرض كل الحلقات" })).toHaveAttribute("href", "/watch/62568/1");
  });

  it("does not render the episode watch button until one day passes from the tv release date", async () => {
    const withinFirstDayAnime: JikanAnime = {
      ...anime,
      mal_id: 62568,
      title: "Dr. Stone: Science Future Part 3",
      status: "Currently Airing",
      aired: {
        from: new Date(Date.now() - (12 * 60 * 60 * 1000)).toISOString(),
        to: null,
        string: "Today",
      },
    };

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: withinFirstDayAnime },
      isLoading: false,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: { data: [] },
      isLoading: false,
      isFetching: false,
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/anime/62568"]}>
        <Routes>
          <Route path="/anime/:id" element={<AnimeDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Dr. Stone: Science Future Part 3" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "شاهد الحلقة 1" })).not.toBeInTheDocument();
    expect(screen.queryByText("قائمة الحلقات")).not.toBeInTheDocument();
  });

  it("dedupes recommendation cards and shows the full-episodes CTA for series", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
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

  it("falls back to the main season recommendations when the current season has none", async () => {
    const fallbackRecommendation = {
      entry: {
        ...anime,
        mal_id: 5,
        title: "Fullmetal Alchemist: Brotherhood",
      },
      votes: 240,
    };

    hookMocks.useAnimeRelations.mockReturnValue({
      data: {
        data: [
          {
            relation: "Prequel",
            entry: [
              { mal_id: 10, type: "anime", name: "Dr. Stone: Stone Wars", url: "https://example.com/10" },
              { mal_id: 9, type: "anime", name: "Dr. Stone", url: "https://example.com/9" },
            ],
          },
        ],
      },
      isLoading: false,
    });
    hookMocks.useAnimeRecommendations.mockImplementation((id: number) => {
      if (id === 1) {
        return {
          data: { data: [] },
          isLoading: false,
        };
      }

      if (id === 9) {
        return {
          data: { data: [fallbackRecommendation] },
          isLoading: false,
        };
      }

      return {
        data: { data: [] },
        isLoading: false,
      };
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map([
        [5, { posterUrl: "https://image.tmdb.org/t/p/w780/fmab-poster.jpg", backdropUrl: null }],
      ]),
    });

    renderPage();

    await waitFor(() => {
      expect(hookMocks.useAnimeRecommendations).toHaveBeenCalledWith(9, true);
    });
    expect(await screen.findByTestId("recommendation-5")).toBeInTheDocument();
  });
});
