import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrailerBanner } from "@/components/TrailerBanner";

describe("TrailerBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts trailers from the beginning and relies on YouTube loop playback", () => {
    render(
      <TrailerBanner
        youtubeId="abc123xyz"
        posterUrl="https://image.tmdb.org/t/p/original/poster.jpg"
        title="Naruto"
      />,
    );

    const iframe = screen.getByTitle("Trailer abc123xyz");

    expect(iframe).toHaveAttribute("src", expect.stringContaining("/embed/abc123xyz?"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("youtube-nocookie.com"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("loop=1"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("playlist=abc123xyz"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("enablejsapi=1"));
    expect(iframe).not.toHaveAttribute("src", expect.stringContaining("start="));
  });

  it("falls back to the next trailer when the primary one never becomes ready", () => {
    render(
      <TrailerBanner
        youtubeId="primary123"
        fallbackYoutubeId="fallback456"
        posterUrl="https://image.tmdb.org/t/p/original/poster.jpg"
        title="Hunter x Hunter"
      />,
    );

    expect(screen.getByTitle("Trailer primary123")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByTitle("Trailer fallback456")).toBeInTheDocument();
  });
});
