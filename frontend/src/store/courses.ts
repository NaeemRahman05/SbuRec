import { create } from "zustand";
import { persist } from "zustand/middleware";
import { aggregateCourses } from "@/lib/compute";
import { DEFAULT_FILTERS, filterCourses, sortCourses } from "@/lib/filters";
import type {
  CourseAggregate,
  CourseRow,
  FiltersState,
  SortMode,
} from "@/lib/types";

interface CoursesState {
  rows: CourseRow[];
  aggregates: Record<string, CourseAggregate>;
  courseList: CourseAggregate[];
  visibleCourses: CourseAggregate[];
  filters: FiltersState;
  sort: SortMode;
  search: string;
  globalAmean: number;
  loadRows: (rows: CourseRow[]) => void;
  setFilters: (updater: (filters: FiltersState) => FiltersState) => void;
  setSort: (sort: SortMode) => void;
  setSearch: (search: string) => void;
  resetFilters: () => void;
}

export const useCoursesStore = create<CoursesState>()(
  persist(
    (set, get) => ({
      rows: [],
      aggregates: {},
      courseList: [],
      visibleCourses: [],
      filters: DEFAULT_FILTERS,
      sort: "ease",
      search: "",
      globalAmean: 0,
      loadRows: (rows) => {
        const { courses, courseList, globalAmean } = aggregateCourses(rows);
        const filters = get().filters;
        const search = get().search;
        const sortMode = get().sort;
        const filtered = filterCourses(courseList, filters, search);
        const sorted = sortCourses(filtered, search ? "ease" : sortMode);
        set({
          rows,
          aggregates: courses,
          courseList,
          visibleCourses: sorted,
          globalAmean,
        });
      },
      setFilters: (updater) => {
        const filters = updater(get().filters);
        const sortMode = get().sort;
        const search = get().search;
        const filtered = filterCourses(get().courseList, filters, search);
        const sorted = sortCourses(filtered, search ? "ease" : sortMode);
        set({ filters, visibleCourses: sorted });
      },
      setSort: (sort) => {
        const filters = get().filters;
        const search = get().search;
        const filtered = filterCourses(get().courseList, filters, search);
        const sorted = sortCourses(filtered, search ? "ease" : sort);
        set({ sort, visibleCourses: sorted });
      },
      setSearch: (search) => {
        const filters = get().filters;
        const sortMode = get().sort;
        const filtered = filterCourses(get().courseList, filters, search);
        const sorted = sortCourses(filtered, search ? "ease" : sortMode);
        set({ search, visibleCourses: sorted });
      },
      resetFilters: () => {
        const sortMode = get().sort;
        const search = get().search;
        const filtered = filterCourses(get().courseList, DEFAULT_FILTERS, search);
        const sorted = sortCourses(filtered, search ? "ease" : sortMode);
        set({ filters: DEFAULT_FILTERS, visibleCourses: sorted });
      },
    }),
    {
      name: "sbueasya-state",
      partialize: (state) => ({
        filters: state.filters,
        sort: state.sort,
        search: state.search,
      }),
    },
  ),
);

