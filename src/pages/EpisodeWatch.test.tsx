import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useAnimeById: vi.fn(),
  useAnimeEpisodes: vi.fn(),
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
    hookMocks.useAnimeEpisodes.mockReturnValue({
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

  it("shows Main Player by default and prepares the backup flow in the background", async () => {
    renderPage();

    const mainTab = await screen.findByRole("tab", { name: "Main Player" });
    expect(mainTab).toHaveAttribute("data-state", "active");

    const mainIframe = await screen.findByTitle("Naruto - Main Player");
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("https://player.videasy.net/anime/21/1"));
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("color=00D0FF"));
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("autoplay=1"));
    expect(mainIframe).not.toHaveAttribute("src", expect.stringContaining("nextEpisode="));
    expect(mainIframe).not.toHaveAttribute("src", expect.stringContaining("episodeSelector="));
    expect(mainIframe).not.toHaveAttribute("src", expect.stringContaining("autoplayNextEpisode="));
    expect(mainIframe).not.toHaveAttribute("src", expect.stringContaining("overlay="));
    expect(screen.getByRole("link", { name: /الحلقة السابقة/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /الحلقة التالية/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(supabaseMocks.getEpisodeData).toHaveBeenCalledWith(1, 1);
      expect(supabaseMocks.scrapeAnime3rbEpisode).toHaveBeenCalledWith("Naruto", "Naruto", 1, 1, false);
    });
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

    const mainIframe = await screen.findByTitle("Naruto - Main Player");
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("https://player.videasy.net/movie/299534?color=00D0FF"));
    expect(mainIframe).toHaveAttribute("src", expect.stringContaining("autoplay=1"));
    expect(mainIframe).not.toHaveAttribute("src", expect.stringContaining("/anime/145139"));
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

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Backup Player" })).toHaveAttribute("data-state", "active");
      expect(document.querySelector("video")).toBeInTheDocument();
    });
  });

  it("keeps trailer pages on the existing youtube player without player tabs", async () => {
    trailerFallbackMocks.getTrailerYoutubeId.mockReturnValue("abc123");

    renderPage("/watch/1/trailer");

    expect(screen.queryByRole("tab", { name: "Main Player" })).not.toBeInTheDocument();
    expect(await screen.findByTitle("Naruto - Trailer")).toHaveAttribute(
      "src",
      expect.stringContaining("youtube.com/embed/abc123"),
    );
  });
});
