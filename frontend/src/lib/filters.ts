import type { CourseAggregate, FiltersState, SortMode } from "./types";

export const DEFAULT_FILTERS: FiltersState = {
  prefixes: [],
  sbc: [],
  includeLowCredit: false,
  seasons: [],
  years: [],
};

export function filterCourses(
  courses: CourseAggregate[],
  filters: FiltersState,
  searchQuery: string,
): CourseAggregate[] {
  const query = searchQuery.trim().toLowerCase();
  return courses.filter((course) => {
    if (!filters.includeLowCredit && course.credits < 3) return false;
    if (filters.prefixes.length > 0 && !filters.prefixes.includes(course.courseCode.split(" ")[0])) {
      return false;
    }
    if (
      filters.sbc.length > 0 &&
      !course.sbc.some((token) =>
        filters.sbc.includes(token),
      )
    ) {
      return false;
    }
  if (
    filters.seasons.length > 0 &&
    !course.seasons.some((season) => filters.seasons.includes(season))
  ) {
      return false;
    }
    if (
    filters.years.length > 0 &&
    !course.years.some((year) => filters.years.includes(year))
  ) {
      return false;
    }
    if (query.length > 0) {
      const haystack = [
        course.courseCode,
        course.courseName,
        ...Object.keys(course.instructors),
        ...course.sbc,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

export function sortCourses(courses: CourseAggregate[], mode: SortMode): CourseAggregate[] {
  const copy = [...courses];
  switch (mode) {
    case "students":
      return copy.sort((a, b) => b.totalStudents - a.totalStudents);
    case "code":
      return copy.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
    case "name":
      return copy.sort((a, b) => a.courseName.localeCompare(b.courseName));
    case "sbc":
      return copy.sort((a, b) => {
        const left = a.sbc.join(", ");
        const right = b.sbc.join(", ");
        const cmp = left.localeCompare(right);
        if (cmp !== 0) return cmp;
        return b.easeScore - a.easeScore;
      });
    case "ease":
    default:
      return copy.sort((a, b) => {
        if (b.easeScore !== a.easeScore) return b.easeScore - a.easeScore;
        if (b.totalStudents !== a.totalStudents) return b.totalStudents - a.totalStudents;
        return a.courseCode.localeCompare(b.courseCode);
      });
  }
}

export function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
}

