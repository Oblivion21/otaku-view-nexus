import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrailerBanner } from "@/components/TrailerBanner";

describe("TrailerBanner", () => {
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
    expect(iframe).toHaveAttribute("src", expect.stringContaining("loop=1"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("playlist=abc123xyz"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("enablejsapi=1"));
    expect(iframe).not.toHaveAttribute("src", expect.stringContaining("start="));
  });
});
