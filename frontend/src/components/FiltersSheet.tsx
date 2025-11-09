import { useMemo } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCoursesStore } from "@/store/courses";
import { Filter } from "lucide-react";
import type { FiltersState } from "@/lib/types";

const toggleItem = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

const toggleNumber = (list: number[], value: number): number[] =>
  list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

export const FiltersSheet = () => {
  const { courseList, filters, setFilters, resetFilters, visibleCourses } = useCoursesStore(
    (state) => ({
      courseList: state.courseList,
      filters: state.filters,
      setFilters: state.setFilters,
      resetFilters: state.resetFilters,
      visibleCourses: state.visibleCourses,
    }),
  );

  const { prefixes, sbcTokens, seasons, years } = useMemo(() => {
    const prefixSet = new Set<string>();
    const sbcSet = new Set<string>();
    const seasonSet = new Set<string>();
    const yearSet = new Set<number>();
    for (const course of courseList) {
      prefixSet.add(course.courseCode.split(" ")[0]);
      course.sbc
        .filter((token) => token.length <= 10)
        .forEach((token) => sbcSet.add(token));
      course.seasons.forEach((season) => seasonSet.add(season));
      course.years.forEach((year) => yearSet.add(year));
    }
    return {
      prefixes: Array.from(prefixSet).sort(),
      sbcTokens: Array.from(sbcSet).sort(),
      seasons: Array.from(seasonSet).sort(),
      years: Array.from(yearSet).sort((a, b) => b - a),
    };
  }, [courseList]);

  const updateFilters = (updater: (filters: FiltersState) => FiltersState) => {
    setFilters((prev) => updater({ ...prev }));
  };

  const appliedCount =
    (filters.prefixes.length > 0 ? 1 : 0) +
    (filters.sbc.length > 0 ? 1 : 0) +
    (filters.seasons.length > 0 ? 1 : 0) +
    (filters.years.length > 0 ? 1 : 0) +
    (filters.includeLowCredit ? 1 : 0);

  return (
    <Sheet title="Filters" description={`Narrow down ${visibleCourses.length} courses`}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
          {appliedCount > 0 ? <Badge variant="default">{appliedCount}</Badge> : null}
        </Button>
      </SheetTrigger>
      <SheetContent title="Refine Courses" description="Combine filters to narrow down results">
        <div className="flex flex-col gap-6">
          <section>
            <header className="mb-2 text-sm font-semibold text-foreground/80">
              Course Prefix
            </header>
            <div className="flex flex-wrap gap-2">
              {prefixes.map((prefix) => (
                <button
                  key={prefix}
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide transition ${
                    filters.prefixes.includes(prefix)
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-border/40 text-foreground/60 hover:border-accent/60 hover:text-accent"
                  }`}
                  onClick={() =>
                    updateFilters((state) => ({
                      ...state,
                      prefixes: toggleItem(state.prefixes, prefix),
                    }))
                  }
                >
                  {prefix}
                </button>
              ))}
            </div>
          </section>
          <section>
            <header className="mb-2 text-sm font-semibold text-foreground/80">SBC Tags</header>
            <div className="flex flex-wrap gap-2">
              {sbcTokens.map((token) => (
                <button
                  key={token}
                  className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide transition ${
                    filters.sbc.includes(token)
                      ? "border-accent bg-accent/20 text-accent"
                      : "border-border/40 text-foreground/60 hover:border-accent/60 hover:text-accent"
                  }`}
                  onClick={() =>
                    updateFilters((state) => ({
                      ...state,
                      sbc: toggleItem(state.sbc, token),
                    }))
                  }
                >
                  {token}
                </button>
              ))}
            </div>
          </section>
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/40 bg-muted/30 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-foreground/80">
                  Include 1–2 credit courses
                </div>
                <p className="text-xs text-foreground/50">
                  Off by default to prioritize standard lecture courses.
                </p>
              </div>
              <Button
                variant={filters.includeLowCredit ? "primary" : "outline"}
                size="sm"
                onClick={() =>
                  updateFilters((state) => ({
                    ...state,
                    includeLowCredit: !state.includeLowCredit,
                  }))
                }
              >
                {filters.includeLowCredit ? "Included" : "Not included"}
              </Button>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-4">
            <div>
              <header className="mb-2 text-sm font-semibold text-foreground/80">Seasons</header>
              <div className="flex flex-wrap gap-2">
                {seasons.map((season) => (
                  <button
                    key={season}
                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide transition ${
                      filters.seasons.includes(season)
                        ? "border-accent bg-accent/20 text-accent"
                        : "border-border/40 text-foreground/60 hover:border-accent/60 hover:text-accent"
                    }`}
                    onClick={() =>
                      updateFilters((state) => ({
                        ...state,
                        seasons: toggleItem(state.seasons, season),
                      }))
                    }
                  >
                    {season}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <header className="mb-2 text-sm font-semibold text-foreground/80">Years</header>
              <div className="flex flex-wrap gap-2">
                {years.map((year) => (
                  <button
                    key={year}
                    className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide transition ${
                      filters.years.includes(year)
                        ? "border-accent bg-accent/20 text-accent"
                        : "border-border/40 text-foreground/60 hover:border-accent/60 hover:text-accent"
                    }`}
                    onClick={() =>
                      updateFilters((state) => ({
                        ...state,
                        years: toggleNumber(state.years, year),
                      }))
                    }
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <div className="flex justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => resetFilters()}>
              Reset
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                const filtered = visibleCourses.length;
                alert(`${filtered} courses currently match your filters.`);
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

