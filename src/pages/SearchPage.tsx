import { useEffect, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import Layout from "@/components/Layout";
import AnimeGrid from "@/components/AnimeGrid";
import { useGenres, useMultipleAnimeTmdbArtwork, useSearchAnime } from "@/hooks/useAnime";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { dedupeAnimeList } from "@/lib/listDeduping";
import {
  GENRE_AR,
  hasAnimeSearchCriteria,
  normalizeAnimeSearchFilters,
  type AnimeSearchFilters,
  type AnimeSearchOrderBy,
  type AnimeSearchSort,
  type AnimeSearchStatus,
  type AnimeSearchType,
} from "@/lib/jikan";
import { hasAnyTitleArtwork } from "@/lib/titleArtwork";

const TYPE_OPTIONS: Array<{ value: AnimeSearchType; label: string }> = [
  { value: "tv", label: "مسلسل" },
  { value: "movie", label: "فيلم" },
  { value: "ova", label: "أوفا" },
  { value: "special", label: "خاص" },
  { value: "ona", label: "أونا" },
  { value: "music", label: "موسيقى" },
];

const STATUS_OPTIONS: Array<{ value: AnimeSearchStatus; label: string }> = [
  { value: "airing", label: "يعرض حالياً" },
  { value: "complete", label: "مكتمل" },
  { value: "upcoming", label: "قادم قريباً" },
];

const ORDER_BY_OPTIONS: Array<{ value: AnimeSearchOrderBy; label: string }> = [
  { value: "popularity", label: "الشعبية" },
  { value: "score", label: "التقييم" },
  { value: "start_date", label: "تاريخ الإصدار" },
];

const SORT_OPTIONS: Array<{ value: AnimeSearchSort; label: string }> = [
  { value: "desc", label: "تنازلي" },
  { value: "asc", label: "تصاعدي" },
];

function parsePageParam(value: string | null) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function parseIntegerParam(value: string | null) {
  if (value === null || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseSearchFilters(searchParams: URLSearchParams): AnimeSearchFilters {
  return normalizeAnimeSearchFilters({
    query: searchParams.get("q") || undefined,
    page: parsePageParam(searchParams.get("page")),
    type: (searchParams.get("type") || undefined) as AnimeSearchType | undefined,
    status: (searchParams.get("status") || undefined) as AnimeSearchStatus | undefined,
    genreId: parseIntegerParam(searchParams.get("genre")),
    yearFrom: parseIntegerParam(searchParams.get("yearFrom")),
    yearTo: parseIntegerParam(searchParams.get("yearTo")),
    minScore: parseIntegerParam(searchParams.get("minScore")),
    maxScore: parseIntegerParam(searchParams.get("maxScore")),
    orderBy: (searchParams.get("orderBy") || undefined) as AnimeSearchOrderBy | undefined,
    sort: (searchParams.get("sort") || undefined) as AnimeSearchSort | undefined,
  });
}

function activeFilterCount(filters: AnimeSearchFilters) {
  return Object.entries(filters).filter(([key, value]) => key !== "page" && key !== "query" && value !== undefined).length;
}

function ScoreRangeSlider({
  minScore,
  maxScore,
  onCommit,
}: {
  minScore?: number;
  maxScore?: number;
  onCommit: (nextRange: [number, number]) => void;
}) {
  const [value, setValue] = useState<[number, number]>([minScore ?? 0, maxScore ?? 10]);

  useEffect(() => {
    setValue([minScore ?? 0, maxScore ?? 10]);
  }, [minScore, maxScore]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{value[0]}</span>
        <span>التقييم</span>
        <span>{value[1]}</span>
      </div>
      <Slider
        min={0}
        max={10}
        step={1}
        value={value}
        onValueChange={(nextValue) => setValue([nextValue[0] ?? 0, nextValue[1] ?? 10])}
        onValueCommit={(nextValue) => onCommit([nextValue[0] ?? 0, nextValue[1] ?? 10])}
      />
    </div>
  );
}

function FilterSelect({
  value,
  placeholder,
  allLabel,
  options,
  onChange,
}: {
  value?: string;
  placeholder: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  onChange: (nextValue?: string) => void;
}) {
  return (
    <Select value={value ?? "all"} onValueChange={(nextValue) => onChange(nextValue === "all" ? undefined : nextValue)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type SharedFiltersProps = {
  filters: AnimeSearchFilters;
  yearFromInput: string;
  yearToInput: string;
  setYearFromInput: (value: string) => void;
  setYearToInput: (value: string) => void;
  onFilterChange: (key: string, value?: string | number) => void;
  onReset: () => void;
  genreOptions: Array<{ value: string; label: string }>;
};

function SharedFilters({
  filters,
  yearFromInput,
  yearToInput,
  setYearFromInput,
  setYearToInput,
  onFilterChange,
  onReset,
  genreOptions,
}: SharedFiltersProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">النوع</p>
          <FilterSelect
            value={filters.type}
            placeholder="اختر النوع"
            allLabel="كل الأنواع"
            options={TYPE_OPTIONS}
            onChange={(value) => onFilterChange("type", value)}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">الحالة</p>
          <FilterSelect
            value={filters.status}
            placeholder="اختر الحالة"
            allLabel="كل الحالات"
            options={STATUS_OPTIONS}
            onChange={(value) => onFilterChange("status", value)}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">التصنيف</p>
          <FilterSelect
            value={filters.genreId ? String(filters.genreId) : undefined}
            placeholder="اختر التصنيف"
            allLabel="كل التصنيفات"
            options={genreOptions}
            onChange={(value) => onFilterChange("genre", value ? Number(value) : undefined)}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">سنة الإصدار من</p>
          <Input
            inputMode="numeric"
            placeholder="مثال: 2010"
            value={yearFromInput}
            onChange={(event) => setYearFromInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">سنة الإصدار إلى</p>
          <Input
            inputMode="numeric"
            placeholder="مثال: 2024"
            value={yearToInput}
            onChange={(event) => setYearToInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">الترتيب حسب</p>
          <FilterSelect
            value={filters.orderBy}
            placeholder="اختر طريقة الترتيب"
            allLabel="الافتراضي"
            options={ORDER_BY_OPTIONS}
            onChange={(value) => onFilterChange("orderBy", value)}
          />
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">اتجاه الترتيب</p>
          <FilterSelect
            value={filters.sort}
            placeholder="اختر الاتجاه"
            allLabel="الافتراضي"
            options={SORT_OPTIONS}
            onChange={(value) => onFilterChange("sort", value)}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-secondary/30 p-4">
        <p className="text-xs text-muted-foreground">نطاق التقييم</p>
        <ScoreRangeSlider
          minScore={filters.minScore}
          maxScore={filters.maxScore}
          onCommit={([nextMinScore, nextMaxScore]) => {
            onFilterChange("minScore", nextMinScore);
            onFilterChange("maxScore", nextMaxScore);
          }}
        />
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" onClick={onReset}>
          إعادة ضبط الفلاتر
        </Button>
      </div>
    </div>
  );
}

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = parseSearchFilters(searchParams);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [queryInput, setQueryInput] = useState(filters.query ?? "");
  const [yearFromInput, setYearFromInput] = useState(filters.yearFrom ? String(filters.yearFrom) : "");
  const [yearToInput, setYearToInput] = useState(filters.yearTo ? String(filters.yearTo) : "");
  const { data: genres } = useGenres();

  useEffect(() => {
    setQueryInput(filters.query ?? "");
  }, [filters.query]);

  useEffect(() => {
    setYearFromInput(filters.yearFrom ? String(filters.yearFrom) : "");
  }, [filters.yearFrom]);

  useEffect(() => {
    setYearToInput(filters.yearTo ? String(filters.yearTo) : "");
  }, [filters.yearTo]);

  useEffect(() => {
    const nextQuery = queryInput.trim();
    if (nextQuery === (filters.query ?? "")) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams);

      if (nextQuery) {
        nextParams.set("q", nextQuery);
      } else {
        nextParams.delete("q");
      }

      nextParams.delete("page");
      setSearchParams(nextParams);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [filters.query, queryInput, searchParams, setSearchParams]);

  useEffect(() => {
    if (yearFromInput !== "" && yearFromInput.length < 4) {
      return undefined;
    }

    const nextValue = yearFromInput.trim();
    const currentValue = filters.yearFrom ? String(filters.yearFrom) : "";
    if (nextValue === currentValue) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams);
      if (nextValue) {
        nextParams.set("yearFrom", nextValue);
      } else {
        nextParams.delete("yearFrom");
      }
      nextParams.delete("page");
      setSearchParams(nextParams);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [filters.yearFrom, searchParams, setSearchParams, yearFromInput]);

  useEffect(() => {
    if (yearToInput !== "" && yearToInput.length < 4) {
      return undefined;
    }

    const nextValue = yearToInput.trim();
    const currentValue = filters.yearTo ? String(filters.yearTo) : "";
    if (nextValue === currentValue) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams);
      if (nextValue) {
        nextParams.set("yearTo", nextValue);
      } else {
        nextParams.delete("yearTo");
      }
      nextParams.delete("page");
      setSearchParams(nextParams);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [filters.yearTo, searchParams, setSearchParams, yearToInput]);

  function updateSearchParams(updates: Record<string, string | number | undefined>) {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (value === undefined || value === "") {
        nextParams.delete(key);
      } else {
        nextParams.set(key, String(value));
      }
    });

    nextParams.delete("page");
    setSearchParams(nextParams);
  }

  function updatePage(nextPage: number) {
    const nextParams = new URLSearchParams(searchParams);

    if (nextPage <= 1) {
      nextParams.delete("page");
    } else {
      nextParams.set("page", String(nextPage));
    }

    setSearchParams(nextParams);
  }

  function handleFilterChange(key: string, value?: string | number) {
    updateSearchParams({ [key]: value });
  }

  function resetFilters() {
    const nextParams = new URLSearchParams();
    const query = queryInput.trim();

    if (query) {
      nextParams.set("q", query);
    }

    setSearchParams(nextParams);
    setMobileFiltersOpen(false);
  }

  const hasNonQueryFilters = hasAnimeSearchCriteria({
    ...filters,
    query: undefined,
  });
  const shouldShowIdlePrompt = !filters.query && !hasNonQueryFilters;
  const shouldShowQueryLengthPrompt = Boolean(filters.query) && (filters.query?.length ?? 0) < 2 && !hasNonQueryFilters;

  const { data, isLoading } = useSearchAnime(filters);
  const dedupedAnime = dedupeAnimeList(data?.data);
  const { data: artworkMap, isLoading: loadingArtworkMap } = useMultipleAnimeTmdbArtwork(
    dedupedAnime,
    !shouldShowIdlePrompt,
  );
  const visibleAnime = dedupedAnime.filter((anime) => hasAnyTitleArtwork(anime, artworkMap?.get(anime.mal_id)));
  const isResolvingArtwork = !shouldShowIdlePrompt && dedupedAnime.length > 0 && loadingArtworkMap;
  const genreOptions = (genres?.data || []).map((genre) => ({
    value: String(genre.mal_id),
    label: GENRE_AR[genre.name] || genre.name,
  }));
  const resultHeading = filters.query
    ? `نتائج البحث: ${filters.query}`
    : "نتائج البحث المتقدم";

  return (
    <Layout>
      <div className="container py-8 space-y-6">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-xl font-bold">{resultHeading}</h1>
              <p className="text-sm text-muted-foreground">
                {activeFilterCount(filters) > 0 ? `${activeFilterCount(filters)} فلتر نشط` : "ابحث بالاسم أو خصص النتائج بالفلاتر"}
              </p>
            </div>

            <div className="flex items-center gap-2 lg:min-w-[420px]">
              <div className="relative flex-1">
                <Input
                  placeholder="ابحث عن أنمي..."
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  className="pl-10"
                />
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>

              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="lg:hidden">
                    <SlidersHorizontal className="h-4 w-4" />
                    الفلاتر
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[90vw] sm:max-w-lg">
                  <SheetHeader>
                    <SheetTitle>فلاتر البحث</SheetTitle>
                    <SheetDescription>خصص النتائج حسب النوع والتاريخ والتقييم.</SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <SharedFilters
                      filters={filters}
                      yearFromInput={yearFromInput}
                      yearToInput={yearToInput}
                      setYearFromInput={setYearFromInput}
                      setYearToInput={setYearToInput}
                      onFilterChange={handleFilterChange}
                      onReset={resetFilters}
                      genreOptions={genreOptions}
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="hidden rounded-xl border border-border bg-card p-4 lg:block">
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">النوع</p>
                <FilterSelect
                  value={filters.type}
                  placeholder="اختر النوع"
                  allLabel="كل الأنواع"
                  options={TYPE_OPTIONS}
                  onChange={(value) => handleFilterChange("type", value)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">الحالة</p>
                <FilterSelect
                  value={filters.status}
                  placeholder="اختر الحالة"
                  allLabel="كل الحالات"
                  options={STATUS_OPTIONS}
                  onChange={(value) => handleFilterChange("status", value)}
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">التصنيف</p>
                <FilterSelect
                  value={filters.genreId ? String(filters.genreId) : undefined}
                  placeholder="اختر التصنيف"
                  allLabel="كل التصنيفات"
                  options={genreOptions}
                  onChange={(value) => handleFilterChange("genre", value ? Number(value) : undefined)}
                />
              </div>
              <div className="flex items-end justify-end">
                <Button variant="ghost" onClick={resetFilters}>
                  إعادة ضبط الفلاتر
                </Button>
              </div>
            </div>

            <Accordion type="single" collapsible className="mt-4">
              <AccordionItem value="advanced-filters">
                <AccordionTrigger>فلاتر متقدمة</AccordionTrigger>
                <AccordionContent>
                  <SharedFilters
                    filters={filters}
                    yearFromInput={yearFromInput}
                    yearToInput={yearToInput}
                    setYearFromInput={setYearFromInput}
                    setYearToInput={setYearToInput}
                    onFilterChange={handleFilterChange}
                    onReset={resetFilters}
                    genreOptions={genreOptions}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>

        {shouldShowIdlePrompt ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
            أدخل اسم الأنمي أو استخدم الفلاتر لبدء البحث.
          </div>
        ) : shouldShowQueryLengthPrompt ? (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-muted-foreground">
            أدخل كلمتين على الأقل أو فعّل فلتر واحد على الأقل.
          </div>
        ) : (
          <>
            <AnimeGrid
              title={isLoading || isResolvingArtwork ? "جارٍ البحث..." : `${visibleAnime.length} نتيجة`}
              anime={visibleAnime}
              isLoading={isLoading || isResolvingArtwork}
              artworkMap={artworkMap}
            />
            <div className="flex justify-center gap-3">
              <Button variant="outline" disabled={(filters.page ?? 1) <= 1} onClick={() => updatePage((filters.page ?? 1) - 1)}>
                السابق
              </Button>
              <span className="flex items-center text-sm text-muted-foreground">صفحة {filters.page ?? 1}</span>
              <Button
                variant="outline"
                disabled={!data?.pagination?.has_next_page}
                onClick={() => updatePage((filters.page ?? 1) + 1)}
              >
                التالي
              </Button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
