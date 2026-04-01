import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import App from "./App";

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
