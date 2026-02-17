import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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

const App = () => {
  const [isMaintenance, setIsMaintenance] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkMaintenanceMode();
  }, []);

  async function checkMaintenanceMode() {
    const maintenanceEnabled = await isMaintenanceMode();
    setIsMaintenance(maintenanceEnabled);
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-white text-lg">Loading...</div>
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
