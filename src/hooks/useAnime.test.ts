import { describe, expect, it, vi, beforeEach } from "vitest";
import { useQuery } from "@tanstack/react-query";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((options) => options),
}));

import { useSearchAnime } from "./useAnime";

describe("useSearchAnime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the normalized filters object in the query key", () => {
    useSearchAnime({
      query: " Naruto ",
      page: 2,
      genreId: 1,
      yearFrom: 2015,
      orderBy: "score",
      sort: "desc",
    });

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: [
          "search-anime",
          {
            query: "Naruto",
            page: 2,
            genreId: 1,
            yearFrom: 2015,
            orderBy: "score",
            sort: "desc",
          },
        ],
      }),
    );
  });

  it("disables the query when there is no query and no active filters", () => {
    useSearchAnime({ page: 1 });

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it("enables the query for filter-only searches", () => {
    useSearchAnime({
      page: 1,
      yearFrom: 2010,
    });

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
      }),
    );
  });
});
