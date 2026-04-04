import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useAnimeById: vi.fn(),
  useAllAnimeEpisodes: vi.fn(),
  useAnimeAniListMedia: vi.fn(),
  useAnimeTmdbArtwork: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  getEpisodeData: vi.fn(),
  getAnimeEpisodes: vi.fn(),
  resolveProxyVideoUrl: vi.fn(),
  scrapeAnime3rbEpisode: vi.fn(),
}));

const trailerFallbackMocks = vi.hoisted(() => ({
  getTrailerYoutubeId: vi.fn(),
}));

const jikanMocks = vi.hoisted(() => ({
  isBlockedAnime: vi.fn(),
}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
}));

vi.mock("@/hooks/useAnime", () => hookMocks);
vi.mock("@/lib/supabase", () => supabaseMocks);
vi.mock("@/lib/trailerFallback", () => trailerFallbackMocks);
vi.mock("@/lib/jikan", () => jikanMocks);

import EpisodeWatch from "./EpisodeWatch";

const anime = {
  mal_id: 1,
  title: "Naruto",
  title_english: "Naruto",
  title_japanese: "ナルト",
  type: "TV",
  year: 2002,
  aired: { from: "2002-10-03", to: null, string: "2002" },
  trailer: { youtube_id: null, url: null, embed_url: null },
  genres: [],
  images: {
    jpg: { image_url: "", large_image_url: "" },
    webp: { image_url: "", large_image_url: "" },
  },
};

function renderPage(path = "/watch/1/1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div>Home</div>} />
        <Route path="/anime/:id" element={<div>Anime Page</div>} />
        <Route path="/watch/:id/:episode" element={<EpisodeWatch />} />
      </Routes>
    </MemoryRouter>,
  );
}

function activateTab(tab: HTMLElement) {
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
}

beforeAll(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

describe("EpisodeWatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: anime },
      isLoading: false,
    });
    hookMocks.useAllAnimeEpisodes.mockReturnValue({
      data: { data: [{ mal_id: 1, title: "Episode 1" }] },
    });
    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: {
        id: 21,
        idMal: 1,
        format: "TV",
        title: {
          romaji: "Naruto",
          english: "Naruto",
          native: "ナルト",
        },
        bannerImage: null,
        coverImage: {
          extraLarge: "",
          large: "",
          color: null,
        },
      },
      isLoading: false,
      error: null,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    jikanMocks.isBlockedAnime.mockReturnValue(false);
    trailerFallbackMocks.getTrailerYoutubeId.mockReturnValue(null);

    supabaseMocks.getEpisodeData.mockResolvedValue(null);
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);
    supabaseMocks.resolveProxyVideoUrl.mockResolvedValue({ url: "", error: "" });
    supabaseMocks.scrapeAnime3rbEpisode.mockResolvedValue({
      video_sources: null,
      cached: false,
      episode_page_url: null,
      error: "No video sources found",
    });
  });

  it("shows Vidplays as Main Player by default and prepares the backup flow in the background", async () => {
    renderPage();

    const mainTab = await screen.findByRole("tab", { name: "Main Player" });
    expect(mainTab).toHaveAttribute("data-state", "active");
    expect(screen.getByRole("tab", { name: "Second Player" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Third Player" })).toBeInTheDocument();

    const mainIframe = await screen.findByTitle("Naruto - Main Player");
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("https://vidplays.fun/embed/anime/21/1/sub"));
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("autoplay=true"));
    expect(screen.getByRole("link", { name: /الحلقة السابقة/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /الحلقة التالية/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(supabaseMocks.getEpisodeData).toHaveBeenCalledWith(1, 1);
      expect(supabaseMocks.scrapeAnime3rbEpisode).toHaveBeenCalledWith("Naruto", "Naruto", 1, 1, false);
    });
  });

  it("uses the AniList anime embed path for the Main Player tab", async () => {
    renderPage();

    const mainIframe = await screen.findByTitle("Naruto - Main Player");
    expect(mainIframe).toHaveAttribute(
      "src",
      expect.stringContaining("https://vidplays.fun/embed/anime/21/1/sub?autoplay=true"),
    );
  });

  it("uses the AniList anime embed path for the VidPlus tab", async () => {
    renderPage();

    const vidplusTab = screen.getByRole("tab", { name: "Second Player" });
    activateTab(vidplusTab);

    await waitFor(() => {
      expect(vidplusTab).toHaveAttribute("data-state", "active");
    });

    const vidplusIframe = await screen.findByTitle("Naruto - VidPlus");
    expect(vidplusIframe).toHaveAttribute(
      "src",
      expect.stringContaining("https://player.vidplus.to/embed/anime/21/1?autoplay=true&dub=false"),
    );
  });

  it("does not scrape when a fresh cached episode link already exists", async () => {
    supabaseMocks.getEpisodeData.mockResolvedValue({
      id: "episode-1",
      mal_id: 1,
      episode_number: 1,
      episode_page_url: "https://anime3rb.com/episode/naruto/1",
      video_url: "https://cdn.example.com/naruto-1.mp4",
      quality: "1080p",
      video_sources: [
        {
          url: "https://cdn.example.com/naruto-1.mp4",
          type: "direct",
          server_name: "anime3rb",
          quality: "1080p",
        },
      ],
      subtitle_language: "ar",
      is_active: true,
      category: null,
      tags: [],
      scraped_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    renderPage();

    await screen.findByTitle("Naruto - Main Player");
    expect(screen.getByRole("tab", { name: "Main Player" })).toHaveAttribute("data-state", "active");

    expect(supabaseMocks.scrapeAnime3rbEpisode).not.toHaveBeenCalled();
  });

  it("shows episode score and filler label in the episode list", async () => {
    hookMocks.useAllAnimeEpisodes.mockReturnValue({
      data: {
        data: [
          {
            mal_id: 1,
            title: "Enter: Naruto Uzumaki!",
            score: 4.13,
            filler: true,
            recap: false,
          },
        ],
      },
    });

    renderPage();

    expect(await screen.findByText("Enter: Naruto Uzumaki!")).toBeInTheDocument();
    expect(screen.getByText("8.3")).toBeInTheDocument();
    expect(screen.getByText("Filler")).toBeInTheDocument();
  });

  it("shows the full episode count when more than 100 episodes are available", async () => {
    hookMocks.useAllAnimeEpisodes.mockReturnValue({
      data: {
        data: Array.from({ length: 120 }, (_, index) => ({
          mal_id: index + 1,
          title: `Episode ${index + 1}`,
          filler: false,
          recap: false,
        })),
      },
    });

    renderPage("/watch/235/1");

    expect(await screen.findByText("120 من 120")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Episode 120/i })).toBeInTheDocument();
  });

  it("scrapes when the cached episode link is older than 2 hours", async () => {
    const staleScrapedAt = new Date(Date.now() - ((2 * 60 * 60 * 1000) + 60_000)).toISOString();

    supabaseMocks.getEpisodeData.mockResolvedValue({
      id: "episode-1",
      mal_id: 1,
      episode_number: 1,
      episode_page_url: "https://anime3rb.com/episode/naruto/1",
      video_url: "https://cdn.example.com/naruto-1.mp4",
      quality: "1080p",
      video_sources: [
        {
          url: "https://cdn.example.com/naruto-1.mp4",
          type: "direct",
          server_name: "anime3rb",
          quality: "1080p",
        },
      ],
      subtitle_language: "ar",
      is_active: true,
      category: null,
      tags: [],
      scraped_at: staleScrapedAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    renderPage();

    await screen.findByTitle("Naruto - Main Player");

    await waitFor(() => {
      expect(supabaseMocks.scrapeAnime3rbEpisode).toHaveBeenCalledWith("Naruto", "Naruto", 1, 1, false);
    });
  });

  it("auto-switches to Backup Player when AniList metadata is unavailable", async () => {
    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    supabaseMocks.getEpisodeData.mockResolvedValue({
      id: "episode-1",
      mal_id: 1,
      episode_number: 1,
      episode_page_url: null,
      video_url: "https://cdn.example.com/naruto-1.mp4",
      quality: "1080p",
      video_sources: [
        {
          url: "https://cdn.example.com/naruto-1.mp4",
          type: "direct",
          server_name: "anime3rb",
          quality: "1080p",
        },
      ],
      subtitle_language: "ar",
      is_active: true,
      category: null,
      tags: [],
      scraped_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    renderPage();

    expect(screen.queryByRole("tab", { name: "Second Player" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Third Player" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Backup Player" })).toHaveAttribute("data-state", "active");
      expect(document.querySelector("video")).toBeInTheDocument();
    });
  });

  it("uses the movie-style Videasy url for anime movies", async () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          ...anime,
          type: "Movie",
        },
      },
      isLoading: false,
    });

    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 299534,
        mediaType: "movie",
        posterUrl: null,
        backdropUrl: null,
        matchedTitle: "Naruto Movie",
        seasonNumber: null,
        seasonName: null,
        matchConfidence: "high",
      },
      isLoading: false,
      error: null,
    });

    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: {
        id: 145139,
        idMal: 1,
        format: "MOVIE",
        title: {
          romaji: "The First Slam Dunk",
          english: "The First Slam Dunk",
          native: "THE FIRST SLAM DUNK",
        },
        bannerImage: null,
        coverImage: {
          extraLarge: "",
          large: "",
          color: null,
        },
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    const videasyTab = await screen.findByRole("tab", { name: "Third Player" });
    activateTab(videasyTab);

    await waitFor(() => {
      expect(videasyTab).toHaveAttribute("data-state", "active");
    });

    const mainIframe = await screen.findByTitle("Naruto - Third Player");
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("https://player.videasy.net/movie/299534?color=00D0FF"));
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("autoplay=1"));
    expect(mainIframe).not.toHaveAttribute("src", expect.stringContaining("/anime/145139"));
    expect(screen.getByRole("tab", { name: "Main Player" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Second Player" })).toBeInTheDocument();
  });

  it("uses the tmdb movie path for the Main Player movie tab", async () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          ...anime,
          type: "Movie",
          title: "Kimi no Na wa.",
        },
      },
      isLoading: false,
    });

    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 299534,
        mediaType: "movie",
        posterUrl: null,
        backdropUrl: null,
        trailerYoutubeId: null,
        matchedTitle: "Kimi no Na wa.",
        seasonNumber: null,
        seasonName: null,
        matchConfidence: "high",
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    const mainIframe = await screen.findByTitle("Kimi no Na wa. - Main Player");
    expect(mainIframe).toHaveAttribute(
      "src",
      expect.stringContaining("https://vidplays.fun/embed/movie/299534?autoplay=true"),
    );
  });

  it("uses the AniList movie path for the VidPlus movie tab when AniList metadata is available", async () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          ...anime,
          type: "Movie",
          title: "Kimi no Na wa.",
        },
      },
      isLoading: false,
    });

    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 299534,
        mediaType: "movie",
        posterUrl: null,
        backdropUrl: null,
        trailerYoutubeId: null,
        matchedTitle: "Kimi no Na wa.",
        seasonNumber: null,
        seasonName: null,
        matchConfidence: "high",
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    const vidplusTab = screen.getByRole("tab", { name: "Second Player" });
    activateTab(vidplusTab);

    await waitFor(() => {
      expect(vidplusTab).toHaveAttribute("data-state", "active");
    });

    const vidplusIframe = await screen.findByTitle("Kimi no Na wa. - VidPlus");
    expect(vidplusIframe).toHaveAttribute(
      "src",
      expect.stringContaining("https://player.vidplus.to/embed/anime/21/1?autoplay=true&dub=false"),
    );
  });

  it("falls back to the AniList movie path when tmdb movie metadata is unavailable", async () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          ...anime,
          type: "Movie",
        },
      },
      isLoading: false,
    });

    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: {
        id: 145139,
        idMal: 1,
        format: "MOVIE",
        title: {
          romaji: "The First Slam Dunk",
          english: "The First Slam Dunk",
          native: "THE FIRST SLAM DUNK",
        },
        bannerImage: null,
        coverImage: {
          extraLarge: "",
          large: "",
          color: null,
        },
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    const mainIframe = await screen.findByTitle("Naruto - Main Player");
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("https://player.videasy.net/anime/145139?color=00D0FF"));
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("autoplay=1"));
    expect(mainIframe).not.toHaveAttribute("src", expect.stringContaining("/145139/1"));
    expect(screen.getByRole("tab", { name: "Second Player" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Third Player" })).not.toBeInTheDocument();
  });

  it("switches to the backup player when neither tmdb nor anilist movie metadata is available", async () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          ...anime,
          type: "Movie",
        },
      },
      isLoading: false,
    });

    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    supabaseMocks.getEpisodeData.mockResolvedValue({
      id: "movie-1",
      mal_id: 1,
      episode_number: 1,
      episode_page_url: null,
      video_url: "https://cdn.example.com/naruto-movie.mp4",
      quality: "1080p",
      video_sources: [
        {
          url: "https://cdn.example.com/naruto-movie.mp4",
          type: "direct",
          server_name: "anime3rb",
          quality: "1080p",
        },
      ],
      subtitle_language: "ar",
      is_active: true,
      category: null,
      tags: [],
      scraped_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    renderPage();

    expect(screen.queryByRole("tab", { name: "Second Player" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Third Player" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Backup Player" })).toHaveAttribute("data-state", "active");
      expect(document.querySelector("video")).toBeInTheDocument();
    });
  });

  it("renders movie watch pages without episode framing", async () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          ...anime,
          type: "Movie",
          title: "Kimi no Na wa.",
        },
      },
      isLoading: false,
    });

    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 299534,
        mediaType: "movie",
        posterUrl: null,
        backdropUrl: null,
        matchedTitle: "Kimi no Na wa.",
        seasonNumber: null,
        seasonName: null,
        matchConfidence: "high",
      },
      isLoading: false,
      error: null,
    });

    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: {
        id: 145139,
        idMal: 1,
        format: "MOVIE",
        title: {
          romaji: "Kimi no Na wa.",
          english: "Your Name",
          native: "君の名は。",
        },
        bannerImage: null,
        coverImage: {
          extraLarge: "",
          large: "",
          color: null,
        },
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(await screen.findByRole("heading", { name: "Kimi no Na wa." })).toBeInTheDocument();
    expect(screen.queryByText(/— الحلقة 1/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /الحلقة السابقة/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /الحلقة التالية/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "الحلقات" })).not.toBeInTheDocument();
  });

  it("uses movie wording when no backup stream is available", async () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          ...anime,
          type: "Movie",
          title: "Kimi no Na wa.",
        },
      },
      isLoading: false,
    });

    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    hookMocks.useAnimeAniListMedia.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    supabaseMocks.getEpisodeData.mockResolvedValue(null);
    supabaseMocks.scrapeAnime3rbEpisode.mockResolvedValue({
      video_sources: null,
      cached: false,
      episode_page_url: null,
      error: "No video sources found",
    });

    renderPage();

    await waitFor(
      () => {
        expect(screen.getByRole("tab", { name: "Backup Player" })).toHaveAttribute("data-state", "active");
        expect(screen.getByText("الفيلم غير متوفر حالياً")).toBeInTheDocument();
      },
      { timeout: 8000 },
    );
    expect(screen.queryByText(/الحلقة 1 غير متوفرة حالياً/)).not.toBeInTheDocument();
  });

  it("keeps trailer pages on the existing youtube player without player tabs", async () => {
    trailerFallbackMocks.getTrailerYoutubeId.mockReturnValue("abc123");
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 1,
        mediaType: "tv",
        posterUrl: null,
        backdropUrl: null,
        trailerYoutubeId: "tmdb-trailer-1",
        matchedTitle: "Naruto",
        seasonNumber: 1,
        seasonName: null,
        matchConfidence: "high",
      },
      isLoading: false,
      error: null,
    });

    renderPage("/watch/1/trailer");

    expect(screen.queryByRole("tab", { name: "Main Player" })).not.toBeInTheDocument();
    expect(await screen.findByTitle("Naruto - Trailer")).toHaveAttribute(
      "src",
      expect.stringContaining("youtube.com/embed/abc123"),
    );
    expect(trailerFallbackMocks.getTrailerYoutubeId).toHaveBeenCalledWith(
      "tmdb-trailer-1",
      null,
      null,
      null,
    );
  });
});
