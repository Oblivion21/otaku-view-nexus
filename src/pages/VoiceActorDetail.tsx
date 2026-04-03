import { useParams, Link } from "react-router-dom";
import { ChevronLeft, Star } from "lucide-react";
import Layout from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMultipleAnimeTmdbArtwork, usePersonById, usePersonVoices } from "@/hooks/useAnime";
import { resolveTitleArtworkUrl } from "@/lib/titleArtwork";

export default function VoiceActorDetail() {
  const { id } = useParams<{ id: string }>();
  const personId = Number(id);

  const { data: personData, isLoading: loadingPerson } = usePersonById(personId);
  const { data: voicesData, isLoading: loadingVoices } = usePersonVoices(personId);

  if (loadingPerson) {
    return (
      <Layout>
        <div className="container py-8 space-y-4">
          <Skeleton className="w-full h-[300px] rounded-lg" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-full" />
        </div>
      </Layout>
    );
  }

  const person = personData?.data;
  if (!person) {
    return (
      <Layout>
        <div className="container py-16 text-center">لم يتم العثور على الممثل الصوتي</div>
      </Layout>
    );
  }

  const voices = voicesData?.data || [];
  const voiceAnimeArtworkLookup = voices.map((voice) => ({
    mal_id: voice.anime.mal_id,
    title: voice.anime.title,
    title_english: null,
    title_japanese: voice.anime.title,
    type: null,
    year: null,
    aired: null,
  }));
  const {
    data: voiceAnimeArtworkMap,
    isLoading: loadingVoiceAnimeArtwork,
  } = useMultipleAnimeTmdbArtwork(voiceAnimeArtworkLookup, voices.length > 0);

  return (
    <Layout>
      {/* Header Banner */}
      <div className="relative h-[200px] md:h-[300px] overflow-hidden bg-gradient-to-b from-primary/10 to-background">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
      </div>

      <div className="container -mt-24 relative z-10 pb-8">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Profile Image */}
          <img
            src={person.images.jpg.image_url}
            alt={person.name}
            className="w-40 h-40 md:w-48 md:h-48 rounded-full object-cover shadow-xl border-4 border-background shrink-0"
          />

          {/* Info */}
          <div className="space-y-3 flex-1">
            <h1 className="text-2xl md:text-3xl font-extrabold">{person.name}</h1>

            {(person.given_name || person.family_name) && (
              <p className="text-lg text-muted-foreground">
                {person.family_name} {person.given_name}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {person.birthday && (
                <div className="text-muted-foreground">
                  تاريخ الميلاد: {new Date(person.birthday).toLocaleDateString('ar-EG')}
                </div>
              )}
              {person.favorites !== null && (
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4 fill-anime-gold text-anime-gold" />
                  <span className="font-bold">{person.favorites.toLocaleString()}</span>
                  <span className="text-muted-foreground text-xs">معجب</span>
                </div>
              )}
            </div>

            {person.about && (
              <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl line-clamp-4">
                {person.about}
              </p>
            )}
          </div>
        </div>

        {/* Voice Acting Roles */}
        <div className="mt-12 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-bold">أدوار التمثيل الصوتي</h2>
            <Badge variant="secondary">{voices.length} دور</Badge>
          </div>

          {loadingVoices ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : voices.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {voices.map((voice, idx) => (
                <Link
                  key={`${voice.anime.mal_id}-${voice.character.mal_id}-${idx}`}
                  to={`/anime/${voice.anime.mal_id}`}
                  className="flex items-center gap-0 rounded-lg bg-card border border-border overflow-hidden hover:border-primary/40 transition-colors"
                >
                  {/* Anime side */}
                  <div className="flex items-center gap-3 flex-1 p-3 min-w-0">
                    {loadingVoiceAnimeArtwork ? (
                      <Skeleton className="w-16 h-20 rounded shrink-0" />
                    ) : (
                      <img
                        src={resolveTitleArtworkUrl(
                          voiceAnimeArtworkMap?.get(voice.anime.mal_id),
                          voice.anime,
                          "poster",
                        ) || ""}
                        alt={voice.anime.title}
                        className="w-16 h-20 rounded object-cover shrink-0"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold line-clamp-2 mb-1">{voice.anime.title}</p>
                      <Badge variant={voice.role === "Main" ? "default" : "secondary"} className="text-[10px]">
                        {voice.role === "Main" ? "رئيسي" : "ثانوي"}
                      </Badge>
                    </div>
                  </div>

                  {/* Character side */}
                  <div className="flex items-center gap-2 p-3 border-r border-border">
                    <div className="text-left min-w-0">
                      <p className="text-xs text-muted-foreground line-clamp-1">{voice.character.name}</p>
                    </div>
                    <img
                      src={voice.character.images.webp?.image_url || voice.character.images.jpg.image_url}
                      alt={voice.character.name}
                      className="w-12 h-12 rounded object-cover shrink-0"
                      loading="lazy"
                    />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              لا توجد أدوار متاحة
            </div>
          )}
        </div>

        {/* Breadcrumb at bottom */}
        <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/" className="hover:text-foreground">الرئيسية</Link>
          <ChevronLeft className="h-3 w-3" />
          <span className="text-foreground">ممثل صوتي</span>
        </div>
      </div>
    </Layout>
  );
}
