import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { isMaintenanceMode } from "@/lib/supabase";
import Index from "./pages/Index";
import Browse from "./pages/Browse";
import AnimeDetail from "./pages/AnimeDetail";
import EpisodeWatch from "./pages/EpisodeWatch";
import SearchPage from "./pages/SearchPage";
import VoiceActorDetail from "./pages/VoiceActorDetail";
import Schedule from "./pages/Schedule";
import Upcoming from "./pages/Upcoming";
import NotFound from "./pages/NotFound";
import Maintenance from "./pages/Maintenance";

const queryClient = new QueryClient();
const SITE_PASSWORD = "0";
const SITE_UNLOCK_STORAGE_KEY = "otaku-view-nexus-unlocked";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

const App = () => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedUnlockState = window.sessionStorage.getItem(SITE_UNLOCK_STORAGE_KEY) === "true";
    setIsUnlocked(savedUnlockState);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    if (!authChecked || !isUnlocked) return;
    void checkMaintenanceMode();
  }, [authChecked, isUnlocked]);

  async function checkMaintenanceMode() {
    setLoading(true);
    const maintenanceEnabled = await isMaintenanceMode();
    setIsMaintenance(maintenanceEnabled);
    setLoading(false);
  }

  function handleUnlock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== SITE_PASSWORD) {
      setPasswordError("Incorrect password.");
      return;
    }

    window.sessionStorage.setItem(SITE_UNLOCK_STORAGE_KEY, "true");
    setPassword("");
    setPasswordError("");
    setIsUnlocked(true);
  }

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
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
                  maxLength={1}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (passwordError) setPasswordError("");
                  }}
                  placeholder="Enter password"
                  aria-label="Site password"
                  className="border-white/10 bg-slate-900/80 text-white placeholder:text-slate-500"
                />
                {passwordError ? <p className="text-sm text-red-400">{passwordError}</p> : null}
                <Button type="submit" className="w-full">
                  Enter Site
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (isMaintenance) {
    return <Maintenance />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/browse" element={<Browse />} />
            <Route path="/anime/:id" element={<AnimeDetail />} />
            <Route path="/watch/:id/:episode" element={<EpisodeWatch />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/person/:id" element={<VoiceActorDetail />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/upcoming" element={<Upcoming />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
