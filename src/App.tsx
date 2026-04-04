import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigationType } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { isMaintenanceMode } from "@/lib/supabase";
import {
  clearStoredSiteAccessToken,
  getStoredSiteAccessToken,
  storeSiteAccessToken,
  unlockSite,
  verifySiteAccess,
} from "@/lib/site-auth";
import Index from "./pages/Index";
const Browse = lazy(() => import("./pages/Browse"));
const AnimeDetail = lazy(() => import("./pages/AnimeDetail"));
const EpisodeWatch = lazy(() => import("./pages/EpisodeWatch"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const VoiceActorDetail = lazy(() => import("./pages/VoiceActorDetail"));
const Schedule = lazy(() => import("./pages/Schedule"));
const Upcoming = lazy(() => import("./pages/Upcoming"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Maintenance = lazy(() => import("./pages/Maintenance"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 2,
    },
  },
});
const SCROLL_STORAGE_KEY = "animezero:scroll-positions";

function PageRouteFallback() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container py-8 space-y-4">
        <div className="h-12 w-48 rounded-lg bg-muted/40 animate-pulse" />
        <div className="aspect-video w-full rounded-xl bg-muted/30 animate-pulse" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
          <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
          <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function getScrollStorage() {
  if (typeof window === "undefined") {
    return {} as Record<string, number>;
  }

  try {
    const stored = window.sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveScrollPosition(routeKey: string, scrollY: number) {
  if (typeof window === "undefined") return;

  const scrollPositions = getScrollStorage();
  scrollPositions[routeKey] = Math.max(0, Math.floor(scrollY));
  window.sessionStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(scrollPositions));
}

function getRouteScrollKey(location: ReturnType<typeof useLocation>) {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function ScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const routeKey = getRouteScrollKey(location);
  const isFirstRender = useRef(true);

  useEffect(() => {
    const previousValue = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previousValue;
    };
  }, []);

  useEffect(() => {
    const saveCurrentPosition = () => saveScrollPosition(routeKey, window.scrollY);

    window.addEventListener("pagehide", saveCurrentPosition);
    window.addEventListener("beforeunload", saveCurrentPosition);

    return () => {
      saveCurrentPosition();
      window.removeEventListener("pagehide", saveCurrentPosition);
      window.removeEventListener("beforeunload", saveCurrentPosition);
    };
  }, [routeKey]);

  useEffect(() => {
    const savedPosition = getScrollStorage()[routeKey];
    const shouldRestoreScroll = isFirstRender.current || navigationType === "POP";

    window.scrollTo({
      top: shouldRestoreScroll ? (savedPosition ?? 0) : 0,
      behavior: "auto",
    });

    isFirstRender.current = false;
  }, [navigationType, routeKey]);

  return null;
}

const App = () => {
  const initialStoredToken = typeof window !== "undefined" ? getStoredSiteAccessToken() : null;
  const [isUnlocked, setIsUnlocked] = useState(Boolean(initialStoredToken));
  const [authChecked, setAuthChecked] = useState(!initialStoredToken);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [loadingMaintenance, setLoadingMaintenance] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAccess() {
      const savedToken = getStoredSiteAccessToken();
      if (!savedToken) {
        if (isMounted) {
          setIsUnlocked(false);
          setAuthChecked(true);
        }
        return;
      }

      const isValid = await verifySiteAccess(savedToken);
      if (!isValid) {
        clearStoredSiteAccessToken();
      }

      if (isMounted) {
        setIsUnlocked(isValid);
        setAuthChecked(true);
      }
    }

    void checkAccess();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!authChecked || !isUnlocked) return;
    void checkMaintenanceMode();
  }, [authChecked, isUnlocked]);

  async function checkMaintenanceMode() {
    setLoadingMaintenance(true);
    const maintenanceEnabled = await isMaintenanceMode();
    setIsMaintenance(maintenanceEnabled);
    setLoadingMaintenance(false);
  }

  async function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingPassword(true);
    setPasswordError("");

    const result = await unlockSite(password);
    if (!result.ok || !result.token) {
      setPasswordError(result.error || "Incorrect password.");
      setIsSubmittingPassword(false);
      return;
    }

    storeSiteAccessToken(result.token);
    setPassword("");
    setIsUnlocked(true);
    setIsSubmittingPassword(false);
  }

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.2),_transparent_45%),linear-gradient(180deg,_hsl(222_47%_6%),_hsl(222_47%_4%))] px-4 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center justify-center" dir="ltr">
          <Card className="w-full border-white/10 bg-slate-950/80 backdrop-blur">
            <CardHeader className="space-y-3 text-center">
              <CardTitle className="text-white">Private Access</CardTitle>
              <CardDescription className="text-slate-300">
                This site is currently locked. Enter the password to continue.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleUnlock}>
                <Input
                  autoFocus
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) setPasswordError("");
                  }}
                  disabled={isSubmittingPassword}
                  placeholder="Enter password"
                  aria-label="Site password"
                  className="border-white/10 bg-slate-900/80 text-white placeholder:text-slate-500"
                />
                {passwordError ? <p className="text-sm text-red-400">{passwordError}</p> : null}
                <Button type="submit" className="w-full" disabled={isSubmittingPassword}>
                  {isSubmittingPassword ? "Checking..." : "Enter Site"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (authChecked && !loadingMaintenance && isMaintenance) {
    return (
      <Suspense fallback={<PageRouteFallback />}>
        <Maintenance />
      </Suspense>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollRestoration />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/browse" element={<Suspense fallback={<PageRouteFallback />}><Browse /></Suspense>} />
            <Route path="/anime/:id" element={<Suspense fallback={<PageRouteFallback />}><AnimeDetail /></Suspense>} />
            <Route path="/watch/:id/:episode" element={<Suspense fallback={<PageRouteFallback />}><EpisodeWatch /></Suspense>} />
            <Route path="/search" element={<Suspense fallback={<PageRouteFallback />}><SearchPage /></Suspense>} />
            <Route path="/person/:id" element={<Suspense fallback={<PageRouteFallback />}><VoiceActorDetail /></Suspense>} />
            <Route path="/schedule" element={<Suspense fallback={<PageRouteFallback />}><Schedule /></Suspense>} />
            <Route path="/upcoming" element={<Suspense fallback={<PageRouteFallback />}><Upcoming /></Suspense>} />
            <Route path="*" element={<Suspense fallback={<PageRouteFallback />}><NotFound /></Suspense>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
