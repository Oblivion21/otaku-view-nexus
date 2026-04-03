import { useState } from "react";
import Layout from "@/components/Layout";
import AnimeCard from "@/components/AnimeCard";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "lucide-react";
import { useMultipleAnimeTmdbArtwork } from "@/hooks/useAnime";
import { dedupeAnimeList } from "@/lib/listDeduping";
import { hasAnyTitleArtwork, resolveTitleArtworkUrl } from "@/lib/titleArtwork";

const DAYS = [
  { name: "الإثنين", value: "monday", en: "Monday" },
  { name: "الثلاثاء", value: "tuesday", en: "Tuesday" },
  { name: "الأربعاء", value: "wednesday", en: "Wednesday" },
  { name: "الخميس", value: "thursday", en: "Thursday" },
  { name: "الجمعة", value: "friday", en: "Friday" },
  { name: "السبت", value: "saturday", en: "Saturday" },
  { name: "الأحد", value: "sunday", en: "Sunday" },
];

async function fetchSchedule(day: string) {
  const response = await fetch(`https://api.jikan.moe/v4/schedules?filter=${day}`);
  if (!response.ok) throw new Error("Failed to fetch schedule");
  return response.json();
}

export default function Schedule() {
  const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay() - 1] || DAYS[0]);

  const { data, isLoading } = useQuery({
    queryKey: ["schedule", selectedDay.value],
    queryFn: () => fetchSchedule(selectedDay.value),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  const scheduledAnime = dedupeAnimeList(data?.data);
  const { data: artworkMap, isLoading: loadingArtworkMap } = useMultipleAnimeTmdbArtwork(scheduledAnime);
  const visibleScheduledAnime = scheduledAnime.filter((anime: any) => hasAnyTitleArtwork(anime, artworkMap?.get(anime.mal_id)));
  const isResolvingArtwork = scheduledAnime.length > 0 && loadingArtworkMap;

  return (
    <Layout>
      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Calendar className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-extrabold">جدول المواعيد الأسبوعي</h1>
          </div>
          <p className="text-muted-foreground">
            تعرف على مواعيد عرض الحلقات الجديدة خلال الأسبوع
          </p>
        </div>

        {/* Day Selector */}
        <div className="mb-8 flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button
              key={day.value}
              onClick={() => setSelectedDay(day)}
              className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                selectedDay.value === day.value
                  ? "bg-primary text-primary-foreground shadow-lg"
                  : "bg-card border border-border hover:border-primary/50"
              }`}
            >
              {day.name}
            </button>
          ))}
        </div>

        {/* Anime List */}
        {isLoading || isResolvingArtwork ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[2/3] rounded-lg" />
            ))}
          </div>
        ) : visibleScheduledAnime.length > 0 ? (
          <>
            <div className="mb-4 text-sm text-muted-foreground">
              {visibleScheduledAnime.length} أنمي يُعرض يوم {selectedDay.name}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {visibleScheduledAnime.map((anime: any) => (
                <AnimeCard
                  key={anime.mal_id}
                  anime={anime}
                  artworkUrl={resolveTitleArtworkUrl(artworkMap?.get(anime.mal_id), anime, "poster")}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">
              لا توجد حلقات جديدة مجدولة ليوم {selectedDay.name}
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
