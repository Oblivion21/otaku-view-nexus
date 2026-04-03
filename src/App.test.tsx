import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter, Link, MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const siteAuthMocks = vi.hoisted(() => ({
  clearStoredSiteAccessToken: vi.fn(),
  getStoredSiteAccessToken: vi.fn(),
  storeSiteAccessToken: vi.fn(),
  unlockSite: vi.fn(),
  verifySiteAccess: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  isMaintenanceMode: vi.fn(),
}));

vi.mock("@/lib/site-auth", () => siteAuthMocks);
vi.mock("@/lib/supabase", () => supabaseMocks);

vi.mock("./pages/Index", () => ({ default: () => <div>Index Page</div> }));
vi.mock("./pages/Browse", () => ({ default: () => <div>Browse Page</div> }));
vi.mock("./pages/AnimeDetail", () => ({ default: () => <div>Anime Detail</div> }));
vi.mock("./pages/EpisodeWatch", () => ({ default: () => <div>Episode Watch</div> }));
vi.mock("./pages/SearchPage", () => ({ default: () => <div>Search Page</div> }));
vi.mock("./pages/VoiceActorDetail", () => ({ default: () => <div>Voice Actor Detail</div> }));
vi.mock("./pages/Schedule", () => ({ default: () => <div>Schedule Page</div> }));
vi.mock("./pages/Upcoming", () => ({ default: () => <div>Upcoming Page</div> }));
vi.mock("./pages/NotFound", () => ({ default: () => <div>Not Found</div> }));
vi.mock("./pages/Maintenance", () => ({ default: () => <div>Maintenance Page</div> }));

import App, { ScrollRestoration } from "./App";

function NavigationHome() {
  const navigate = useNavigate();

  return (
    <div>
      <div>Home Page</div>
      <Link to="/">Home Link</Link>
      <Link to="/browse">Browse Link</Link>
      <button type="button" onClick={() => navigate("/search?q=naruto")}>
        Programmatic Search
      </button>
    </div>
  );
}

function NavigationHarness() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NavigationHome />} />
        <Route path="/browse" element={<div>Browse Page</div>} />
        <Route path="/search" element={<div>Search Page</div>} />
      </Routes>
    </BrowserRouter>
  );
}

describe("App site gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.pushState({}, "", "/");

    siteAuthMocks.getStoredSiteAccessToken.mockReturnValue(null);
    siteAuthMocks.unlockSite.mockResolvedValue({ ok: false, error: "Incorrect password." });
    siteAuthMocks.verifySiteAccess.mockResolvedValue(false);
    supabaseMocks.isMaintenanceMode.mockResolvedValue(false);
  });

  it("renders the locked view when no session token exists", async () => {
    render(<App />);

    expect(await screen.findByText("Private Access")).toBeInTheDocument();
    expect(siteAuthMocks.verifySiteAccess).not.toHaveBeenCalled();
  });

  it("shows an error when the submitted password is invalid", async () => {
    render(<App />);

    const passwordInput = await screen.findByLabelText("Site password");
    fireEvent.change(passwordInput, { target: { value: "0801" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter Site" }));

    expect(siteAuthMocks.unlockSite).toHaveBeenCalledWith("0801");
    expect(await screen.findByText("Incorrect password.")).toBeInTheDocument();
    expect(siteAuthMocks.storeSiteAccessToken).not.toHaveBeenCalled();
  });

  it("stores the token and unlocks the app after a valid password", async () => {
    siteAuthMocks.unlockSite.mockResolvedValue({ ok: true, token: "signed-token" });

    render(<App />);

    const passwordInput = await screen.findByLabelText("Site password");
    fireEvent.change(passwordInput, { target: { value: "0801" } });
    fireEvent.click(screen.getByRole("button", { name: "Enter Site" }));

    await waitFor(() => {
      expect(siteAuthMocks.storeSiteAccessToken).toHaveBeenCalledWith("signed-token");
    });
    expect(await screen.findByText("Index Page")).toBeInTheDocument();
    expect(supabaseMocks.isMaintenanceMode).toHaveBeenCalled();
  });

  it("clears an invalid stored token and falls back to the locked view", async () => {
    siteAuthMocks.getStoredSiteAccessToken.mockReturnValue("fake-token");
    siteAuthMocks.verifySiteAccess.mockResolvedValue(false);

    render(<App />);

    await waitFor(() => {
      expect(siteAuthMocks.verifySiteAccess).toHaveBeenCalledWith("fake-token");
    });
    expect(siteAuthMocks.clearStoredSiteAccessToken).toHaveBeenCalled();
    expect(await screen.findByText("Private Access")).toBeInTheDocument();
  });
});

describe("App navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
  });

  it("navigates to same-origin links without a document reload", async () => {
    render(<NavigationHarness />);

    fireEvent.click(screen.getByRole("link", { name: "Browse Link" }));

    await waitFor(() => {
      expect(screen.getByText("Browse Page")).toBeInTheDocument();
    });
  });

  it("keeps programmatic route changes inside the SPA", async () => {
    render(<NavigationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Programmatic Search" }));

    await waitFor(() => {
      expect(screen.getByText("Search Page")).toBeInTheDocument();
    });
  });

  it("supports browser back navigation without forcing a reload", async () => {
    render(<NavigationHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Programmatic Search" }));

    await waitFor(() => {
      expect(screen.getByText("Search Page")).toBeInTheDocument();
    });

    await act(async () => {
      window.history.back();
    });

    await waitFor(() => {
      expect(screen.getByText("Home Page")).toBeInTheDocument();
    });
  });
});

describe("Scroll restoration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      writable: true,
      value: 0,
    });
    window.scrollTo = vi.fn();
  });

  it("restores the saved scroll position on initial load", () => {
    window.sessionStorage.setItem(
      "animezero:scroll-positions",
      JSON.stringify({
        "/browse": 420,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/browse"]}>
        <ScrollRestoration />
        <Routes>
          <Route path="/browse" element={<div>Browse Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 420, behavior: "auto" });
  });

  it("scrolls to the top on forward navigation and saves the previous route position", async () => {
    function ScrollHarness() {
      const navigate = useNavigate();

      return (
        <>
          <ScrollRestoration />
          <button type="button" onClick={() => navigate("/browse")}>
            Go Browse
          </button>
          <Routes>
            <Route path="/" element={<div>Home</div>} />
            <Route path="/browse" element={<div>Browse</div>} />
          </Routes>
        </>
      );
    }

    render(
      <MemoryRouter initialEntries={["/"]}>
        <ScrollHarness />
      </MemoryRouter>,
    );

    Object.defineProperty(window, "scrollY", {
      configurable: true,
      writable: true,
      value: 350,
    });

    fireEvent.click(screen.getByRole("button", { name: "Go Browse" }));

    await waitFor(() => {
      expect(screen.getByText("Browse")).toBeInTheDocument();
    });

    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "auto" });
    expect(JSON.parse(window.sessionStorage.getItem("animezero:scroll-positions") || "{}")).toEqual(
      expect.objectContaining({
        "/": 350,
      }),
    );
  });
});
