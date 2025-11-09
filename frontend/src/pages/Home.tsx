import { useEffect, useMemo, useState } from "react";
import { CourseCard } from "@/components/CourseCard";
import { TopControls } from "@/components/TopControls";
import { useCoursesStore } from "@/store/courses";
import { parseCsvFiles } from "@/lib/csv";

// Public files are placed at the site root (frontend/public)
const DEFAULT_DATA_PATHS = [
  "/classie_evaluations_with_sbc_part1.csv",
  "/classie_evaluations_with_sbc_part2.csv",
  "/classie_evaluations_with_sbc_part3.csv",
  "/classie_evaluations_with_sbc_part4.csv",
];

export const HomePage = () => {
  const { courseList, visibleCourses, loadRows } = useCoursesStore((state) => ({
    courseList: state.courseList,
    visibleCourses: state.visibleCourses,
    loadRows: state.loadRows,
  }));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      if (courseList.length > 0) return;
      setLoading(true);
      try {
        const files: File[] = [];
        for (const path of DEFAULT_DATA_PATHS) {
          const response = await fetch(path);
          if (!response.ok) throw new Error(`Failed to fetch default data: ${path}`);
          const blob = await response.blob();
          const name = path.split("/").pop() ?? "classie_evaluations_with_sbc.csv";
          files.push(new File([blob], name, { type: "text/csv" }));
        }
        const rows = await parseCsvFiles(files);
        loadRows(rows);
      } catch (error) {
        console.warn("Unable to load default dataset automatically", error);
      } finally {
        setLoading(false);
      }
    };
    void bootstrap();
  }, [courseList.length, loadRows]);

  const topTen = useMemo(() => visibleCourses.slice(0, 10), [visibleCourses]);

  if (loading && courseList.length === 0) {
    return <div className="text-sm text-foreground/60">Loading Classie Evals data…</div>;
  }

  if (courseList.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <TopControls />
        <div className="card-surface flex flex-col items-center gap-4 p-12 text-center">
          <h2 className="text-2xl font-semibold text-foreground">No data available</h2>
          <p className="max-w-xl text-sm text-foreground/60">
            The app attempts to load the packaged dataset automatically from
            <code>/classie_evaluations_with_sbc_part1.csv</code> (and related parts).
            If you see this message the default dataset could not be loaded. Please ensure
            the files are present in the `frontend/public` directory and the dev server is serving static assets.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <TopControls />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {topTen.map((course, index) => (
          <CourseCard key={course.courseCode} course={course} rank={index + 1} />
        ))}
      </section>
      {visibleCourses.length > 10 ? (
        <div className="card-surface p-6 text-sm text-foreground/50">
          Showing top 10 courses by easiness. Adjust search or filters to explore all{" "}
          <span className="text-accent">{visibleCourses.length}</span> matches.
        </div>
      ) : null}
    </div>
  );
};

